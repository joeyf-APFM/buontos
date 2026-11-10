/**
 * The side strip's width and labels (Task 16c), as the browser computes them:
 * the width comes from a token in shell.module.css and the weight competes
 * with Mantine's UnstyledButton and the global font rules (R10).
 *
 * Run: npx playwright test -c tests/e2e/playwright.config.ts side-strip
 */
import { expect, test } from '@playwright/test';
import { mockApi } from './fixtures/api';
import { DATA_FIXTURES } from './fixtures/data';
import { PERSONAS } from './fixtures/personas';

test('the strip is 90px wide and every strip label is bold', async ({ page }) => {
  await mockApi(page, PERSONAS.admin, DATA_FIXTURES);
  await page.goto('/assets');
  const strip = page.getByRole('navigation', { name: 'Main menu' });
  await expect(strip.getByRole('button', { name: 'Build' })).toBeVisible();
  await page.waitForLoadState('networkidle');

  expect(await strip.evaluate((el) => el.getBoundingClientRect().width)).toBe(90);

  const buttons = strip.locator('a, button');
  const styles = await buttons.evaluateAll((els) =>
    els.map((el) => ({ label: el.textContent, weight: getComputedStyle(el).fontWeight, width: el.getBoundingClientRect().width })),
  );
  // Every group, the assistants that are enabled, and Settings at the bottom
  expect(styles.map((s) => s.label)).toEqual(expect.arrayContaining(['Discover', 'Build', 'Organization', 'Semantics', 'Workflows', 'Settings']));
  for (const { label, weight, width } of styles) {
    expect(weight, `${label} weight`).toBe('700');
    // The strip less the same 2px each side as before
    expect(width, `${label} width`).toBe(86);
  }
});
