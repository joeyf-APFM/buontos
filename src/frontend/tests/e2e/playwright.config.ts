import { defineConfig, devices } from '@playwright/test';

// Screenshot checks against a throwaway Vite dev server on port 3100. Every
// /api call is answered by route fixtures (see fixtures/api.ts), and the dev
// proxy points at a closed port, so nothing reaches a real backend.
// Run: npx playwright test -c tests/e2e/playwright.config.ts
const PORT = 3100;
const baseURL = `http://localhost:${PORT}`;

export default defineConfig({
  testDir: '.',
  timeout: 60_000,
  expect: { timeout: 10_000 },
  workers: 1,
  reporter: 'list',
  snapshotPathTemplate: '{testDir}/__screenshots__/{testFilePath}/{arg}{ext}',
  use: {
    baseURL,
    viewport: { width: 1800, height: 2400 },
    colorScheme: 'light',
    locale: 'en-US',
    timezoneId: 'UTC',
    contextOptions: {
      storageState: {
        cookies: [],
        origins: [{
          origin: baseURL,
          localStorage: [
            // Keep the Ask Ontos panel closed, as for a returning visitor
            { name: 'copilot-sidebar-visited', value: 'true' },
            { name: 'i18nextLng', value: 'en' },
          ],
        }],
      },
    },
  },
  // The installed Google Chrome, so the check needs no browser download
  projects: [{ name: 'chrome', use: { ...devices['Desktop Chrome'], channel: 'chrome', viewport: { width: 1800, height: 2400 } } }],
  webServer: {
    command: `npx vite --port ${PORT} --strictPort`,
    port: PORT,
    cwd: '../..', // the frontend root, where index.html is
    reuseExistingServer: !!process.env.PW_REUSE,
    env: { VITE_PROXY_TARGET: 'http://127.0.0.1:9' },
    stdout: 'pipe',
    stderr: 'pipe',
  },
});
