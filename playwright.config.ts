import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: 'e2e',
  webServer: {
    command: 'npm run dev -- --port 5173',
    url: 'http://localhost:5173/bricabrac/',
    reuseExistingServer: !process.env.CI,
    timeout: 60_000
  },
  use: {
    baseURL: 'http://localhost:5173/bricabrac/'
  }
});
