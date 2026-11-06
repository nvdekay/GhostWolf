import { defineConfig, devices } from '@playwright/test'

/**
 * E2E nhiều thiết bị. Cần: Supabase local (`npm run db:start`), Edge Function (`npm run functions:serve`)
 * và .env.local trỏ tới chúng (xem README). Trình duyệt: Chromium của Playwright hoặc PW_CHANNEL=msedge/chrome.
 *
 * CI (hoặc E2E_FRESH=1) luôn tự khởi động dev server mới; E2E_PORT để tránh trùng server đang chạy.
 */
const port = Number(process.env.E2E_PORT ?? 5173)
const fresh = !!process.env.CI || !!process.env.E2E_FRESH

export default defineConfig({
  testDir: 'tests/e2e',
  timeout: 120_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1,
  reporter: [['list']],
  use: {
    baseURL: process.env.E2E_BASE_URL ?? `http://localhost:${port}`,
    trace: 'retain-on-failure',
  },
  projects: [
    {
      name: 'desktop-chromium',
      testIgnore: /compatibility\.spec\.ts/,
      use: { ...devices['Desktop Chrome'], channel: process.env.PW_CHANNEL },
    },
    {
      name: 'android-chromium',
      testMatch: /compatibility\.spec\.ts/,
      use: { ...devices['Pixel 7'] },
    },
    {
      name: 'ios-webkit',
      testMatch: /compatibility\.spec\.ts/,
      use: { ...devices['iPhone 15'] },
    },
  ],
  webServer: process.env.E2E_BASE_URL
    ? undefined
    : {
        command: `npm run dev -- --port ${port} --strictPort`,
        url: `http://localhost:${port}`,
        reuseExistingServer: !fresh,
      },
})
