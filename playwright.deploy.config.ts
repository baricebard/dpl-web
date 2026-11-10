import { defineConfig, devices } from '@playwright/test'
export default defineConfig({
  testDir: './tests/deploy-ui', fullyParallel: false, retries: 0,
  use: {
    baseURL: 'http://127.0.0.1:5174', ...devices['Desktop Chrome'],
    launchOptions: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH } : {},
  },
  webServer: { command: 'npm run deploy:local', url: 'http://127.0.0.1:5174', reuseExistingServer: false },
})
