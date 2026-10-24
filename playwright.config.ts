import { defineConfig } from '@playwright/test'

/**
 * E2E nhiều thiết bị. Cần: Supabase local (`npm run db:start`), Edge Function (`npm run functions:serve`)
 * và .env.local trỏ tới chúng (xem README). Trình duyệt: Chromium của Playwright hoặc PW_CHANNEL=msedge/chrome.
 */
export default defineConfig({
  testDir: 'tests/e2e',
  timeout: 120_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1,
  reporter: [['list']],
  use: {
    baseURL: process.env.E2E_BASE_URL ?? 'http://localhost:5173',
    channel: process.env.PW_CHANNEL,
    trace: 'retain-on-failure',
  },
  webServer: process.env.E2E_BASE_URL
    ? undefined
    : {
        command: 'npm run dev -- --port 5173 --strictPort',
        url: 'http://localhost:5173',
        reuseExistingServer: true,
      },
})
