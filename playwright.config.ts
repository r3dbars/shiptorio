import { defineConfig, devices } from '@playwright/test';
const testUrl = `http://localhost:${process.env.SHIPTORIO_TEST_PORT || '8799'}`;
export default defineConfig({
  testDir: './tests/e2e', testMatch: '**/*.pw.ts', fullyParallel: false,
  workers: 1, retries: 0, timeout: 180_000,
  expect: { timeout: 30_000, toHaveScreenshot: { maxDiffPixelRatio: 0.015, threshold: 0.25, animations: 'disabled', stylePath: './tests/e2e/screenshot.css' } },
  snapshotPathTemplate: '{testDir}/baselines/{platform}/{projectName}/{arg}{ext}',
  reporter: [['list'], ['html', { outputFolder: 'playwright-report', open: 'never' }]],
  use: { baseURL: testUrl, trace: 'retain-on-failure', screenshot: 'only-on-failure' },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } } },
    { name: 'iphone-14', use: { ...devices['iPhone 14'], deviceScaleFactor: 1, defaultBrowserType: 'chromium' } },
    { name: 'pixel-7', use: { ...devices['Pixel 7'], deviceScaleFactor: 1 } },
  ],
  webServer: { command: 'bun tests/e2e/start.ts', url: `${testUrl}/api/version`, reuseExistingServer: false, timeout: 120_000 },
});
