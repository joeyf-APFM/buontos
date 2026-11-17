/**
 * Wave 3 Task 5: Entitlements Sync (/entitlements-sync) on the page kit,
 * measured in a real browser (ruling R10: jsdom ignores the cascade). The page
 * is full bleed: the shell's breadcrumb, the kit header with New Configuration
 * at its end, then one flush pane holding the table. The configuration dialog
 * and the delete confirm are the kit Dialog.
 *
 * CAPTURE=before|after also saves images of the page and its dialogs to
 * .superpowers/sdd/2026-11-13-mantine-restyle-wave-3/task-5-images/.
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test, type Locator, type Page } from '@playwright/test';
import { mockApi } from './fixtures/api';
import { DATA_FIXTURES } from './fixtures/data';
import { PERSONAS } from './fixtures/personas';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const IMAGES = path.resolve(HERE, '../../../../.superpowers/sdd/2026-11-13-mantine-restyle-wave-3/task-5-images');
const CAPTURE = process.env.CAPTURE;

const NAVY = 'rgb(31, 48, 102)';
const LIST = '/api/entitlements-sync/configs';

// Review Focus 1: a 200-character connection name, in two forms. One has spaces;
// the other has no break opportunity at all, so only overflow-wrap can wrap it.
const SPACED_NAME = `Sync every partner workspace into the catalog ${'and report on each catalog that changed '.repeat(6)}`.slice(0, 199) + '.';
const UNBROKEN_NAME = 'x'.repeat(200);
const LONG_CONNECTION = `workspace-${'y'.repeat(190)}`;

const base = DATA_FIXTURES[LIST] as Record<string, unknown>[];
const WITH_LONG = [
  ...base,
  { ...base[0], id: 'e2e-sync-spaced', name: SPACED_NAME },
  { ...base[0], id: 'e2e-sync-unbroken', name: UNBROKEN_NAME, connection: LONG_CONNECTION },
];
const CONNECTIONS = [
  { id: 'e2e-conn-1', name: 'Workspace catalog' },
  { id: 'e2e-conn-long', name: SPACED_NAME },
];

const style = (loc: Locator, props: string[]) =>
  loc.evaluate((el, names) => {
    const cs = getComputedStyle(el);
    return Object.fromEntries(names.map((n) => [n, cs.getPropertyValue(n)]));
  }, props);

const box = async (loc: Locator) => (await loc.boundingBox())!;

const noPageScroll = (page: Page) =>
  page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);

async function setUp(page: Page, data: unknown = base, extra: Record<string, unknown> = {}) {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.clock.setFixedTime(new Date('2026-11-09T12:00:00Z'));
  await mockApi(page, PERSONAS.admin, { ...DATA_FIXTURES, [LIST]: data, ...extra });
  await page.goto('/entitlements-sync');
  await expect(page.getByRole('heading', { level: 1, name: 'Entitlements Sync' })).toBeVisible();
  await expect(page.locator('main').getByText('Nightly workspace sync', { exact: true })).toBeVisible();
}

async function capture(page: Page, name: string) {
  if (!CAPTURE) return;
  await page.mouse.move(0, 0);
  await page.waitForTimeout(400);
  await page.screenshot({ path: path.join(IMAGES, `${name}-${CAPTURE}.png`), animations: 'disabled', caret: 'hide' });
}

const rowOf = (page: Page, name: string) => page.locator('main tbody tr', { hasText: name });
const addButton = (page: Page) => page.getByRole('button', { name: 'New Configuration' });

async function openAdd(page: Page) {
  await addButton(page).click();
  const dialog = page.getByRole('dialog', { name: 'New Configuration' });
  await expect(dialog).toBeVisible();
  return dialog;
}

test.describe('captures', () => {
  test('captures the page and its dialogs', async ({ page }) => {
    test.skip(!CAPTURE, 'only with CAPTURE=before|after');
    await setUp(page, WITH_LONG);
    await capture(page, 'entitlements-sync');
    await openAdd(page);
    await capture(page, 'dialog-add');
    await page.keyboard.press('Escape');
    await rowOf(page, 'Nightly workspace sync').locator('button').first().click();
    await expect(page.getByRole('dialog', { name: 'Edit Configuration' })).toBeVisible();
    await capture(page, 'dialog-edit');
    await page.keyboard.press('Escape');
    if (CAPTURE === 'after') {
      await rowOf(page, 'Nightly workspace sync').locator('button').nth(1).click();
      await capture(page, 'dialog-delete');
    }
  });
});

test.describe('entitlements sync', () => {
  test('is full bleed, under the shell breadcrumb, with the kit header and one pane', async ({ page }) => {
    await setUp(page);
    const main = page.locator('main');
    expect(await style(main, ['padding-top', 'padding-left'])).toEqual({ 'padding-top': '0px', 'padding-left': '0px' });
    const kitPage = main.locator('[data-full-bleed]');
    await expect(kitPage).toHaveCount(1);
    const mainBox = await box(main);
    const crumbBar = await box(main.getByRole('navigation', { name: 'Breadcrumb' }).locator('..'));
    expect(Math.round(crumbBar.height + (await box(kitPage)).height)).toBe(Math.round(mainBox.height));

    const title = page.getByRole('heading', { level: 1, name: 'Entitlements Sync' });
    expect(await style(title, ['font-size', 'color'])).toEqual({ 'font-size': '16px', color: NAVY });
    expect(Math.round((await box(title)).x - mainBox.x)).toBe(14);

    const pane = page.getByRole('region', { name: 'Sync configuration list' });
    await expect(pane.getByRole('table')).toHaveCount(1);
    expect(Math.round((await box(addButton(page))).height)).toBe(28);
    // New Configuration is at the end of the header's line
    const header = await box(title.locator('..'));
    const add = await box(addButton(page));
    expect(Math.abs(add.y + add.height / 2 - (header.y + header.height / 2))).toBeLessThan(2);
    expect(add.x + add.width).toBeGreaterThan(header.x + header.width - 20);
    // A row's text is 12px; the schedule and connection are identifiers, in mono; the name is prose
    expect((await style(rowOf(page, 'Nightly workspace sync'), ['font-size']))['font-size']).toBe('12px');
    expect((await style(pane.getByText('0 2 * * *', { exact: true }), ['font-family']))['font-family'])
      .toMatch(/mono|Menlo|Consolas|Courier/i);
    expect((await style(pane.getByText('Nightly workspace sync', { exact: true }), ['font-family']))['font-family'])
      .not.toMatch(/mono|Menlo|Consolas|Courier/i);
    // The row's status mark carries the good colour
    expect((await style(pane.getByText('Enabled', { exact: true }), ['color']))['color']).not.toBe('rgb(75, 85, 99)');
  });

  test('a 200-character name and connection wrap and cause no horizontal page scroll', async ({ page }) => {
    await setUp(page, WITH_LONG);
    const main = page.locator('main');
    const longs = [
      main.getByText(/^Sync every partner workspace into the catalog/),
      main.getByText(UNBROKEN_NAME, { exact: true }),
      main.getByText(LONG_CONNECTION, { exact: true }),
    ];
    for (const el of longs) {
      await expect(el).toBeVisible();
      expect(await el.evaluate((n) => n.scrollWidth <= n.clientWidth)).toBe(true);
      expect((await box(el)).height).toBeGreaterThan(30);
      // The title attribute carries the whole text
      expect(((await el.getAttribute('title')) ?? '').length).toBeGreaterThanOrEqual(199);
    }
    expect(await noPageScroll(page)).toBe(true);
    const pane = page.getByRole('region', { name: 'Sync configuration list' });
    expect(await pane.evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(true);
  });

  test('a 200-character connection name in the dialog wraps in its list', async ({ page }) => {
    await setUp(page, base, { '/api/entitlements-sync/connections': CONNECTIONS });
    const dialog = await openAdd(page);
    await dialog.getByRole('textbox', { name: 'Connection' }).click();
    const option = page.getByRole('option', { name: /^Sync every partner workspace/ });
    await expect(option).toBeVisible();
    expect((await box(option)).height).toBeGreaterThan(30);
    expect(await option.evaluate((n) => n.scrollWidth <= n.clientWidth)).toBe(true);
    expect(await noPageScroll(page)).toBe(true);
    await option.click();
    await expect(dialog).toBeVisible();
  });

  test('the dialog is the kit Dialog, with 28px fields, and nothing in it is mono', async ({ page }) => {
    await setUp(page);
    await page.setViewportSize({ width: 1280, height: 560 });
    const dialog = await openAdd(page);
    await expect(dialog).toHaveClass(/mantine-Modal-content/);
    expect(await style(dialog, ['border-top-left-radius'])).toEqual({ 'border-top-left-radius': '8px' });
    expect(Math.round((await box(dialog)).width)).toBe(560);
    for (const name of ['Name', 'Connection', 'Schedule (Cron)', 'Catalogs']) {
      const field = dialog.getByRole('textbox', { name });
      expect(Math.round((await box(field)).height)).toBe(28);
      expect((await style(field, ['font-family']))['font-family']).not.toMatch(/mono|Menlo|Consolas|Courier/i);
    }
    await expect(dialog.getByRole('button', { name: 'Save' })).toBeInViewport();
    await expect(dialog.getByRole('heading', { name: 'New Configuration' })).toBeInViewport();
    expect(await noPageScroll(page)).toBe(true);
  });

  test('configuration dialog: Escape in an open Select closes only the Select', async ({ page }) => {
    await setUp(page);
    const dialog = await openAdd(page);
    const name = dialog.getByRole('textbox', { name: 'Name' });
    await name.fill('Finance sync');
    const schedule = dialog.getByRole('textbox', { name: 'Schedule (Cron)' });
    await schedule.fill('0 4 * * *');

    for (const field of ['Connection', 'Catalogs']) {
      await dialog.getByRole('textbox', { name: field }).click();
      const list = page.getByRole('listbox');
      await expect(list.getByRole('option').first()).toBeVisible();
      await page.keyboard.press('Escape');
      await expect(list).toHaveCount(0);
      await expect(dialog).toBeVisible();
      await expect(page.getByRole('alertdialog')).toHaveCount(0);
      await expect(name).toHaveValue('Finance sync');
      await expect(schedule).toHaveValue('0 4 * * *');
    }

    // A chosen option stays chosen; the next Escape is the dialog's
    await dialog.getByRole('textbox', { name: 'Catalogs' }).click();
    await page.getByRole('option', { name: 'finance' }).click();
    await expect(dialog.getByRole('textbox', { name: 'Catalogs' })).toHaveValue('finance');
    await page.keyboard.press('Escape');
    await expect(dialog).toHaveCount(0);
    await expect(addButton(page)).toBeFocused();
  });

  test('the Switch keeps its state and payload', async ({ page }) => {
    await setUp(page);
    let body: Record<string, unknown> | null = null;
    await page.route((url) => url.pathname === '/api/entitlements-sync/configs/e2e-sync-2', async (route) => {
      if (route.request().method() !== 'PUT') return route.fallback();
      body = route.request().postDataJSON();
      return route.fulfill({ json: base[1] });
    });
    await rowOf(page, 'Weekly partner sync').locator('button').first().click();
    const dialog = page.getByRole('dialog', { name: 'Edit Configuration' });
    const toggle = dialog.getByRole('switch', { name: 'Enabled' });
    await expect(toggle).not.toBeChecked();
    expect(Math.round((await box(toggle)).height)).toBeLessThanOrEqual(24);
    // A click on the label toggles it too (Mantine's input lies over the whole row, so click by position)
    const label = await box(dialog.getByText('Enabled', { exact: true }));
    await page.mouse.click(label.x + label.width / 2, label.y + label.height / 2);
    await expect(toggle).toBeChecked();
    await toggle.press('Space');
    await expect(toggle).not.toBeChecked();
    await toggle.press('Space');
    await expect(toggle).toBeChecked();
    await dialog.getByRole('button', { name: 'Save' }).click();
    await expect(dialog).toHaveCount(0);
    expect(body).toEqual({
      name: 'Weekly partner sync', connection: 'e2e-conn-1', schedule: '0 3 * * 0', enabled: true, catalogs: ['finance'],
    });
  });

  test('a click outside the dialog leaves it open, as the Radix dialog did', async ({ page }) => {
    await setUp(page);
    const dialog = await openAdd(page);
    await dialog.getByRole('textbox', { name: 'Name' }).fill('Kept');
    await page.mouse.click(20, 780);
    await page.waitForTimeout(400);
    await expect(dialog).toBeVisible();
    await expect(dialog.getByRole('textbox', { name: 'Name' })).toHaveValue('Kept');
  });

  test('empty and error states keep their message and actions', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await mockApi(page, PERSONAS.admin, { ...DATA_FIXTURES, [LIST]: [] });
    await page.goto('/entitlements-sync');
    await expect(page.locator('main').getByText('No results.')).toBeVisible();
    await expect(addButton(page)).toBeEnabled();
    expect(await noPageScroll(page)).toBe(true);
    await capture(page, 'empty');

    // A failed load: the error, then Retry, which brings the list back
    let failing = true;
    await page.route((url) => url.pathname === LIST, (route) =>
      failing ? route.fulfill({ status: 500, json: { detail: 'boom' } }) : route.fallback());
    await page.reload();
    const pane = page.getByRole('region', { name: 'Sync configuration list' });
    await expect(pane.getByRole('alert')).toContainText('Failed to load configurations');
    await expect(addButton(page)).toBeEnabled();
    failing = false;
    await page.unroute((url) => url.pathname === LIST);
    await mockApi(page, PERSONAS.admin, { ...DATA_FIXTURES, [LIST]: base });
    await pane.getByRole('button', { name: 'Retry' }).click();
    await expect(pane.getByText('Nightly workspace sync', { exact: true })).toBeVisible();
  });

  test('delete confirm is an alertdialog, sends once and returns focus', async ({ page }) => {
    let deletes = 0;
    let gone = false;
    await setUp(page, base);
    await page.route((url) => url.pathname.startsWith('/api/entitlements-sync/configs'), async (route) => {
      const req = route.request();
      const url = new URL(req.url());
      if (req.method() === 'DELETE') {
        deletes += 1;
        gone = true;
        await new Promise((r) => setTimeout(r, 300));
        return route.fulfill({ status: 204, body: '' });
      }
      if (req.method() === 'GET' && url.pathname === LIST && gone) {
        return route.fulfill({ json: base.filter((c) => c.id !== 'e2e-sync-1') });
      }
      return route.fallback();
    });

    // Cancel: nothing sent, focus back on the row's delete button
    const del = rowOf(page, 'Nightly workspace sync').locator('button').nth(1);
    await del.click();
    const confirm = page.getByRole('alertdialog');
    await expect(confirm).toBeVisible();
    await expect(confirm).toContainText('Nightly workspace sync');
    expect(await style(confirm, ['border-top-left-radius'])).toEqual({ 'border-top-left-radius': '8px' });
    await confirm.getByRole('button', { name: 'Cancel' }).click();
    await expect(confirm).toHaveCount(0);
    await expect(del).toBeFocused();
    expect(deletes).toBe(0);

    // Confirm with a double click: one request, the row goes, focus is on New Configuration
    await del.click();
    await page.getByRole('alertdialog').getByRole('button', { name: 'Delete' }).dblclick();
    await expect(page.getByRole('alertdialog')).toHaveCount(0);
    await expect(page.locator('main').getByText('Nightly workspace sync', { exact: true })).toHaveCount(0);
    expect(deletes).toBe(1);
    await expect(addButton(page)).toBeFocused();
  });
});
