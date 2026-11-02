import { defineConfig } from "@playwright/test";
// E2E_PORT lets a second checkout run the suite without colliding with another server.
const port = process.env.E2E_PORT || "3002";
export default defineConfig({
  testDir: "./tests/browser",
  timeout: 180000,
  workers: 1,
  reporter: "list",
  use: {
    baseURL: `http://localhost:${port}`,
    viewport: { width: 1536, height: 1080 },
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
    video: { mode: "on", size: { width: 1920, height: 1080 } },
  },
  webServer: {
    command: "npm run build && npm start",
    url: `http://localhost:${port}/api/health`,
    timeout: 60000,
    reuseExistingServer: false,
    env: {
      PORT: port,
      APP_URL: `http://localhost:${port}`,
      NODE_ENV: "production",
      TWITCH_CLIENT_ID: "",
      TWITCH_CLIENT_SECRET: "",
    },
  },
});
