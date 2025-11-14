// Parse incoming JSON message and extract cmd and args
// Returns true if parsing successful
bool parseMessage(String message, String &cmd, String &args) {
  // Simple JSON parsing for format: { "cmd": "...", "args": "..." }
  int cmdStart = message.indexOf("\"cmd\"");
  if (cmdStart == -1) return false;
  
  int cmdValueStart = message.indexOf("\"", cmdStart + 5);
  if (cmdValueStart == -1) return false;
  
  int cmdValueEnd = message.indexOf("\"", cmdValueStart + 1);
  if (cmdValueEnd == -1) return false;
  
  cmd = message.substring(cmdValueStart + 1, cmdValueEnd);
  
  // Try to find args (optional)
  int argsStart = message.indexOf("\"args\"");
  if (argsStart != -1) {
    int argsValueStart = message.indexOf("\"", argsStart + 6);
    if (argsValueStart != -1) {
      int argsValueEnd = message.indexOf("\"", argsValueStart + 1);
      if (argsValueEnd != -1) {
        args = message.substring(argsValueStart + 1, argsValueEnd);
      }
    }
  } else {
    args = "";
  }
  
  return true;
}
