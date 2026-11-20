import { defineConfig, devices } from '@playwright/test';
import path from 'path';

const projectRoot = path.resolve(__dirname, '..');

/**
 * Playwright E2E & Load-Time Security Integrity Configuration
 * Strictly isolated in tests/ directory.
 */
export default defineConfig({
  testDir: path.resolve(__dirname),
  testMatch: ['**/*.spec.ts'],
  timeout: 45000,
  expect: {
    timeout: 10000,
  },
  fullyParallel: false,
  retries: 0,
  workers: 1,
  reporter: [
    ['list'],
    ['html', { outputFolder: path.resolve(__dirname, 'playwright-report'), open: 'never' }],
  ],
  use: {
    baseURL: 'http://127.0.0.1:3000',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    bypassCSP: false, // Ensure strict CSP enforcement during security tests
  },
  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 1440, height: 900 },
      },
    },
  ],
  webServer: [
    {
      command: 'npx next start -p 3000',
      url: 'http://127.0.0.1:3000',
      cwd: projectRoot,
      reuseExistingServer: true,
      timeout: 60000,
    },
    {
      command: 'python -m uvicorn backend.main:app --host 127.0.0.1 --port 8000',
      url: 'http://127.0.0.1:8000/health',
      cwd: projectRoot,
      reuseExistingServer: true,
      timeout: 60000,
    },
  ],
});
