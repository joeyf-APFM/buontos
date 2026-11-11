/**
 * The restyle safety net: for every page (restyle-pages.ts) and persona
 * (fixtures/personas.ts), the page must keep every control and look the same,
 * unless its baseline is re-recorded on purpose.
 *
 * - Controls: `controlInventory` of <main> must equal __controls__/<persona>/<id>.json
 *   exactly. A missing file is written from the current UI. --update-snapshots
 *   never rewrites one: to re-record an inventory, delete its file.
 * - Look: a screenshot of <main> at 1280×800, with the app's top bar hidden,
 *   must match __screenshots__/restyle/<persona>/<id>.png at a colour threshold
 *   of 0.01, within 0.2% of its pixels. Re-record with --update-snapshots, only
 *   once the inventories pass.
 * - Browser: the baselines are tied to the Chrome in __screenshots__/BROWSER.txt.
 *   Another version fails every page with "re-baseline: browser changed from X
 *   to Y" instead of a pile of pixel diffs. To move to it, re-record every page
 *   with --update-snapshots=all, which also records the new version.
 *   The baselines are macOS-only: the Optima font exists only on macOS, and any
 *   other OS falls back to Candara or Segoe UI, so every glyph would differ.
 *
 * Every /api call is answered by fixtures/api.ts; nothing reaches a backend.
 *
 * Run: npx playwright test -c tests/e2e/playwright.config.ts restyle-check
 * One page: add -g 'asset-detail'
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test } from '@playwright/test';
import { mockApi, unmockedRequests } from './fixtures/api';
import { DATA_FIXTURES } from './fixtures/data';
import { PERSONAS } from './fixtures/personas';
import { RESTYLE_PAGES, SEARCH_LIKE, SELECT_LIKE, controlInventory } from './restyle-pages';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const CONTROLS_DIR = path.join(HERE, '__controls__');
const BROWSER_FILE = path.join(HERE, '__screenshots__', 'BROWSER.txt');

/** The Chrome version the baselines were recorded with: BROWSER.txt's first line that isn't a # comment. */
function baselineBrowser(): string {
  const lines = fs.readFileSync(BROWSER_FILE, 'utf8').split('\n').map((l) => l.trim());
  return lines.find((l) => l && !l.startsWith('#')) ?? '';
}

/** Replaces BROWSER.txt's version line and keeps its comments. */
function recordBrowser(version: string) {
  const text = fs.readFileSync(BROWSER_FILE, 'utf8');
  fs.writeFileSync(BROWSER_FILE, text.replace(baselineBrowser(), version));
}

test.afterAll(() => {
  if (unmockedRequests.length) {
    // eslint-disable-next-line no-console
    console.log('[restyle-check] answered with []:', [...new Set(unmockedRequests)].sort());
  }
});

// The inventory itself, on real Mantine 8.3.18 fields (the Asset Explorer's
// filter bar) and a Radix Select (the audit trail's filter; the Data
// Catalog's moved to Mantine in Task 12)
test.describe('controlInventory', () => {
  test.beforeEach(async ({ page }) => {
    await mockApi(page, PERSONAS.admin, DATA_FIXTURES);
  });

  test('lists a Mantine Select as combobox and a Mantine TextInput as textbox', async ({ page }) => {
    await page.goto('/assets');
    const select = page.locator('main input[aria-label="Status"]');
    const textInput = page.locator('main input[aria-label="Filter assets"]');
    await expect(select).toBeVisible();
    // What Mantine renders: the Select is a text input that pops up a listbox
    await expect(select).toHaveAttribute('aria-haspopup', 'listbox');
    await expect(select).not.toHaveAttribute('role', /./);
    await expect(textInput).not.toHaveAttribute('aria-haspopup', /./);
    expect(await select.evaluate((el, sel) => el.matches(sel), SELECT_LIKE)).toBe(true);
    expect(await textInput.evaluate((el, sel) => el.matches(sel), SELECT_LIKE)).toBe(false);

    const controls = await controlInventory(page);
    expect(controls).toEqual(expect.arrayContaining([
      'combobox "Type"', 'combobox "Status"', 'combobox "Concept"', 'textbox "Filter assets"', 'treeitem "Unity Catalog 3"',
    ]));
    expect(controls).not.toContain('textbox "Status"');
    // The DOM is left as it was
    await expect(select).not.toHaveAttribute('role', /./);
    await expect(page.locator('main [data-restyle-role]')).toHaveCount(0);
  });

  test('lists a search field as searchbox, from shadcn or Mantine', async ({ page }) => {
    // shadcn Input type="search" (Marketplace)
    await page.goto('/marketplace');
    const shadcn = page.locator('main input[type="search"]');
    await expect(shadcn).toBeVisible();
    expect(await shadcn.evaluate((el, sel) => el.matches(sel), SEARCH_LIKE)).toBe(true);
    expect(await controlInventory(page)).toContain('searchbox "What can we help you find today?"');

    // A Mantine TextInput turned into type="search" (the explorer's filter),
    // with a library role on it that the inventory must override
    await page.goto('/assets');
    const mantine = page.locator('main input[aria-label="Filter assets"]');
    await expect(mantine).toBeVisible();
    await mantine.evaluate((el) => { el.setAttribute('type', 'search'); el.setAttribute('role', 'textbox'); });
    const controls = await controlInventory(page);
    expect(controls).toContain('searchbox "Filter assets"');
    expect(controls).not.toContain('textbox "Filter assets"');
    await expect(mantine).toHaveAttribute('role', 'textbox');
  });

  test('reads names that the aria snapshot quotes', async ({ page }) => {
    // The schema browser's search box is named "Search: t:catalog.schema.table",
    // which the snapshot writes as a single-quoted YAML scalar
    await page.goto('/schema-importer');
    await expect(page.locator('main input[placeholder^="Search:"]')).toBeVisible();
    expect(await controlInventory(page)).toContain('textbox "Search: t:catalog.schema.table"');
  });

  test('lists a Radix Select as combobox', async ({ page }) => {
    await page.goto('/settings/audit');
    const trigger = page.locator('main button[role="combobox"]').first();
    await expect(trigger).toBeVisible();
    const controls = await controlInventory(page);
    expect(controls.filter((c) => c.startsWith('combobox ')).length).toBeGreaterThanOrEqual(1);
    await expect(trigger).toHaveAttribute('role', 'combobox');
  });
});

for (const persona of Object.values(PERSONAS)) {
  for (const restylePage of RESTYLE_PAGES) {
    test(`${persona.id} ${restylePage.id} (${restylePage.route}) keeps its controls and look`, async ({ page, browser }, testInfo) => {
      test.skip(!!restylePage.skip, restylePage.skip);

      // A different Chrome renders text differently: say so, rather than fail on pixels
      const recorded = baselineBrowser();
      if (browser.version() !== recorded) {
        if (testInfo.config.updateSnapshots !== 'all') {
          throw new Error(`re-baseline: browser changed from ${recorded} to ${browser.version()}`);
        }
        recordBrowser(browser.version());
      }

      // Relative dates and clocks render from a fixed now
      await page.clock.setFixedTime(new Date('2026-11-09T12:00:00Z'));
      await mockApi(page, persona, DATA_FIXTURES);
      await page.goto(restylePage.route);
      await page.waitForLoadState('networkidle');
      const main = page.locator('main');
      await expect(main).toBeVisible();
      // Let toasts, skeletons and lazy content settle
      await page.waitForTimeout(500);
      // A page that crashed on its fixtures would baseline the error screen
      // (src/components/layout/route-error-boundary.tsx)
      await expect(main.getByRole('heading', { name: 'Something went wrong' })).toHaveCount(0);

      const controls = await controlInventory(page);
      const file = path.join(CONTROLS_DIR, persona.id, `${restylePage.id}.json`);
      if (fs.existsSync(file)) {
        expect(controls, `controls in ${path.relative(process.cwd(), file)}`).toEqual(
          JSON.parse(fs.readFileSync(file, 'utf8')),
        );
      } else {
        fs.mkdirSync(path.dirname(file), { recursive: true });
        fs.writeFileSync(file, JSON.stringify(controls, null, 2) + '\n');
      }

      await expect(main).toHaveScreenshot([persona.id, `${restylePage.id}.png`], {
        animations: 'disabled',
        caret: 'hide',
        // Strict enough to tell Aura's cream canvas (#FFFDF7) from white, which
        // needs a threshold under 0.0125; 0.002 is about 1,800 pixels of <main>
        threshold: 0.01,
        maxDiffPixelRatio: 0.002,
        // Hides the app's top bar
        stylePath: path.join(HERE, 'restyle-capture.css'),
      });
    });
  }
}
