// Handle move_servo command
// Args format: "servo_id,angle" e.g., "5,12"
void handle_move_servo(String cmd, String args) {
  if (cmd != "move_servo") return;
  
  if (args.length() == 0) {
    Serial.println("Error: move_servo requires args");
    return;
  }
  
  // Parse servo_id and angle from args
  int commaIndex = args.indexOf(',');
  if (commaIndex == -1) {
    Serial.println("Error: move_servo args must be 'servo_id,angle'");
    return;
  }
  
  int servoId = args.substring(0, commaIndex).toInt();
  int angle = args.substring(commaIndex + 1).toInt();
  
  Serial.println("Moving servo " + String(servoId) + " to angle " + String(angle));
  
  // TODO: Implement actual servo movement logic here
  // Example: servo[servoId].write(angle);
}
