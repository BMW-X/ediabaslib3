using System;
using System.Collections.Generic;
using static EdiabasLib.EdiabasNet;

namespace EdiabasLib
{
    //at//

    public class EdiabasNetException: Exception
    {
        public ErrorCodes ErrorCode { get; init; } = ErrorCodes.EDIABAS_ERR_NONE;
        public Dictionary<string, object> Args { get; init; } = new Dictionary<string, object>();

		public EdiabasNetException(string message, Exception innerException =null): base(message, innerException)
        { 
            
        }

        public EdiabasNetException(string message, ErrorCodes errorCode, Dictionary<string, object> args = null): base(message ?? errorCode.ToString())
        {
            ErrorCode = errorCode;
            HResult = (int)errorCode;

            if (args != null)
            {
                Args = args;
            }
        }
        
    }
}
