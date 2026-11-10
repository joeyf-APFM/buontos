/**
 * One font stack for all text (Task 16b): Optima, Candara, 'Segoe UI',
 * sans-serif on migrated pages, unmigrated pages and Mantine portals; only
 * code and identifiers stay monospace, through --aura-font-mono.
 *
 * Computed styles in a real browser, because the font is decided by the
 * cascade between Tailwind's preflight, the tw-app layer and Mantine (R10).
 *
 * Run: npx playwright test -c tests/e2e/playwright.config.ts fonts
 */
import { expect, test, type Locator, type Page } from '@playwright/test';
import { mockApi } from './fixtures/api';
import { DATA_FIXTURES } from './fixtures/data';
import { PERSONAS } from './fixtures/personas';

const OPTIMA = /^Optima, Candara, ["']Segoe UI["'], sans-serif$/;
const MONO = /^ui-monospace, Menlo, monospace$/;

const fontOf = (locator: Locator) => locator.first().evaluate((el) => getComputedStyle(el).fontFamily);

async function expectStackOn(page: Page, selectors: Record<string, string>) {
  for (const [what, selector] of Object.entries(selectors)) {
    const locator = page.locator(selector);
    await expect(locator.first(), `${what}: ${selector}`).toBeAttached();
    expect(await fontOf(locator), what).toMatch(OPTIMA);
  }
}

test.beforeEach(async ({ page }) => {
  await mockApi(page, PERSONAS.admin, DATA_FIXTURES);
});

test('a migrated page (/assets) uses the Optima stack', async ({ page }) => {
  await page.goto('/assets');
  await expect(page.locator('main input[aria-label="Filter assets"]')).toBeVisible();
  await expectStackOn(page, {
    body: 'body',
    heading: 'main h1, main h2, main h3',
    button: 'main button',
    'table header cell': 'main th',
    input: 'main input[aria-label="Filter assets"]',
    'strip label': 'nav button',
  });
});

test('an unmigrated page (/data-products) uses the Optima stack', async ({ page }) => {
  await page.goto('/data-products');
  await expect(page.locator('main h1').first()).toBeVisible();
  await page.waitForLoadState('networkidle');
  await expectStackOn(page, {
    body: 'body',
    heading: 'main h1',
    button: 'main button',
    'table cell': 'main td, main th',
    input: 'main input',
  });
});

test('text in a Mantine portal uses the Optima stack', async ({ page }) => {
  await page.goto('/assets');
  await page.locator('main input[aria-label="Status"]').click();
  const option = page.locator('[data-portal] [role="option"]:visible');
  await expect(option.first()).toBeVisible();
  expect(await fontOf(option)).toMatch(OPTIMA);
});

test('code and identifiers stay monospace', async ({ page }) => {
  // The explorer's name cells (a CSS module on the token)
  await page.goto('/assets');
  const nameCell = page.locator('main tbody tr td').first();
  await expect(nameCell).toBeVisible();
  expect(await fontOf(nameCell)).toMatch(MONO);

  // Tailwind's font-mono and a bare <code> on an unmigrated page
  await page.goto('/data-products');
  await expect(page.locator('main h1').first()).toBeVisible();
  const fonts = await page.locator('main').evaluate((main) => {
    const add = (html: string) => {
      const box = document.createElement('div');
      box.innerHTML = html;
      main.appendChild(box);
      return getComputedStyle(box.firstElementChild!).fontFamily;
    };
    return { fontMono: add('<span class="font-mono">id</span>'), code: add('<code>SELECT 1</code>') };
  });
  expect(fonts.fontMono).toMatch(MONO);
  expect(fonts.code).toMatch(MONO);
});
