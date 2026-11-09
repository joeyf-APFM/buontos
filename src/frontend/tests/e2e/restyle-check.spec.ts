/**
 * The restyle safety net: for every page (restyle-pages.ts) and persona
 * (fixtures/personas.ts), the page must keep every control and look the same,
 * unless its baseline is re-recorded on purpose.
 *
 * - Controls: `controlInventory` of <main> must equal __controls__/<persona>/<id>.json
 *   exactly. A missing file is written from the current UI. --update-snapshots
 *   never rewrites one: to re-record an inventory, delete its file.
 * - Look: a screenshot of <main> at 1280×800, with the app's top bar hidden,
 *   must match __screenshots__/restyle/<persona>/<id>.png within 1% of its pixels.
 *   Re-record with --update-snapshots, only once the inventories pass.
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
import { RESTYLE_PAGES, controlInventory } from './restyle-pages';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const CONTROLS_DIR = path.join(HERE, '__controls__');

test.afterAll(() => {
  if (unmockedRequests.length) {
    // eslint-disable-next-line no-console
    console.log('[restyle-check] answered with []:', [...new Set(unmockedRequests)].sort());
  }
});

for (const persona of Object.values(PERSONAS)) {
  for (const restylePage of RESTYLE_PAGES) {
    test(`${persona.id} ${restylePage.id} (${restylePage.route}) keeps its controls and look`, async ({ page }) => {
      test.skip(!!restylePage.skip, restylePage.skip);

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
        maxDiffPixelRatio: 0.01,
        // Hides the app's top bar
        stylePath: path.join(HERE, 'restyle-capture.css'),
      });
    });
  }
}
