import { defineConfig, devices } from '@playwright/test';

const PORT = 3000;
const baseURL = `http://localhost:${PORT}`;

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: 'html',
  use: {
    baseURL,
    trace: 'on-first-retry',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: 'npm run dev',
    url: baseURL,
    // Always reuse an already-listening server rather than racing to spawn
    // a second `npm run dev` tree — under autonomous/CI-less runs (Ralph
    // loop) a missed race here piles up orphaned Next.js build workers.
    reuseExistingServer: true,
    timeout: 120_000,
  },
});
