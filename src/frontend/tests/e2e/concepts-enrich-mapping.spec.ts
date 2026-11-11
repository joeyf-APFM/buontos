/**
 * Wave 2 Task 14: Enrich (/concepts/enrich) and Term Mapping
 * (/concepts/mapping) on the page kit, measured in a real browser (ruling
 * R10). The kit header and panes at the kit sizes; long scheme, concept,
 * asset and run names truncating with a title or wrapping, with no
 * horizontal page scroll, and a wide coverage matrix scrolling inside its
 * pane (Review Focus 1); the runs error with Retry (Review Focus 2). The
 * dialogs are in concepts-enrich-mapping-dialogs.spec.ts.
 *
 * CAPTURE=before|after also saves images of the pages to
 * .superpowers/sdd/2026-11-10-mantine-restyle-wave-2/task-14-images/.
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test, type Locator, type Page } from '@playwright/test';
import { mockApi } from './fixtures/api';
import { DATA_FIXTURES } from './fixtures/data';
import { ENRICH_MAPPING_FIXTURES, LONG_NAME, UNBROKEN, routeRuns } from './fixtures/enrich-mapping';
import { PERSONAS, type Persona } from './fixtures/personas';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const IMAGES = path.resolve(HERE, '../../../../.superpowers/sdd/2026-11-10-mantine-restyle-wave-2/task-14-images');
const CAPTURE = process.env.CAPTURE;

const NAVY = 'rgb(31, 48, 102)';

const style = (loc: Locator, props: string[]) =>
  loc.evaluate((el, names) => {
    const cs = getComputedStyle(el);
    return Object.fromEntries(names.map((n) => [n, cs.getPropertyValue(n)]));
  }, props);

const noPageScroll = (page: Page) =>
  page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);

/** Whether `inner` ends inside `outer`, to the pixel. */
async function inside(inner: Locator, outer: Locator) {
  const i = (await inner.boundingBox())!;
  const o = (await outer.boundingBox())!;
  return i.x >= o.x - 1 && i.x + i.width <= o.x + o.width + 1;
}

async function setUp(page: Page, route: string, persona: Persona = PERSONAS.admin, width = 1280) {
  await page.setViewportSize({ width, height: 800 });
  await page.clock.setFixedTime(new Date('2026-11-09T12:00:00Z'));
  await mockApi(page, persona, { ...DATA_FIXTURES, ...ENRICH_MAPPING_FIXTURES });
  await routeRuns(page);
  await page.goto(route);
}

async function capture(page: Page, name: string) {
  if (!CAPTURE) return;
  await page.mouse.move(0, 0);
  await page.waitForTimeout(400);
  await page.screenshot({ path: path.join(IMAGES, `${name}-${CAPTURE}.png`), animations: 'disabled', caret: 'hide' });
}

const main = (page: Page) => page.locator('main');

test.describe('captures', () => {
  test('captures both pages', async ({ page }) => {
    test.skip(!CAPTURE, 'only with CAPTURE=before|after');
    await setUp(page, '/concepts/enrich');
    await expect(main(page).getByText('Finance', { exact: true })).toBeVisible();
    await capture(page, 'enrich');
    await page.setViewportSize({ width: 900, height: 800 });
    await capture(page, 'enrich-narrow');
    await setUp(page, '/concepts/mapping');
    await main(page).getByRole('button', { name: /1aaaaaaa/ }).click();
    await expect(main(page).getByText('Sources of suggestions')).toBeVisible();
    await capture(page, 'term-mapping');
  });
});

test.describe('concepts-enrich', () => {
  test('the kit header, the platform field and the Map and Deliver panes, at the kit sizes', async ({ page }) => {
    await setUp(page, '/concepts/enrich');
    const title = main(page).getByRole('heading', { level: 1, name: 'Enrich' });
    await expect(title).toBeVisible();
    expect(await style(title, ['font-size', 'color'])).toEqual({ 'font-size': '16px', color: NAVY });

    const map = main(page).getByRole('region', { name: 'Map' });
    const deliver = main(page).getByRole('region', { name: 'Deliver' });
    await expect(map).toBeVisible();
    await expect(deliver).toBeVisible();
    for (const pane of [map, deliver]) {
      expect(await style(pane, ['border-left-width', 'box-shadow'])).toEqual({ 'border-left-width': '1px', 'box-shadow': 'none' });
    }
    expect(await style(map, ['border-top-width'])).toEqual({ 'border-top-width': '1px' });
    // Stacked, sharing a border
    const m = (await map.boundingBox())!;
    const d = (await deliver.boundingBox())!;
    expect(Math.abs(m.y + m.height - d.y)).toBeLessThan(2);

    // The platform field is a named Select at the control height
    const platform = main(page).getByRole('textbox', { name: 'Deliver to' });
    await expect(platform).toHaveValue('Databricks, Unity Catalog');
    expect((await platform.boundingBox())!.height).toBeLessThanOrEqual(28);
    await expect(map.getByRole('button', { name: 'Suggest matches' })).toBeVisible();
    expect((await map.getByRole('button', { name: 'Suggest matches' }).boundingBox())!.height).toBeLessThanOrEqual(28);

    // Tooltips open on focus too
    await main(page).getByRole('button', { name: /^Delivery platforms come from/ }).focus();
    await expect(page.getByRole('tooltip')).toBeVisible();
    expect(await noPageScroll(page)).toBe(true);
  });

  test('long scheme names truncate with a title, and a wide matrix scrolls inside its pane', async ({ page }) => {
    await setUp(page, '/concepts/enrich');
    const map = main(page).getByRole('region', { name: 'Map' });
    for (const name of [LONG_NAME, UNBROKEN]) {
      const cell = map.getByText(name, { exact: true });
      await expect(cell).toHaveAttribute('title', name);
      expect(await style(cell, ['text-overflow', 'white-space'])).toEqual({ 'text-overflow': 'ellipsis', 'white-space': 'nowrap' });
      expect(await inside(cell, map)).toBe(true);
    }
    expect(await noPageScroll(page)).toBe(true);

    // A narrow window: the matrix scrolls sideways in its own frame, the page doesn't
    await page.setViewportSize({ width: 760, height: 800 });
    // The table's own scrolling frame (the shared DataTable's)
    const frame = map.locator('table').locator('xpath=ancestor::div[1]');
    await expect.poll(() => frame.evaluate((el) => el.scrollWidth > el.clientWidth)).toBe(true);
    expect(await style(frame, ['overflow-x'])).toEqual({ 'overflow-x': 'auto' });
    expect(await inside(frame, map)).toBe(true);
    expect(await noPageScroll(page)).toBe(true);
  });

  test('the Deliver rows wrap their notes inside the pane', async ({ page }) => {
    await setUp(page, '/concepts/enrich');
    const deliver = main(page).getByRole('region', { name: 'Deliver' });
    await expect(deliver.getByText('Tags', { exact: true })).toBeVisible();
    await expect(deliver.getByRole('button', { name: '2 pending' })).toBeVisible();
    await expect(deliver.getByRole('button', { name: 'Manage in Settings' })).toBeVisible();
    for (const row of await deliver.getByRole('listitem').all()) expect(await inside(row, deliver)).toBe(true);
    expect(await noPageScroll(page)).toBe(true);
  });

  test('a reader sees the write controls disabled', async ({ page }) => {
    await setUp(page, '/concepts/enrich', PERSONAS.consumer);
    const map = main(page).getByRole('region', { name: 'Map' });
    await expect(map.getByRole('button', { name: 'Suggest matches' })).toBeDisabled();
    for (const review of await map.getByRole('button', { name: 'Review' }).all()) await expect(review).toBeDisabled();
  });
});

test.describe('concepts-mapping', () => {
  test('the kit header and the two panes side by side, at the kit sizes', async ({ page }) => {
    await setUp(page, '/concepts/mapping');
    const title = main(page).getByRole('heading', { level: 1, name: 'Term Mapping' });
    await expect(title).toBeVisible();
    expect(await style(title, ['font-size', 'color'])).toEqual({ 'font-size': '16px', color: NAVY });

    const runs = main(page).getByRole('region', { name: 'Recent runs' });
    const detail = main(page).getByRole('region', { name: 'Run detail' });
    await expect(runs).toBeVisible();
    await expect(detail).toBeVisible();
    expect(await style(runs, ['border-top-width', 'box-shadow'])).toEqual({ 'border-top-width': '1px', 'box-shadow': 'none' });
    const r = (await runs.boundingBox())!;
    const d = (await detail.boundingBox())!;
    expect(Math.abs(r.y - d.y)).toBeLessThan(1);
    expect(Math.round(r.width)).toBe(320);
    for (const name of ['Refresh', 'New run']) {
      expect((await main(page).getByRole('button', { name, exact: true }).first().boundingBox())!.height).toBeLessThanOrEqual(28);
    }
    await expect(detail.getByText('Select a run on the left, or start a new one.')).toBeVisible();
  });

  test('a long run comment truncates in the list with a title, and wraps in the detail', async ({ page }) => {
    await setUp(page, '/concepts/mapping');
    const runs = main(page).getByRole('region', { name: 'Recent runs' });
    const comment = runs.getByText(LONG_NAME, { exact: true });
    await expect(comment).toHaveAttribute('title', LONG_NAME);
    expect(await style(comment, ['text-overflow', 'white-space'])).toEqual({ 'text-overflow': 'ellipsis', 'white-space': 'nowrap' });
    expect(await inside(comment, runs)).toBe(true);

    await runs.getByRole('button', { name: /1aaaaaaa/ }).click();
    const detail = main(page).getByRole('region', { name: 'Run detail' });
    await expect(detail.getByText('Sources of suggestions')).toBeVisible();
    const full = detail.getByText(LONG_NAME, { exact: true });
    expect(await inside(full, detail)).toBe(true);
    // The unbroken context IRI wraps inside the pane, in the mono font
    const iri = detail.getByText(`urn:glossary:${UNBROKEN}`, { exact: true });
    expect(await inside(iri, detail)).toBe(true);
    expect(await style(iri, ['font-family'])).toEqual({ 'font-family': expect.stringMatching(/mono/i) });
    // The run's actions sit in the pane's head
    for (const name of ['Refresh', 'Apply auto (1)', 'Generate review']) {
      await expect(detail.getByRole('button', { name, exact: true })).toBeVisible();
    }
    expect(await noPageScroll(page)).toBe(true);
  });

  // Ruling R65: a busy action keeps its focus (aria-disabled), and looks it
  test('Undo looks unavailable while it runs, and keeps its focus', async ({ page }) => {
    await setUp(page, '/concepts/mapping');
    let release: () => void = () => {};
    await page.route((url) => url.pathname === '/api/term-mappings/runs/2bbbbbbb-0000-0000/undo', async (route) => {
      await new Promise<void>((resolve) => { release = resolve; });
      await route.fulfill({ json: { links_removed: 4, suggestions_reverted: 0 } });
    });
    page.on('dialog', (dialog) => void dialog.accept());
    await main(page).getByRole('region', { name: 'Recent runs' }).getByRole('button', { name: /2bbbbbbb/ }).click();
    const undo = main(page).getByRole('region', { name: 'Run detail' }).getByRole('button', { name: 'Undo', exact: true });
    await expect(undo).toBeVisible();
    const idle = await style(undo, ['opacity', 'cursor', 'pointer-events']);
    expect(idle).toEqual({ opacity: '1', cursor: 'pointer', 'pointer-events': 'auto' });

    await undo.focus();
    await page.keyboard.press('Enter');
    await expect(undo).toHaveAttribute('aria-disabled', 'true');
    expect(await style(undo, ['opacity', 'cursor', 'pointer-events'])).toEqual({
      opacity: '0.5', cursor: 'not-allowed', 'pointer-events': 'none',
    });
    await expect(undo).toBeFocused();
    // Not natively disabled (Playwright's toBeDisabled counts aria-disabled too)
    expect(await undo.evaluate((el) => (el as HTMLButtonElement).disabled)).toBe(false);

    release();
    await expect(undo).not.toHaveAttribute('aria-disabled');
    expect(await style(undo, ['opacity', 'pointer-events'])).toEqual({ opacity: '1', 'pointer-events': 'auto' });
  });

  test('a failed runs list shows an Alert with Retry, which loads them', async ({ page }) => {
    let failing = true;
    await page.setViewportSize({ width: 1280, height: 800 });
    await mockApi(page, PERSONAS.admin, { ...DATA_FIXTURES, ...ENRICH_MAPPING_FIXTURES });
    await routeRuns(page, { fail: () => failing });
    await page.goto('/concepts/mapping');
    const runs = main(page).getByRole('region', { name: 'Recent runs' });
    await expect(runs.getByRole('alert')).toBeVisible();
    await expect(runs.getByText(/No runs yet/)).toHaveCount(0);
    failing = false;
    await runs.getByRole('button', { name: 'Retry' }).click();
    await expect(runs.getByRole('button', { name: /1aaaaaaa/ })).toBeVisible();
    await expect(runs.getByRole('alert')).toHaveCount(0);
  });
});
