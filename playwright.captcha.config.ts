import { defineConfig } from '@playwright/test'

const port = Number(process.env.CAPTCHA_E2E_PORT ?? 5181)

export default defineConfig({
  testDir: 'tests/e2e-captcha',
  timeout: 30_000,
  expect: { timeout: 10_000 },
  workers: 1,
  reporter: [['list']],
  use: {
    baseURL: `http://localhost:${port}`,
    channel: process.env.PW_CHANNEL,
    trace: 'retain-on-failure',
  },
  webServer: {
    command: `npm run dev -- --port ${port} --strictPort`,
    url: `http://localhost:${port}`,
    reuseExistingServer: false,
    env: {
      ...process.env,
      VITE_TURNSTILE_SITE_KEY: '1x00000000000000000000AA',
    },
  },
})
