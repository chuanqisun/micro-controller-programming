void send_serial_data(long zoom, long pitch, long yaw) {
  // Send data in JSON format for easy parsing
  Serial.print("{\"zoom\":");
  Serial.print(zoom);
  Serial.print(",\"pitch\":");
  Serial.print(pitch);
  Serial.print(",\"yaw\":");
  Serial.print(yaw);
  Serial.println("}");
}