/**
 * Wave 3 Task 7: Master Data (/master-data) on the page kit, measured in a real
 * browser (ruling R10: jsdom ignores the cascade). The baselines show only the
 * unselected state (ruling R6), so this spec clicks through: it selects a
 * configuration and covers each tab (Overview, Sources, Matching Rules, Match
 * Runs, Candidates), both delete confirms, and opens each of the dialogs Task 8
 * owns (their look is Task 8's; here they only have to open from the page).
 *
 * CAPTURE=before|after also saves images to
 * .superpowers/sdd/2026-11-13-mantine-restyle-wave-3/task-7-images/.
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test, type Locator, type Page } from '@playwright/test';
import { mockApi } from './fixtures/api';
import { DATA_FIXTURES } from './fixtures/data';
import { PERSONAS } from './fixtures/personas';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const IMAGES = path.resolve(HERE, '../../../../.superpowers/sdd/2026-11-13-mantine-restyle-wave-3/task-7-images');
const CAPTURE = process.env.CAPTURE;

const NAVY = 'rgb(31, 48, 102)';
const LIST = '/api/mdm/configs';
const MONO = /mono|Menlo|Consolas|Courier/i;

// Review Focus 1: 200-character names, in two forms. One has spaces; the other
// has no break opportunity at all, so only overflow-wrap or truncation helps.
const SPACED = `Customer golden record for every region ${'and every partner system '.repeat(8)}`.slice(0, 199) + '.';
const UNBROKEN = 'x'.repeat(200);

type Rec = Record<string, unknown>;
const base = DATA_FIXTURES[LIST] as Rec[];
const config = base[0];
const sources = DATA_FIXTURES['/api/mdm/configs/e2e-mdm-1/sources'] as Rec[];
const rules = config.matching_rules as Rec[];

const LONG_FIXTURES: Record<string, unknown> = {
  [LIST]: [
    ...base,
    { ...config, id: 'e2e-mdm-spaced', name: SPACED, matching_rules: [{ ...rules[0], name: SPACED }, { ...rules[1], name: UNBROKEN }] },
    { ...config, id: 'e2e-mdm-unbroken', name: UNBROKEN },
  ],
  '/api/mdm/configs/e2e-mdm-spaced/sources': [
    { ...sources[0], id: 'src-spaced', source_contract_name: SPACED },
    { ...sources[1], id: 'src-unbroken', source_contract_name: UNBROKEN, source_table_fqn: `main.${'y'.repeat(190)}` },
  ],
  '/api/mdm/configs/e2e-mdm-spaced/runs': [],
  '/api/mdm/configs/e2e-mdm-unbroken/sources': [],
  '/api/mdm/configs/e2e-mdm-unbroken/runs': [],
};

const style = (loc: Locator, props: string[]) =>
  loc.evaluate((el, names) => {
    const cs = getComputedStyle(el);
    return Object.fromEntries(names.map((n) => [n, cs.getPropertyValue(n)]));
  }, props);

const box = async (loc: Locator) => (await loc.boundingBox())!;

const noPageScroll = (page: Page) =>
  page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);

async function setUp(page: Page, extra: Record<string, unknown> = {}) {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.clock.setFixedTime(new Date('2026-11-09T12:00:00Z'));
  await mockApi(page, PERSONAS.admin, { ...DATA_FIXTURES, ...extra });
  await page.goto('/master-data');
  await expect(page.getByRole('heading', { level: 1, name: 'Master Data Management' })).toBeVisible();
  await expect(page.locator('main').getByText('Customer master', { exact: true }).first()).toBeVisible();
}

async function capture(page: Page, name: string) {
  if (!CAPTURE) return;
  await page.mouse.move(0, 0);
  await page.waitForTimeout(400);
  await page.screenshot({ path: path.join(IMAGES, `${name}-${CAPTURE}.png`), animations: 'disabled', caret: 'hide' });
}

const newButton = (page: Page) => page.getByRole('button', { name: 'New MDM Configuration' });
const configRow = (page: Page, name: string | RegExp) =>
  page.locator('main').getByRole('listbox', { name: 'MDM Configurations' }).getByRole('option', { name });
const detail = (page: Page, name: string) => page.getByRole('region', { name, exact: true });
const tab = (page: Page, name: string | RegExp) => page.locator('main').getByRole('tab', { name });

async function selectCustomer(page: Page) {
  await configRow(page, /Customer master/).click();
  await expect(tab(page, 'Sources (2)')).toBeVisible();
  await expect(tab(page, 'Match Runs (1)')).toBeVisible();
}

async function openCandidates(page: Page) {
  await tab(page, 'Match Runs (1)').click();
  await page.locator('main').getByRole('button', { name: 'View', exact: true }).click();
  await expect(tab(page, 'Candidates (3)')).toHaveAttribute('aria-selected', 'true');
}

test.describe('captures', () => {
  test('captures the page, each tab and the dialogs', async ({ page }) => {
    test.skip(!CAPTURE, 'only with CAPTURE=before|after');
    await setUp(page);
    await capture(page, 'master-data');
    const main = page.locator('main');
    await main.getByText('Customer master', { exact: true }).first().click();
    await expect(main.getByRole('tab', { name: 'Sources (2)' })).toBeVisible();
    await capture(page, 'overview');
    await main.getByRole('tab', { name: 'Sources (2)' }).click();
    await capture(page, 'sources');
    await main.getByRole('tab', { name: 'Matching Rules' }).click();
    await capture(page, 'rules');
    await main.getByRole('tab', { name: 'Match Runs (1)' }).click();
    await capture(page, 'runs');
    await main.getByRole('button', { name: 'View', exact: true }).click();
    await expect(main.getByRole('tab', { name: 'Candidates (3)' })).toBeVisible();
    await capture(page, 'candidates');
    await newButton(page).click();
    await capture(page, 'dialog-config');
    await page.keyboard.press('Escape');
    await setUp(page, LONG_FIXTURES);
    await capture(page, 'long-names');
    // The row itself: a click on its clipped name would make the browser scroll
    // the clipped text into view (the old page has no rows to click)
    if (CAPTURE === 'after') await configRow(page, /^Customer golden record/).click();
    else await main.getByText(SPACED, { exact: true }).first().click();
    await main.getByRole('tab', { name: /^Sources/ }).click();
    await capture(page, 'long-sources');
    await main.getByRole('tab', { name: 'Matching Rules' }).click();
    await capture(page, 'long-rules');
  });
});

test.describe('master data', () => {
  test('is under the shell breadcrumb, with the kit header, its subtitle and two panes of 1/3 and 2/3', async ({ page }) => {
    await setUp(page);
    const main = page.locator('main');
    expect(await style(main, ['padding-top', 'padding-left'])).toEqual({ 'padding-top': '0px', 'padding-left': '0px' });

    const title = page.getByRole('heading', { level: 1, name: 'Master Data Management' });
    expect(await style(title, ['font-size', 'color'])).toEqual({ 'font-size': '16px', color: NAVY });
    const mainBox = await box(main);
    expect(Math.round((await box(title)).x - mainBox.x)).toBe(14);
    // New MDM Configuration at the end of the header's line, 28px tall
    expect(Math.round((await box(newButton(page))).height)).toBe(28);
    const header = await box(title.locator('..'));
    const add = await box(newButton(page));
    expect(Math.abs(add.y + add.height / 2 - (header.y + header.height / 2))).toBeLessThan(2);
    expect(add.x + add.width).toBeGreaterThan(header.x + header.width - 20);
    // The subtitle: 12px muted prose under the title, aligned with it
    const subtitle = main.getByText('Define master data contracts and manage entity matching across systems');
    expect((await style(subtitle, ['font-size']))['font-size']).toBe('12px');
    expect((await style(subtitle, ['font-family']))['font-family']).not.toMatch(MONO);
    expect(Math.round((await box(subtitle)).x)).toBe(Math.round((await box(title)).x));
    const titleBox = await box(title);
    expect((await box(subtitle)).y).toBeGreaterThanOrEqual(titleBox.y + titleBox.height);

    // 1/3 and 2/3 of the width, side by side, sharing one border
    const list = await box(page.getByRole('region', { name: 'MDM Configurations', exact: true }));
    const side = await box(detail(page, 'Configuration Details'));
    expect(Math.abs(side.width / list.width - 2)).toBeLessThan(0.05);
    expect(Math.abs(list.x + list.width - side.x)).toBeLessThanOrEqual(1);
    expect(Math.round(list.y)).toBe(Math.round(side.y));

    // The hint, with nothing selected, and its button
    await expect(detail(page, 'Configuration Details').getByText('Select an MDM Configuration')).toBeVisible();
    await expect(detail(page, 'Configuration Details').getByRole('button', { name: 'Create New Configuration' })).toBeVisible();
    // The list: 28px rows at 12px, the name in the body font
    const row = configRow(page, /Customer master/);
    expect(Math.round((await box(row)).height)).toBe(28);
    expect((await style(row, ['font-size']))['font-size']).toBe('12px');
    expect((await style(row.getByText('Customer master', { exact: true }), ['font-family']))['font-family']).not.toMatch(MONO);
    // The row's delete stays inside the row
    const del = await box(row.getByRole('button'));
    const rowBox = await box(row);
    expect(del.x + del.width).toBeLessThanOrEqual(rowBox.x + rowBox.width + 1);
    expect(await noPageScroll(page)).toBe(true);
  });

  test('selecting a configuration fills the detail pane, and each tab shows its content', async ({ page }) => {
    await setUp(page);
    await selectCustomer(page);
    const pane = detail(page, 'Customer master');
    await expect(configRow(page, /Customer master/)).toHaveAttribute('aria-selected', 'true');
    expect((await style(configRow(page, /Customer master/), ['box-shadow']))['box-shadow']).not.toBe('none');
    expect(await style(pane.getByRole('heading', { level: 2 }), ['color'])).toEqual({ color: NAVY });
    for (const name of ['Start Matching', 'Link Source']) {
      expect(Math.round((await box(pane.getByRole('button', { name, exact: true }))).height)).toBe(28);
    }
    await expect(pane.getByText('Golden record for customers')).toBeVisible();

    // Overview: the facts and four stat tiles
    const overview = tab(page, 'Overview');
    await expect(overview).toHaveAttribute('aria-selected', 'true');
    expect(Math.round((await box(overview)).height)).toBe(30);
    await expect(pane.getByText('Orders contract')).toBeVisible();
    for (const label of ['Total Runs', 'Matches Found', 'New Records', 'Pending Review']) {
      await expect(pane.getByText(label, { exact: true })).toBeVisible();
    }
    const tiles = await Promise.all(['Total Runs', 'Matches Found', 'New Records', 'Pending Review'].map((l) => box(pane.getByText(l, { exact: true }))));
    // One row of four
    expect(new Set(tiles.map((b) => Math.round(b.y))).size).toBe(1);
    expect(await noPageScroll(page)).toBe(true);

    // Sources: a table with 28px+ rows; the table name is an identifier, so mono
    await tab(page, 'Sources (2)').click();
    await expect(tab(page, 'Sources (2)')).toHaveAttribute('aria-selected', 'true');
    await expect(pane.getByText('Web shop customers')).toBeVisible();
    expect((await style(pane.getByText('main.web.customers', { exact: true }), ['font-family']))['font-family']).toMatch(MONO);
    expect((await style(pane.getByText('Web shop customers', { exact: true }), ['font-family']))['font-family']).not.toMatch(MONO);
    expect(Math.round((await box(pane.getByRole('button', { name: 'Remove source link' }).first())).height)).toBe(24);
    expect(await noPageScroll(page)).toBe(true);

    // Matching Rules: both rules and the survivorship rule; Edit Rules
    await tab(page, 'Matching Rules').click();
    await expect(pane.getByText('Email match')).toBeVisible();
    await expect(pane.getByText('Name similarity')).toBeVisible();
    await expect(pane.getByText('most_recent')).toBeVisible();
    // A small button, as before (size sm: 26px, within the 26-28px controls)
    expect(Math.round((await box(pane.getByRole('button', { name: 'Edit Rules' }))).height)).toBe(26);

    // Match Runs: the run with its counts and actions
    await tab(page, 'Match Runs (1)').click();
    await expect(pane.getByText(/^Run e2e-mdm/)).toBeVisible();
    for (const name of ['Merge (1)', 'Create Review', 'View']) {
      await expect(pane.getByRole('button', { name, exact: true })).toBeVisible();
    }

    // Candidates: the table, ids in mono, the confidence coloured
    await pane.getByRole('button', { name: 'View', exact: true }).click();
    await expect(tab(page, 'Candidates (3)')).toHaveAttribute('aria-selected', 'true');
    await expect(pane.getByText('2 pending, 1 approved, 0 merged')).toBeVisible();
    await expect(pane.getByRole('button', { name: 'Merge Approved' })).toBeVisible();
    expect((await style(pane.getByText('master-1', { exact: true }), ['font-family']))['font-family']).toMatch(MONO);
    const high = (await style(pane.getByText('99.0%'), ['color']))['color'];
    const low = (await style(pane.getByText('50.0%'), ['color']))['color'];
    expect(high).not.toBe(low);
    expect(await noPageScroll(page)).toBe(true);

    // Switching tabs keeps the configuration selected
    await tab(page, 'Overview').click();
    await expect(configRow(page, /Customer master/)).toHaveAttribute('aria-selected', 'true');
    await expect(tab(page, 'Candidates (3)')).toBeVisible();
  });

  test('a candidate with a review opens /data-asset-reviews/:id', async ({ page }) => {
    const candidates = DATA_FIXTURES['/api/mdm/runs/e2e-mdm-run-1/candidates'] as Rec[];
    await setUp(page, {
      '/api/mdm/runs/e2e-mdm-run-1/candidates': [{ ...candidates[0], review_request_id: 'e2e-review-1' }, ...candidates.slice(1)],
    });
    await selectCustomer(page);
    await openCandidates(page);
    await page.locator('main').getByText('src-1', { exact: true }).click();
    await expect(page).toHaveURL(/\/data-asset-reviews\/e2e-review-1$/);
  });

  test('200-character names wrap or truncate with a title, and cause no horizontal page scroll', async ({ page }) => {
    await setUp(page, LONG_FIXTURES);
    const main = page.locator('main');
    for (const [name, match] of [[SPACED, /^Customer golden record/], [UNBROKEN, /^x{200}/]] as const) {
      const row = configRow(page, match);
      await expect(row).toBeVisible();
      // In the list: one 28px line, truncated, with the whole name in its title
      expect(Math.round((await box(row)).height)).toBe(28);
      expect(await row.getByText(name, { exact: true }).getAttribute('title')).toBe(name);
      // The delete button stays in view
      await expect(row.getByRole('button')).toBeInViewport();
      expect(await noPageScroll(page)).toBe(true);
      await row.click();
      const heading = main.getByRole('heading', { level: 2, name });
      await expect(heading).toBeVisible();
      expect(await heading.getAttribute('title')).toBe(name);
      expect(await heading.evaluate((el) => el.getBoundingClientRect().right <= (el.parentElement as HTMLElement).getBoundingClientRect().right + 1)).toBe(true);
      await expect(detail(page, name).getByRole('button', { name: 'Link Source', exact: true })).toBeInViewport();
      expect(await noPageScroll(page)).toBe(true);
    }

    // Long source names and a long table name wrap in the table
    await configRow(page, /^Customer golden record/).click();
    await tab(page, 'Sources (2)').click();
    for (const name of [SPACED, UNBROKEN]) {
      const cell = main.getByText(name, { exact: true }).last();
      await expect(cell).toBeVisible();
      expect(await cell.getAttribute('title')).toBe(name);
      expect(await cell.evaluate((n) => n.scrollWidth <= n.clientWidth + 1)).toBe(true);
    }
    expect(await noPageScroll(page)).toBe(true);
    expect(await main.evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(true);
    await expect(main.getByRole('button', { name: 'Remove source link' }).first()).toBeInViewport();

    // Long rule names wrap in the rules list
    await tab(page, 'Matching Rules').click();
    for (const name of [SPACED, UNBROKEN]) {
      const rule = main.getByText(name, { exact: true }).last();
      await expect(rule).toBeVisible();
      expect(await rule.getAttribute('title')).toBe(name);
      expect(await rule.evaluate((n) => n.scrollWidth <= n.clientWidth + 1)).toBe(true);
      expect((await box(rule)).height).toBeGreaterThan(20);
    }
    expect(await noPageScroll(page)).toBe(true);
    expect(await main.evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(true);
  });

  test('opens each of the dialogs Task 8 owns from the page', async ({ page }) => {
    await setUp(page);
    await newButton(page).click();
    await expect(page.getByRole('dialog', { name: 'New MDM Configuration' })).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await page.getByRole('button', { name: 'Create New Configuration' }).click();
    await expect(page.getByRole('dialog', { name: 'New MDM Configuration' })).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog')).toHaveCount(0);

    await selectCustomer(page);
    await page.locator('main').getByRole('button', { name: 'Link Source', exact: true }).click();
    await expect(page.getByRole('dialog', { name: 'Link Source Contract' })).toBeVisible();
    await capture(page, 'dialog-link-source');
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog')).toHaveCount(0);

    await tab(page, 'Matching Rules').click();
    await page.locator('main').getByRole('button', { name: 'Edit Rules' }).click();
    await expect(page.getByRole('dialog', { name: 'Edit MDM Rules' })).toBeVisible();
    await capture(page, 'dialog-rules');
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog')).toHaveCount(0);

    await tab(page, 'Match Runs (1)').click();
    await page.locator('main').getByRole('button', { name: 'Create Review' }).click();
    const review = page.getByRole('dialog', { name: 'Create Match Review' });
    await expect(review).toBeVisible();
    await expect(review).toContainText('2');
    await capture(page, 'dialog-review');
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog')).toHaveCount(0);
  });

  test('empty and error states keep their message and actions', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await mockApi(page, PERSONAS.admin, { ...DATA_FIXTURES, [LIST]: [] });
    await page.goto('/master-data');
    const pane = page.getByRole('region', { name: 'MDM Configurations', exact: true });
    await expect(pane.getByText('No MDM configurations yet.')).toBeVisible();
    await expect(pane.getByText('Create one to get started.')).toBeVisible();
    await expect(newButton(page)).toBeEnabled();
    await expect(page.getByRole('button', { name: 'Create New Configuration' })).toBeEnabled();
    expect(await noPageScroll(page)).toBe(true);
    await capture(page, 'empty');

    // A failed load: the error, then Retry, which brings the list back
    let failing = true;
    await page.route((url) => url.pathname === LIST, (route) =>
      failing ? route.fulfill({ status: 500, json: { detail: 'Backend unavailable' } }) : route.fallback());
    await page.reload();
    await expect(pane.getByRole('alert')).toContainText('Backend unavailable');
    await expect(newButton(page)).toBeEnabled();
    await capture(page, 'error');
    failing = false;
    await page.unroute((url) => url.pathname === LIST);
    await mockApi(page, PERSONAS.admin, DATA_FIXTURES);
    await pane.getByRole('button', { name: 'Retry' }).click();
    await expect(configRow(page, /Customer master/)).toBeVisible();
    await expect(pane.getByRole('alert')).toHaveCount(0);
  });

  test('delete confirms are alertdialogs, send once and return focus (source link and configuration)', async ({ page }) => {
    await setUp(page);
    let sourceDeletes = 0;
    let configDeletes = 0;
    let sourceGone = false;
    let configGone = false;
    await page.route((url) => url.pathname.startsWith('/api/mdm/'), async (route) => {
      const req = route.request();
      const url = new URL(req.url());
      if (req.method() === 'DELETE' && url.pathname.startsWith('/api/mdm/sources/')) {
        sourceDeletes += 1;
        sourceGone = true;
        await new Promise((r) => setTimeout(r, 300));
        return route.fulfill({ status: 204, body: '' });
      }
      if (req.method() === 'DELETE') {
        configDeletes += 1;
        configGone = true;
        await new Promise((r) => setTimeout(r, 300));
        return route.fulfill({ status: 204, body: '' });
      }
      if (req.method() === 'GET' && url.pathname === '/api/mdm/configs/e2e-mdm-1/sources' && sourceGone) {
        return route.fulfill({ json: sources.slice(1) });
      }
      if (req.method() === 'GET' && url.pathname === LIST && configGone) return route.fulfill({ json: [] });
      return route.fallback();
    });
    await selectCustomer(page);
    await tab(page, 'Sources (2)').click();
    const pane = detail(page, 'Customer master');

    // Source: Cancel sends nothing and focus is back on the row's button
    const remove = pane.getByRole('button', { name: 'Remove source link' }).first();
    await remove.click();
    const confirm = page.getByRole('alertdialog');
    await expect(confirm).toBeVisible();
    await expect(confirm).toContainText('Web shop customers');
    expect(await style(confirm, ['border-top-left-radius'])).toEqual({ 'border-top-left-radius': '8px' });
    await capture(page, 'dialog-remove-source');
    await confirm.getByRole('button', { name: 'Cancel' }).click();
    await expect(confirm).toHaveCount(0);
    await expect(remove).toBeFocused();
    expect(sourceDeletes).toBe(0);
    // Confirm with a double click: one request, the row goes, focus is on Link Source
    await remove.click();
    await page.getByRole('alertdialog').getByRole('button', { name: 'Remove' }).dblclick();
    await expect(page.getByRole('alertdialog')).toHaveCount(0);
    await expect(pane.getByText('Web shop customers', { exact: true })).toHaveCount(0);
    await expect(tab(page, 'Sources (1)')).toBeVisible();
    expect(sourceDeletes).toBe(1);
    await expect(pane.getByRole('button', { name: 'Link Source', exact: true })).toBeFocused();

    // Configuration: from its row
    const del = configRow(page, /Customer master/).getByRole('button');
    await del.click();
    const configConfirm = page.getByRole('alertdialog');
    await expect(configConfirm).toContainText('Customer master');
    await capture(page, 'dialog-delete-config');
    await configConfirm.getByRole('button', { name: 'Cancel' }).click();
    await expect(configConfirm).toHaveCount(0);
    await expect(del).toBeFocused();
    expect(configDeletes).toBe(0);
    await del.click();
    await page.getByRole('alertdialog').getByRole('button', { name: 'Delete' }).dblclick();
    await expect(page.getByRole('alertdialog')).toHaveCount(0);
    await expect(configRow(page, /Customer master/)).toHaveCount(0);
    expect(configDeletes).toBe(1);
    await expect(detail(page, 'Configuration Details')).toBeVisible();
    await expect(newButton(page)).toBeFocused();
  });
});
