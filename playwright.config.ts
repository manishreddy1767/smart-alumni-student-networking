import path from "node:path";
import { defineConfig } from "@playwright/test";

export const browserTestDatabase = path.join(
  process.env.TEMP ?? process.env.TMP ?? ".",
  `alumni-browser-${process.pid}.sqlite`
);

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  workers: 1,
  reporter: "list",
  use: {
    baseURL: "http://127.0.0.1:4000",
    headless: true,
    trace: "retain-on-failure"
  },
  webServer: {
    command: "npm start",
    url: "http://127.0.0.1:4000/api/health",
    reuseExistingServer: false,
    timeout: 120_000,
    env: {
      NODE_ENV: "production",
      PORT: "4000",
      JWT_SECRET: "browser-test-only-secret",
      CLIENT_ORIGIN: "http://127.0.0.1:4000",
      DATABASE_PATH: browserTestDatabase
    }
  }
});
