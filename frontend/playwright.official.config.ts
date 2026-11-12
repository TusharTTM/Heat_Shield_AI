import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: './e2e',
  testMatch: 'official-sources.spec.ts',
  timeout: 90000,
  expect: { timeout: 15000 },
  fullyParallel: false,
  workers: 1,
  reporter: 'list',
  use: {
    baseURL: 'http://127.0.0.1:5176/',
    headless: true,
    viewport: { width: 1440, height: 1000 },
  },
  webServer: {
    command: 'VITE_API_BASE_URL=https://backend.test npm run dev -- --port 5176 --strictPort',
    url: 'http://127.0.0.1:5176',
    reuseExistingServer: false,
    timeout: 120000,
  },
})
