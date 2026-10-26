import { defineConfig, devices } from '@playwright/test';
export default defineConfig({
  testDir: './tests/e2e', testMatch: '**/*.spec.ts', fullyParallel: false,
  workers: 1, retries: 0, timeout: 90_000,
  expect: { timeout: 15_000, toHaveScreenshot: { maxDiffPixelRatio: 0.015, threshold: 0.25, animations: 'disabled' } },
  snapshotPathTemplate: '{testDir}/baselines/{platform}/{projectName}/{arg}{ext}',
  reporter: [['list'], ['html', { outputFolder: 'playwright-report', open: 'never' }]],
  use: { baseURL: 'http://localhost:8799', trace: 'retain-on-failure', screenshot: 'only-on-failure', launchOptions: { args: ['--use-angle=swiftshader', '--enable-webgl', '--enable-unsafe-swiftshader'] } },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } } },
    { name: 'iphone-14', use: { ...devices['iPhone 14'], defaultBrowserType: 'chromium' } },
    { name: 'pixel-7', use: { ...devices['Pixel 7'] } },
  ],
  webServer: { command: 'bun tests/e2e/start.ts', url: 'http://localhost:8799/api/version', reuseExistingServer: false, timeout: 120_000 },
});
