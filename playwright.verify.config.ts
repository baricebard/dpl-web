import { defineConfig, devices } from '@playwright/test'
export default defineConfig({
  testDir: './tests/verify-ui', fullyParallel: false, retries: 0,
  use: {
    baseURL: 'http://127.0.0.1:5175', ...devices['Desktop Chrome'],
    launchOptions: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH } : {},
  },
  webServer: { command: 'npm run verify:local', url: 'http://127.0.0.1:5175', reuseExistingServer: false },
})
