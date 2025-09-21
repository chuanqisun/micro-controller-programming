void init_screen() {
  // give the screen some time to power up
  delay(100);

  // initialize display
  display.begin(SSD1306_SWITCHCAPVCC, SCREEN_ADDRESS);
  display.clearDisplay();
  display.display();

  // text settings
  display.setTextSize(1);
  display.setTextColor(SSD1306_WHITE);
}

// Edge list for a cube with 8 vertices [0..7]
static const uint8_t CUBE_EDGE_COUNT = 12;
static const uint8_t CUBE_EDGES[CUBE_EDGE_COUNT][2] = {
  {0, 1}, {1, 3}, {3, 2}, {2, 0}, // back square
  {4, 5}, {5, 7}, {7, 6}, {6, 4}, // front square
  {0, 4}, {1, 5}, {2, 6}, {3, 7}  // connecting edges
};

void render_screen(long zoom, long pitch, long yaw) {
  display.clearDisplay();

  // Screen center and focal length
  const int16_t cx = SCREEN_WIDTH / 2;
  const int16_t cy = SCREEN_HEIGHT / 2;
  const float focal = (float)min(SCREEN_WIDTH, SCREEN_HEIGHT); // simple focal length in pixels

  // Cube half-size scales with screen; fit comfortably
  const int16_t half = (int16_t)(min(SCREEN_WIDTH, SCREEN_HEIGHT) / 4);

  // Base cube vertices in object space (centered at origin)
  // Index layout:
  // 0:(-,-,-) 1:(+,-,-) 2:(- ,+,-) 3:(+ ,+,-)
  // 4:(-,-,+) 5:(+,-,+) 6:(- ,+,+) 7:(+ ,+,+)
  float vx[8];
  float vy[8];
  float vz[8];
  const int8_t sgn[8][3] = {
    {-1, -1, -1}, {+1, -1, -1}, {-1, +1, -1}, {+1, +1, -1},
    {-1, -1, +1}, {+1, -1, +1}, {-1, +1, +1}, {+1, +1, +1}
  };
  for (uint8_t i = 0; i < 8; ++i) {
    vx[i] = (float)(sgn[i][0] * half);
    vy[i] = (float)(sgn[i][1] * half);
    vz[i] = (float)(sgn[i][2] * half);
  }

  // Rotation angles: only use manual pitch/yaw, no auto-rotation
  const float pitchScale = 0.04f; // radians per unit
  const float yawScale   = -0.04f; // radians per unit
  const float a = pitch * pitchScale; // X (pitch)
  const float b = yaw * yawScale;     // Y (yaw)
  const float c = 0.0f;               // Z (roll) - no rotation

  const float sa = sinf(a), ca = cosf(a);
  const float sb = sinf(b), cb = cosf(b);
  const float sc = sinf(c), cc = cosf(c);

  // Apply rotation (Rz * Ry * Rx)
  for (uint8_t i = 0; i < 8; ++i) {
    float x = vx[i], y = vy[i], z = vz[i];

    // Rx
    float y1 = y * ca - z * sa;
    float z1 = y * sa + z * ca;

    // Ry
    float x2 = x * cb + z1 * sb;
    float z2 = -x * sb + z1 * cb;

    // Rz
    float x3 = x2 * cc - y1 * sc;
    float y3 = x2 * sc + y1 * cc;

    vx[i] = x3;
    vy[i] = y3;
    vz[i] = z2;
  }

  // Translate along +Z to be in front of camera and avoid z<=0
  // Zoom controls camera distance: positive zoom moves camera closer (zooms in)
  const float zoomScale = 0.5f; // sensitivity of zoom control
  const float baseCamDist = (float)(half * 3 + 16); // base camera distance
  const float minCamDist = (float)(half + 8); // minimum safe distance
  const float maxCamDist = (float)(half * 6); // maximum distance for reasonable view
  float camDist = baseCamDist - (zoom * zoomScale); // closer = larger cube
  if (camDist < minCamDist) camDist = minCamDist; // clamp to safe range
  if (camDist > maxCamDist) camDist = maxCamDist;
  for (uint8_t i = 0; i < 8; ++i) {
    vz[i] += camDist;
  }

  // Project to screen space
  int16_t px[8];
  int16_t py[8];
  const float zNear = 8.0f; // near plane
  for (uint8_t i = 0; i < 8; ++i) {
    float z = vz[i];
    if (z < zNear) z = zNear; // clamp to avoid divide-by-zero
    const float invz = 1.0f / z;
    const float sx = vx[i] * focal * invz;
    const float sy = vy[i] * focal * invz;
    px[i] = (int16_t)(cx + sx);
    py[i] = (int16_t)(cy - sy); // invert Y for screen coords
  }

  // Draw wireframe edges; skip edges with a point behind near plane
  for (uint8_t e = 0; e < CUBE_EDGE_COUNT; ++e) {
    uint8_t i0 = CUBE_EDGES[e][0];
    uint8_t i1 = CUBE_EDGES[e][1];
    if (vz[i0] <= zNear || vz[i1] <= zNear) continue; // simple near rejection
    display.drawLine(px[i0], py[i0], px[i1], py[i1], SSD1306_WHITE);
  }

  display.display();
}