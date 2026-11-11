/**
 * Task 13d: the Details grid in two columns, in the Asset Explorer's narrow
 * (280px) side panel, measured in a real browser (R10).
 *
 * Run: npx playwright test -c tests/e2e/playwright.config.ts details-grid
 */
import { expect, test } from '@playwright/test';
import { mockApi } from './fixtures/api';
import { DATA_FIXTURES } from './fixtures/data';
import { PERSONAS } from './fixtures/personas';

test('the Asset Explorer side panel stays one column and nothing overflows its pane', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await mockApi(page, PERSONAS.admin, DATA_FIXTURES);
  await page.goto('/assets');
  await page.getByText('main.sales.order_lines', { exact: true }).first().click();
  const aside = page.getByRole('complementary', { name: 'main.sales.order_lines' });
  await expect(aside).toBeVisible();

  // One column (owner ruling): each pair on its own row, at the full width
  const pairs = aside.locator('dl > div');
  const count = await pairs.count();
  expect(count).toBeGreaterThan(2);
  const boxes = await Promise.all(Array.from({ length: count }, async (_, i) => (await pairs.nth(i).boundingBox())!));
  for (let i = 1; i < count; i++) {
    expect(boxes[i].y, `pair ${i + 1} is below pair ${i}`).toBeGreaterThan(boxes[i - 1].y + 10);
    expect(Math.abs(boxes[i].x - boxes[0].x), `pair ${i + 1} is at the left`).toBeLessThanOrEqual(0.5);
    expect(Math.abs(boxes[i].width - boxes[0].width), `pair ${i + 1} is as wide`).toBeLessThanOrEqual(0.5);
  }
  // "Unity Catalog" stays on one line, and no value breaks mid-word
  const branch = aside.locator('dd', { hasText: 'Unity Catalog' });
  expect(await branch.evaluate((el) => el.getBoundingClientRect().height <= parseFloat(getComputedStyle(el).lineHeight) + 1)).toBe(true);
  const full = aside.locator('dd', { hasText: 'main.sales.order_lines' }).first();
  expect(await full.evaluate((el) => el.getBoundingClientRect().height <= parseFloat(getComputedStyle(el).lineHeight) + 1)).toBe(true);

  // Nothing pokes out of the pane, and the pane does not scroll sideways
  const pane = (await aside.boundingBox())!;
  for (const box of boxes) {
    expect(box.x).toBeGreaterThanOrEqual(pane.x);
    expect(box.x + box.width).toBeLessThanOrEqual(pane.x + pane.width + 0.5);
  }
  for (const el of await aside.locator('dd').all()) {
    expect(await el.evaluate((n) => n.scrollWidth <= n.clientWidth + 1)).toBe(true);
  }
  expect(await aside.evaluate((n) => n.scrollWidth <= n.clientWidth)).toBe(true);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});
