/**
 * The side strip's width and labels (Task 16c), as the browser computes them:
 * the width comes from a token in shell.module.css and the weight competes
 * with Mantine's UnstyledButton and the global font rules (R10). Both
 * personas, each with its own strip.
 *
 * Run: npx playwright test -c tests/e2e/playwright.config.ts side-strip
 */
import { expect, test } from '@playwright/test';
import { mockApi } from './fixtures/api';
import { DATA_FIXTURES } from './fixtures/data';
import { PERSONAS } from './fixtures/personas';

for (const persona of Object.values(PERSONAS)) {
  test(`${persona.id}: the strip is 90px wide and every strip label is bold`, async ({ page }) => {
    await mockApi(page, persona, DATA_FIXTURES);
    await page.goto('/assets');
    const strip = page.getByRole('navigation', { name: 'Main menu' });
    await expect(strip.getByRole('button', { name: 'Build' })).toBeVisible();
    await page.waitForLoadState('networkidle');

    expect(await strip.evaluate((el) => el.getBoundingClientRect().width)).toBe(90);

    const styles = await strip.locator('a, button').evaluateAll((els) =>
      els.map((el) => ({ label: el.textContent, weight: getComputedStyle(el).fontWeight, width: el.getBoundingClientRect().width })),
    );
    expect(styles.map((s) => s.label)).toEqual(expect.arrayContaining(['Discover', 'Build']));
    if (persona.id === 'admin') {
      // Every group, Settings at the bottom
      expect(styles.map((s) => s.label)).toEqual(
        expect.arrayContaining(['Discover', 'Build', 'Organization', 'Semantics', 'Workflows', 'Settings']),
      );
    } else {
      // The bottom button: Settings, or Govern without the Settings gate
      expect(styles.some((s) => s.label === 'Settings' || s.label === 'Govern'), 'bottom button').toBe(true);
    }
    for (const { label, weight, width } of styles) {
      expect(weight, `${label} weight`).toBe('700');
      // The strip less the same 2px each side as before
      expect(width, `${label} width`).toBe(86);
    }
  });
}
