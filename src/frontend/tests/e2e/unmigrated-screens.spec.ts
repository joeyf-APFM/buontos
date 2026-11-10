/**
 * Screens that keep their pre-Mantine design must look the same inside the
 * new shell: Mantine's styles may not leak into them (body font, background,
 * colours, Tailwind preflight).
 *
 * Each test screenshots the routed page itself, not the shell around it, at a
 * fixed width so the old sidebar and the new strip don't change its size. The
 * viewport (playwright.config.ts) is big enough that nothing scrolls, so the
 * sticky top bar and the fixed Ask Ontos tab never overlap the page.
 * Baselines come from the UI before the Mantine shell.
 *
 * Run: npx playwright test -c tests/e2e/playwright.config.ts
 * Record baselines: add --update-snapshots
 */
import { expect, test } from '@playwright/test';
import { mockApi, unmockedRequests } from './fixtures/api';

const PAGE_WIDTH = 1000;

// The routed page is the child of <main>'s padded content, after the shell's
// breadcrumb. Under /settings that is the settings layout, whose last child
// holds the page.
const SCREENS = [
  { path: '/data-products', page: 'main > :nth-child(2) > :first-child', ready: 'main h1' },
  { path: '/data-contracts', page: 'main > :nth-child(2) > :first-child', ready: 'main h1' },
  { path: '/compliance', page: 'main > :nth-child(2) > :first-child', ready: 'main h1' },
  { path: '/settings/general', page: 'main > :nth-child(2) > :first-child > :last-child', ready: 'main h1' },
];

test.beforeEach(async ({ page }) => {
  // Compliance shows the current time
  await page.clock.setFixedTime(new Date('2026-11-09T12:00:00Z'));
  await mockApi(page);
});

test.afterAll(() => {
  if (unmockedRequests.length) {
    // eslint-disable-next-line no-console
    console.log('[unmigrated-screens] answered with []:', [...new Set(unmockedRequests)].sort());
  }
});

for (const screen of SCREENS) {
  test(`${screen.path} keeps its look`, async ({ page }) => {
    await page.goto(screen.path);
    await page.waitForLoadState('networkidle');
    await expect(page.locator(screen.ready).first()).toBeVisible();

    const content = page.locator(screen.page);
    await content.evaluate((el, width) => {
      const style = (el as HTMLElement).style;
      style.width = `${width}px`;
      style.flex = 'none';
    }, PAGE_WIDTH);
    // Let toasts, skeletons and lazy content settle
    await page.waitForTimeout(500);

    const name = screen.path.slice(1).replace(/\//g, '-') + '.png';
    await expect(content).toHaveScreenshot(name, {
      animations: 'disabled',
      caret: 'hide',
      maxDiffPixelRatio: 0.01,
    });
  });
}
