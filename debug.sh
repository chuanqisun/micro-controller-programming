#!/bin/bash
arduino-cli compile -b rp2040:rp2040:seeed_xiao_rp2040 "$CURRENT_FILE_PATH"
arduino-cli upload -p /dev/ttyACM0 -b rp2040:rp2040:seeed_xiao_rp2040 "$CURRENT_FILE_PATH"
arduino-cli monitor -p /dev/ttyACM0