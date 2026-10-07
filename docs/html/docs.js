/* EdiabasLib documentation behavior: theme switch, navigation drawer,
   "On this page" table of contents, heading anchors, copy buttons, and
   lightweight syntax highlighting. No external dependencies. */
(function () {
  'use strict';

  var root = document.documentElement;
  var THEME_KEY = 'edlib-theme';

  function readTheme() {
    try { return localStorage.getItem(THEME_KEY); } catch (e) { return null; }
  }

  function isDark() {
    var set = root.getAttribute('data-theme');
    if (set) { return set === 'dark'; }
    return window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
  }

  function initTheme() {
    var button = document.querySelector('.theme-toggle');
    if (!button) { return; }
    button.addEventListener('click', function () {
      var next = isDark() ? 'light' : 'dark';
      root.setAttribute('data-theme', next);
      try { localStorage.setItem(THEME_KEY, next); } catch (e) { /* storage unavailable */ }
    });
  }

  function initNavDrawer() {
    var toggle = document.querySelector('.nav-toggle');
    var scrim = document.querySelector('.nav-scrim');
    if (!toggle) { return; }
    function setOpen(open) {
      document.body.classList.toggle('nav-open', open);
      toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
    }
    toggle.addEventListener('click', function () {
      setOpen(!document.body.classList.contains('nav-open'));
    });
    if (scrim) { scrim.addEventListener('click', function () { setOpen(false); }); }
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') { setOpen(false); }
    });
  }

  function headingText(heading) {
    var clone = heading.cloneNode(true);
    var extras = clone.querySelectorAll('.heading-anchor, .badge');
    for (var i = 0; i < extras.length; i++) { extras[i].remove(); }
    return clone.textContent.trim();
  }

  function initToc() {
    var toc = document.querySelector('.toc');
    var article = document.querySelector('article');
    if (!toc || !article) { return; }
    var headings = article.querySelectorAll('h2[id], h3[id]');
    if (headings.length < 2) { return; }

    var title = document.createElement('p');
    title.className = 'toc-title';
    title.textContent = 'On this page';
    var list = document.createElement('ul');
    var links = [];

    for (var i = 0; i < headings.length; i++) {
      var h = headings[i];
      var item = document.createElement('li');
      var link = document.createElement('a');
      link.href = '#' + h.id;
      link.textContent = headingText(h);
      link.className = h.tagName === 'H3' ? 'depth-3' : 'depth-2';
      item.appendChild(link);
      list.appendChild(item);
      links.push(link);

      var anchor = document.createElement('a');
      anchor.className = 'heading-anchor';
      anchor.href = '#' + h.id;
      anchor.setAttribute('aria-label', 'Link to this section: ' + link.textContent);
      anchor.textContent = '#';
      h.appendChild(anchor);
    }
    toc.appendChild(title);
    toc.appendChild(list);

    function update() {
      var offset = 140;
      var current = 0;
      for (var j = 0; j < headings.length; j++) {
        if (headings[j].getBoundingClientRect().top - offset <= 0) { current = j; }
      }
      var atBottom = window.innerHeight + window.scrollY >= document.body.scrollHeight - 4;
      if (atBottom) { current = headings.length - 1; }
      for (var k = 0; k < links.length; k++) {
        links[k].classList.toggle('active', k === current);
      }
    }
    var scheduled = false;
    window.addEventListener('scroll', function () {
      if (scheduled) { return; }
      scheduled = true;
      window.requestAnimationFrame(function () { scheduled = false; update(); });
    }, { passive: true });
    update();
  }

  var COPY_ICON = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M16 1H4a2 2 0 0 0-2 2v14h2V3h12V1zm3 4H8a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h11a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2zm0 16H8V7h11v14z"/></svg>';
  var DONE_ICON = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 16.2 4.8 12l-1.4 1.4L9 19 21 7l-1.4-1.4z"/></svg>';

  function copyText(text) {
    if (navigator.clipboard && window.isSecureContext) {
      return navigator.clipboard.writeText(text);
    }
    return new Promise(function (resolve, reject) {
      var area = document.createElement('textarea');
      area.value = text;
      area.setAttribute('readonly', '');
      area.style.position = 'fixed';
      area.style.opacity = '0';
      document.body.appendChild(area);
      area.select();
      var ok = false;
      try { ok = document.execCommand('copy'); } catch (e) { ok = false; }
      document.body.removeChild(area);
      if (ok) { resolve(); } else { reject(new Error('copy failed')); }
    });
  }

  function initCopyButtons() {
    var blocks = document.querySelectorAll('article pre');
    for (var i = 0; i < blocks.length; i++) {
      (function (pre) {
        if (pre.parentNode.classList.contains('diagram')) { return; }
        var wrap = document.createElement('div');
        wrap.className = 'code-block';
        pre.parentNode.insertBefore(wrap, pre);
        wrap.appendChild(pre);
        var button = document.createElement('button');
        button.type = 'button';
        button.className = 'icon-button copy-button';
        button.setAttribute('aria-label', 'Copy code sample');
        button.title = 'Copy code sample';
        button.innerHTML = COPY_ICON;
        button.addEventListener('click', function () {
          copyText(pre.textContent).then(function () {
            button.classList.add('copied');
            button.innerHTML = DONE_ICON;
            setTimeout(function () {
              button.classList.remove('copied');
              button.innerHTML = COPY_ICON;
            }, 1500);
          }, function () { /* clipboard unavailable */ });
        });
        wrap.appendChild(button);
      })(blocks[i]);
    }
  }

  /* Each grammar is one regular expression. Capture group order gives the
     token class: 1 comment, 2 string, 3 keyword, 4 type, 5 literal. */
  var CLASSES = ['com', 'str', 'kwd', 'typ', 'lit'];
  var CSHARP_KEYWORDS = 'abstract|as|async|await|base|bool|break|byte|case|catch|char|class|const|continue|default|do|double|else|enum|false|finally|for|foreach|get|if|in|init|int|interface|internal|is|lock|long|namespace|new|null|object|out|override|params|private|protected|public|readonly|ref|return|set|static|string|switch|this|throw|true|try|typeof|uint|using|var|virtual|void|when|while';
  var GRAMMARS = {
    csharp: new RegExp(
      '(\\/\\/[^\\n]*|\\/\\*[\\s\\S]*?\\*\\/)' +
      '|([$@]*"(?:[^"\\\\\\n]|\\\\.)*"|\'(?:[^\'\\\\\\n]|\\\\.)\')' +
      '|\\b(' + CSHARP_KEYWORDS + ')\\b' +
      '|\\b([A-Z][A-Za-z0-9_]*)\\b' +
      '|\\b(0x[0-9A-Fa-f]+|\\d+(?:\\.\\d+)?)\\b', 'g'),
    xml: /(<!--[\s\S]*?-->)|("[^"\n]*")|(<\/?[\w:.-]+|<\?[\w-]+|\/?>|\?>)|([\w:.-]+(?==))|()/g,
    ini: /(^[ \t]*[;#][^\n]*)|()|(^\[[^\]\n]*\])|(^[^=\n\[;#]+(?==))|()/gm,
    shell: /((?:^|\s)#[^\n]*|^rem [^\n]*)|("[^"\n]*")|()|()|()/gm
  };

  function escapeHtml(text) {
    return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  function initHighlighting() {
    var blocks = document.querySelectorAll('pre code[class*="language-"]');
    for (var i = 0; i < blocks.length; i++) {
      var code = blocks[i];
      var match = /language-([a-z]+)/.exec(code.className);
      var grammar = match && GRAMMARS[match[1]];
      if (!grammar) { continue; }
      var text = code.textContent;
      var out = '';
      var last = 0;
      var m;
      grammar.lastIndex = 0;
      while ((m = grammar.exec(text)) !== null) {
        if (m[0].length === 0) { grammar.lastIndex++; continue; }
        var cls = null;
        for (var g = 1; g <= CLASSES.length; g++) {
          if (m[g]) { cls = CLASSES[g - 1]; break; }
        }
        out += escapeHtml(text.slice(last, m.index));
        out += cls ? '<span class="hl-' + cls + '">' + escapeHtml(m[0]) + '</span>' : escapeHtml(m[0]);
        last = m.index + m[0].length;
      }
      out += escapeHtml(text.slice(last));
      code.innerHTML = out;
    }
  }

  function init() {
    var stored = readTheme();
    if (stored && !root.getAttribute('data-theme')) { root.setAttribute('data-theme', stored); }
    initTheme();
    initNavDrawer();
    initHighlighting();
    initCopyButtons();
    initToc();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
