# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this repo is

A .NET reimplementation of the BMW/VAG **EDIABAS** diagnostic toolset. The core library (`EdiabasLib.dll`) is an interpreter that loads `.GRP` / `.PRG` ECU files (BEST/1 bytecode) and executes diagnostic jobs against a vehicle bus via various physical/logical interfaces (D-CAN, K-Line, BMW-FAST, KWP2000/1281, TP2.0, DS1/DS2, ISO9141, etc.). It targets emulation of EDIABAS **7.6.0** (see `CompatMode` config knob for 7.3.0 compatibility).

The "API" projects (`Api32`, `apiNET`, `ApiInternal`) are **binary-compatible drop-in replacements** for the original `api32.dll` / `apiNET32.dll`. They are intended to be dropped on top of an existing Tool32 / INPA / Rheingold install — applications using the original library keep working. The fork point from EDIABAS is `EDIABAS.INI` → [EdiabasLib.config](EdiabasLib/EdiabasLib/EdiabasLib.config) (same directory as the DLL).

The wider Deep OBD Android app lives in the **sibling** repo `BmwDeepObd` (one level up from `Ediabaslib3`). The Android-targeted `.cs` files in this repo (suffix `Android.cs`, plus the BLE GATT SPP and `EdiabasLibAndroidNet` project) compile **only** into the Android builds consumed by Deep OBD — they are excluded from the desktop `EdiabasLib.csproj` via `<Compile Remove="...Android.cs" />`.

## Solution / project layout

Open [EdiabasLib/EdiabasLib.sln](EdiabasLib/EdiabasLib.sln). Key projects:

- **`EdiabasLib/`** — Core managed library. Multi-targets `net10.0-windows`, `net8.0-windows`, `net9.0`. The interpreter, all `EdInterface*` interface handlers, ELM327 / FTDI / Bluetooth / ENET transports, simulation file engine, TLS for DoIP, trace/log subsystem.
- **`Api32/`** — Managed-C++ (`/clr`) shim that exports the EDIABAS C ABI as `Api32.dll` (Win32) / `Api64.dll` (x64). Forwards into `ApiInternal`. Built with `v143` (x64) / `v145` (Win32) toolset.
- **`ApiInternal/`** — The actual `__apiJob` etc. implementation, multi-targets `net8.0-windows` + `net10.0-windows`. Strong-named.
- **`apiNET/`** — `net481` wrapper that exposes the EDIABAS public .NET API (`apiNET32.dll` replacement, AssemblyVersion `7.6.0.500`). References `ApiInternal`.
- **`EdiabasTest/`** — `net481` console app for testing jobs against ECU files. Uses `NDesk.Options` for parsing. **This is how you run jobs from the command line** — see [docs/EdiabasTest_parameters.md](docs/EdiabasTest_parameters.md).
- **`EdiabasLibConfigTool/`** — WinForms tool (x86, `net10.0-windows`) for adapter configuration (Bluetooth pairing, ELM327 firmware update, WiFi setup).
- **`IfhLog/`** — C++/CLI replacement for `ifhsrv32.dll` (interface handler trace logging).
- **`Test/EdiabasLibCall/`, `Test/EdiabasCall/`** — Sample callers (used by `Test/Scripts/coverage.bat`).
- **`EdiabasLibAndroidNet/`** — Android target (`net10.0-android36.1`). Links the same `.cs` files plus the `*Android.cs` variants and BLE GATT SPP code. Consumed by the `BmwDeepObd` repo.

## Building

```powershell
# Restore + build the full solution (desktop targets)
dotnet build EdiabasLib\EdiabasLib.sln -c Release

# Build just the core library, single TFM
dotnet build EdiabasLib\EdiabasLib\EdiabasLib.csproj -c Release -f net10.0-windows10.0.26100.0

# Build the Android library (requires Android workload installed)
dotnet build EdiabasLib\EdiabasLibAndroidNet\EdiabasLibAndroidNet.csproj -c Release
```

`Api32.vcxproj` requires Visual Studio with the C++/CLI toolset (v143 for x64, v145 for Win32); it does **not** build with `dotnet build` alone — use `msbuild` or VS for the C++/CLI shim.

The `EdiabasLib` project has a custom MSBuild step ([Directory.Build.targets](EdiabasLib/EdiabasLib/Directory.Build.targets)) that **embeds NuGet dependency DLLs as resources** (BouncyCastle, Newtonsoft.Json, InTheHand Bluetooth, System.IO.Ports) so the runtime `EdiabasLib.dll` is self-contained when dropped into a host application's folder. If you add a new `PackageReference`, mirror it in `Directory.Build.targets` if it must travel with the DLL. `BLUETOOTH` is added to `DefineConstants` globally there.

## Running tests / jobs

There is no MSTest/xUnit test project — testing is end-to-end against ECU files via the `EdiabasTest` console app, often driven through OpenCover. The canonical script is [Test/Scripts/coverage.bat](EdiabasLib/Test/Scripts/coverage.bat):

```cmd
rem Prereqs: CarSimulator running with e61.txt; ECU files under <repo>/Ecu;
rem            OpenCover + ReportGenerator on %OPENCOVER_PATH% / %REPORTGENERATOR_PATH%.
coverage lib  STD:OBD  COM4              rem run via core EdiabasLib directly
coverage apilib STD:OBD COM4             rem run via apiNET wrapper
coverage ediabas ENET                    rem run via original EDIABAS for comparison
```

Single ad-hoc job invocation (example from the docs):

```cmd
EdiabasTest.exe -p "COM4" --cfg="IfhTrace=2" -s "Ecu\d_motor.grp" ^
    -j "FS_LESEN" -j "FS_LESEN_DETAIL#0x4232#F_ART_ANZ;F_UW_ANZ" ^
    -j "STATUS_RAILDRUCK_IST##STAT_RAILDRUCK_IST_WERT"
```

Job string format: `<job name>#<params ; separated>#<requested results ; separated>#<standard params ; separated>`. Prefix binary params with `|` (e.g. `|A3C2`). Full flag reference: [docs/EdiabasTest_parameters.md](docs/EdiabasTest_parameters.md).

## Architecture: how a job runs

```
host app  ──►  Api32.dll / apiNET32.dll          (binary-compatible shim, optional)
                       │
                       ▼
              EdiabasLib.EdiabasNet              (the interpreter)
               │   ResolveSgbdFile(...)          ← loads .GRP/.PRG bytecode
               │   ExecuteJob(jobName)           ← dispatches BEST/1 opcodes
               │
               │   EdInterfaceClass property
               ▼
           EdInterfaceBase  (abstract)
            │
            ├── EdInterfaceObd   (serial / FTDI / Bluetooth / WiFi via EdElmInterface, EdBluetoothInterface, EdCustomWiFiInterface)
            │     ├── EdInterfaceAds   (ADS adapter)
            │     └── EdInterfaceEdic  (EDIC adapter)
            ├── EdInterfaceEnet  (HSFZ + DoIP over Ethernet/WiFi — also handles ICOM)
            │     └── EdInterfaceRplus  (RemotePLUS protocol over ENET, used for ICOM_P)
            └── (simulation mode)  → EdSimFile / EdSimInterface  using "<sgbd>.sim" files
```

Important "big picture" pieces a fresh contributor needs to know:

- **[EdiabasNet.cs](EdiabasLib/EdiabasLib/EdiabasNet.cs)** is the BEST/1 VM. It is split across two `partial class` files — `EdiabasNet.cs` (core data structures, file loading, job resolution, formatting, traces) and **[EdOperations.cs](EdiabasLib/EdiabasLib/EdOperations.cs)** (every individual BEST/1 opcode: `OpA2Fix`, `OpA2Flt`, math/string/IO ops, …). When adding/fixing an opcode, edit `EdOperations.cs`; when changing the interpreter loop, registers, results, or trace, edit `EdiabasNet.cs`.
- **Public surface**: callers go through `EdiabasNet.ResolveSgbdFile(file)` → set/get `JobName`, `ArgString`/`ArgBinary` etc. via properties → `ExecuteJob(jobName)` → read result sets. The selected transport is plugged in via the `EdInterfaceClass` property before resolving.
- **Error reporting**: `EdiabasNet.SetError(...)` / `RaiseError(...)` produce **`EdiabasNetException`** ([EdiabasNetException.cs](EdiabasLib/EdiabasLib/EdiabasNetException.cs)) with a typed `ErrorCodes` enum value and a `Dictionary<string,object> Args` for contextual data. This was refactored from a nested class in the most recent commit (`2a6186bc8`); prefer the top-level exception type when raising or catching ECU/interpreter errors. `HResult` is set to `(int)errorCode` so unmanaged callers via `Api32.dll` see the matching EDIABAS error number.
- **`CompatMode`** config property (default `1`) keeps EDIABAS 7.3.0 behaviour for math ops; set to `0` to use 7.6.0 semantics (some older ECU files break under 7.6.0). Several opcodes in `EdOperations.cs` branch on `IsMinVersion760`.
- **Trace files**: `ApiTrace` / `IfhTrace` config values (0–3) emit `api.log` / `ifh.log` under `TracePath` (default `./Trace`, fallback `%LocalAppData%\EdiabasLib\Trace`). The trace format matches original EDIABAS so logs can be diffed against the reference implementation. On Android, `COMPRESS_TRACE` is auto-defined and writes gzipped traces.
- **Simulation mode**: when no real transport is configured, a `<sgbd>.sim` file (text dump of request/response pairs) is played back via `EdSimFile`. This is how unit-style tests in `coverage.bat` exercise the interpreter without hardware. Format reference: [docs/EdiabasLib.simulation_file.md](docs/EdiabasLib.simulation_file.md).
- **ENET specifics** ([EdInterfaceEnet.cs](EdiabasLib/EdiabasLib/EdInterfaceEnet.cs)) handles both BMW **HSFZ** (legacy, ports 6801/6811) and **DoIP** (port 13400). Vehicle discovery uses subnet broadcast (`EnetHostIdentService`). For BMW **ICOM**, the diag/control ports come from the ICOM web UI; the `RPLUS` IFH (`EdInterfaceRplus`) tunnels through ICOM_P at port 6801.

## Conditional compilation

The same `.cs` files are linked into both desktop and Android projects. Branch on:

- **`#if ANDROID`** — auto-defined by the .NET Android SDK target framework. Used heavily in `EdiabasNet.cs` for `android.util.Log` calls, gzipped traces, etc. Also gates desktop-only file IO and assembly-resource loading.
- **`#if !ANDROID` → `#define USE_SERIAL_PORT`** at the top of `EdInterfaceObd.cs` — desktop uses `System.IO.Ports`; Android takes the FTDI/Bluetooth path.
- **`#if BLUETOOTH`** — defined in `Directory.Build.targets`. Currently used inside `EdBluetoothInterface.cs` to gate desktop Bluetooth SPP/BLE code paths.

When editing a file with `#if ANDROID`, build the Android project too (don't just trust the desktop build).

## Conventions worth knowing

- **Target frameworks**: .NET Framework 4.x targets were dropped in the most recent commit. The codebase is .NET 8 / 9 / 10 only for the core library; `apiNET464` / `EdiabasTest` / `Api32` C++/CLI still target `net481` for binary-compatibility with the original EDIABAS DLL footprint. Don't reintroduce `net48`/`net481` to the core `EdiabasLib.csproj`.
- `EdiabasLib` and `ApiInternal` are strong-named via `EdiabasLib.snk` / `ApiInternal.snk` (same as original EDIABAS for drop-in compatibility). Don't break signing.
- `Nullable` is **disabled** project-wide. Don't add `?`-annotations or `[NotNull]` attributes to fit a nullable-aware style.
- Use `EdValueType` (`UInt32`) and `EdFloatType` (`Double`) — they are namespace aliases declared at the top of `EdiabasNet.cs` / `EdOperations.cs`. Don't replace them with the underlying types.
- Encoding for ECU result strings is **Windows-1252** (`Encoding.GetEncoding(1252)`); `EdiabasTest.Program.Main` registers `CodePagesEncodingProvider` on .NET Core targets — keep that call if you touch the entry point.
- The `LogfileConverter` and `S29CertGenerator` referenced by `CreateReleasePackage.bat` live under `../Tools/`, **outside this submodule**.

## Useful docs

Primary references (not code) live under [docs/](docs):

- [docs/Documentation.md](docs/Documentation.md) — table of contents.
- [docs/EdiabasLib.config_file.md](docs/EdiabasLib.config_file.md) — every supported config key (`Interface`, `ObdComPort`, `EnetRemoteHost`, ICOM settings, BLE / WiFi adapter strings, …).
- [docs/EDIABAS_result_types_and_formats.md](docs/EDIABAS_result_types_and_formats.md) — result type table and `-f` format string syntax used by `EdiabasTest -f`.
- [docs/AdapterTypes.md](docs/AdapterTypes.md), [docs/Replacement_firmware_for_ELM327.md](docs/Replacement_firmware_for_ELM327.md) — hardware adapter background.
