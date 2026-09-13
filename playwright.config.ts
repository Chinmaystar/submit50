import { defineConfig, devices } from "@playwright/test";

/**
 * E2E suite for the running app (backend :4000, judge worker, vite :5173).
 *
 * Prereqs: Mongo + Redis up, `npm run seed` ran at least once
 * (so demo accounts exist), and the judge worker is connected to Redis.
 * Point Playwright at the vite dev server if it's already running via `dev:all`
 * (reuseExistingServer avoids starting a second copy).
 */
export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  workers: 1, // judge queue + shared Mongo: keep it serial
  retries: 0,
  timeout: 90_000,
  expect: { timeout: 20_000 },
  reporter: [["list"]],
  use: {
    baseURL: "http://localhost:5173",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
  },
  projects: [
    // Logs in as the seeded student + admin and snapshots their cookies/localStorage.
    { name: "setup", testMatch: /auth\.setup\.ts/ },
    // Unauthenticated browser: login page, redirects, guards.
    { name: "guest", dependencies: ["setup"], testMatch: /guest\.spec\.ts/ },
    { name: "student", dependencies: ["setup"], testMatch: /student\/.*\.spec\.ts/, use: { ...devices["Desktop Chrome"], storageState: ".e2e/student.json" } },
    { name: "admin", dependencies: ["setup"], testMatch: /admin\/.*\.spec\.ts/, use: { ...devices["Desktop Chrome"], storageState: ".e2e/admin.json" } },
  ],
  webServer: {
    command: "npm --prefix frontend run dev -- --port 5173",
    url: "http://localhost:5173",
    reuseExistingServer: true,
    timeout: 60_000,
  },
});