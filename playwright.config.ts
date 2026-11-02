import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "./tests/browser",
  timeout: 180000,
  workers: 1,
  reporter: "list",
  use: {
    baseURL: "http://localhost:3002",
    viewport: { width: 1536, height: 1080 },
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
    video: { mode: "on", size: { width: 1920, height: 1080 } },
  },
  webServer: {
    command: "npm run build && npm start",
    url: "http://localhost:3002/api/health",
    timeout: 60000,
    reuseExistingServer: false,
    env: {
      PORT: "3002",
      APP_URL: "http://localhost:3002",
      NODE_ENV: "production",
      TWITCH_CLIENT_ID: "",
      TWITCH_CLIENT_SECRET: "",
    },
  },
});
