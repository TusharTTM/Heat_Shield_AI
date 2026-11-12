import { defineConfig } from '@playwright/test'

const externalBaseURL = process.env.PLAYWRIGHT_BASE_URL
const baseURL = `${(externalBaseURL || 'http://127.0.0.1:5173').replace(/\/$/, '')}/`

export default defineConfig({
  testDir: './e2e',
  testMatch: 'live-weather.spec.ts',
  timeout: 90000,
  expect: { timeout: 15000 },
  fullyParallel: false,
  workers: 1,
  reporter: 'list',
  use: {
    baseURL,
    headless: true,
    viewport: { width: 1440, height: 1000 },
  },
  webServer: externalBaseURL ? undefined : {
    command: 'npm run dev -- --port 5173',
    url: 'http://127.0.0.1:5173',
    reuseExistingServer: true,
    timeout: 120000,
  },
})
