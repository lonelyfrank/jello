import { defineConfig, devices } from '@playwright/test';

/** Private dev-only fixture. The production preview deliberately cannot serve it. */
export default defineConfig({
  testDir: 'tests/e2e', testMatch: 'jelly.spec.ts', timeout: 30_000, workers: 1,
  reporter: [['list'], ['json', { outputFile: 'test-results/jelly-results.json' }]],
  use: { baseURL: 'http://127.0.0.1:4178', viewport: { width: 1400, height: 1100 }, deviceScaleFactor: 1, trace: 'retain-on-failure' },
  webServer: { command: 'npm run dev -- --host 127.0.0.1 --port 4178', url: 'http://127.0.0.1:4178/tests/fixtures/jelly/', reuseExistingServer: true },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'], viewport: { width: 1400, height: 1100 } } },
    { name: 'firefox', use: { ...devices['Desktop Firefox'], viewport: { width: 1400, height: 1100 } } },
  ],
});
