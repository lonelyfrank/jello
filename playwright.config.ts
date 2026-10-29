import { defineConfig, devices } from '@playwright/test';

/**
 * Engines run headless on the development machine. Results describe these
 * builds and this environment only: mobile projects are viewport/touch
 * emulation, never a real phone or Android WebView.
 */
export default defineConfig({
  testDir: 'tests/e2e',
  timeout: 60_000,
  fullyParallel: false,
  workers: 2,
  reporter: [['list'], ['json', { outputFile: 'test-results/results.json' }]],
  use: {
    baseURL: 'http://127.0.0.1:4173/',
    viewport: { width: 1280, height: 860 },
    deviceScaleFactor: 1,
    trace: 'retain-on-failure',
  },
  webServer: {
    command: 'npx vite build && npx vite preview --host 127.0.0.1 --port 4173 --strictPort',
    url: 'http://127.0.0.1:4173/',
    reuseExistingServer: true,
    timeout: 120_000,
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 860 }, deviceScaleFactor: 1 } },
    { name: 'firefox', use: { ...devices['Desktop Firefox'], viewport: { width: 1280, height: 860 }, deviceScaleFactor: 1 } },
    { name: 'webkit', use: { ...devices['Desktop Safari'], viewport: { width: 1280, height: 860 }, deviceScaleFactor: 1 } },
    // Emulated Pixel 7 viewport (412×915, DPR 2.625, touch) on desktop Chromium.
    { name: 'mobile-emulated', use: { ...devices['Pixel 7'] } },
  ],
});
