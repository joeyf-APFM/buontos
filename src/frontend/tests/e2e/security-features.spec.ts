/**
 * Wave 3 Task 4: Security Features (/security-features) on the page kit,
 * measured in a real browser (ruling R10: jsdom ignores the cascade). The list
 * is full bleed: the shell's breadcrumb, the kit header with Add at its end,
 * then one flush pane holding the table. The add/edit dialog and the delete
 * confirm are the kit Dialog.
 *
 * CAPTURE=before|after also saves images of the page and its dialogs to
 * .superpowers/sdd/2026-11-13-mantine-restyle-wave-3/task-4-images/.
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test, type Locator, type Page } from '@playwright/test';
import { mockApi } from './fixtures/api';
import { DATA_FIXTURES } from './fixtures/data';
import { PERSONAS } from './fixtures/personas';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const IMAGES = path.resolve(HERE, '../../../../.superpowers/sdd/2026-11-13-mantine-restyle-wave-3/task-4-images');
const CAPTURE = process.env.CAPTURE;

const NAVY = 'rgb(31, 48, 102)';

// Review Focus 1: a 200-character feature name, in two forms. One has spaces;
// the other has no break opportunity at all, so only overflow-wrap can wrap it.
const SPACED_NAME = `Mask every column that holds personal data ${'and name an accountable owner for it '.repeat(6)}`.slice(0, 199) + '.';
const UNBROKEN_NAME = 'x'.repeat(200);
const LONG_TARGET = `main.sales.${'y'.repeat(189)}`;

const base = DATA_FIXTURES['/api/security-features'] as Record<string, unknown>[];
const WITH_LONG = [
  ...base,
  { ...base[0], id: 'e2e-sec-spaced', name: SPACED_NAME },
  { ...base[0], id: 'e2e-sec-unbroken', name: UNBROKEN_NAME, target: LONG_TARGET, conditions: ['c'.repeat(150)] },
];

const style = (loc: Locator, props: string[]) =>
  loc.evaluate((el, names) => {
    const cs = getComputedStyle(el);
    return Object.fromEntries(names.map((n) => [n, cs.getPropertyValue(n)]));
  }, props);

const box = async (loc: Locator) => (await loc.boundingBox())!;

const noPageScroll = (page: Page) =>
  page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);

async function setUp(page: Page, data: unknown = base) {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.clock.setFixedTime(new Date('2026-11-09T12:00:00Z'));
  await mockApi(page, PERSONAS.admin, { ...DATA_FIXTURES, '/api/security-features': data });
  await page.goto('/security-features');
  await expect(page.getByRole('heading', { level: 1, name: 'Security Features' })).toBeVisible();
  await expect(page.locator('main').getByText('Regional row filter', { exact: true })).toBeVisible();
}

async function capture(page: Page, name: string) {
  if (!CAPTURE) return;
  await page.mouse.move(0, 0);
  await page.waitForTimeout(400);
  await page.screenshot({ path: path.join(IMAGES, `${name}-${CAPTURE}.png`), animations: 'disabled', caret: 'hide' });
}

const rowOf = (page: Page, name: string) => page.locator('main tbody tr', { hasText: name });
const addButton = (page: Page) => page.getByRole('button', { name: 'Add Security Feature' });

async function openAdd(page: Page) {
  await addButton(page).click();
  const dialog = page.getByRole('dialog', { name: 'Add Security Feature' });
  await expect(dialog).toBeVisible();
  return dialog;
}

test.describe('captures', () => {
  test('captures the page and its dialogs', async ({ page }) => {
    test.skip(!CAPTURE, 'only with CAPTURE=before|after');
    await setUp(page, WITH_LONG);
    await capture(page, 'security-features');
    await openAdd(page);
    await capture(page, 'dialog-add');
    await page.keyboard.press('Escape');
    await rowOf(page, 'Regional row filter').locator('button').first().click();
    await expect(page.getByRole('dialog', { name: 'Edit Security Feature' })).toBeVisible();
    await capture(page, 'dialog-edit');
    await page.keyboard.press('Escape');
    await rowOf(page, 'Regional row filter').locator('button').nth(1).click();
    await capture(page, 'dialog-delete');
  });
});

test.describe('security features', () => {
  test('is full bleed, under the shell breadcrumb, with the kit header and one pane', async ({ page }) => {
    await setUp(page);
    const main = page.locator('main');
    expect(await style(main, ['padding-top', 'padding-left'])).toEqual({ 'padding-top': '0px', 'padding-left': '0px' });
    const kitPage = main.locator('[data-full-bleed]');
    await expect(kitPage).toHaveCount(1);
    const mainBox = await box(main);
    const crumbBar = await box(main.getByRole('navigation', { name: 'Breadcrumb' }).locator('..'));
    expect(Math.round(crumbBar.height + (await box(kitPage)).height)).toBe(Math.round(mainBox.height));

    const title = page.getByRole('heading', { level: 1, name: 'Security Features' });
    expect(await style(title, ['font-size', 'color'])).toEqual({ 'font-size': '16px', color: NAVY });
    expect(Math.round((await box(title)).x - mainBox.x)).toBe(14);

    const pane = page.getByRole('region', { name: 'Security feature list' });
    await expect(pane.getByRole('table')).toHaveCount(1);
    expect(Math.round((await box(page.locator('main thead tr').first())).height)).toBe(28);
    expect(Math.round((await box(addButton(page))).height)).toBe(28);
    // Add is at the end of the header's line
    const header = await box(title.locator('..'));
    const add = await box(addButton(page));
    expect(Math.abs(add.y + add.height / 2 - (header.y + header.height / 2))).toBeLessThan(2);
    expect(add.x + add.width).toBeGreaterThan(header.x + header.width - 20);
    // A row's text is 12px, and the target is an identifier in mono
    expect((await style(rowOf(page, 'Regional row filter'), ['font-size']))['font-size']).toBe('12px');
    expect((await style(pane.getByText('main.sales.orders', { exact: true }), ['font-family']))['font-family'])
      .toMatch(/mono|Menlo|Consolas|Courier/i);
    expect((await style(pane.getByText('Regional row filter', { exact: true }), ['font-family']))['font-family'])
      .not.toMatch(/mono|Menlo|Consolas|Courier/i);
  });

  test('a 200-character feature name wraps and causes no horizontal page scroll', async ({ page }) => {
    await setUp(page, WITH_LONG);
    const main = page.locator('main');
    const longs = [
      main.getByText(/^Mask every column that holds personal data/),
      main.getByText(UNBROKEN_NAME, { exact: true }),
      main.getByText(LONG_TARGET, { exact: true }),
    ];
    for (const el of longs) {
      await expect(el).toBeVisible();
      expect(await el.evaluate((n) => n.scrollWidth <= n.clientWidth)).toBe(true);
      expect((await box(el)).height).toBeGreaterThan(30);
      // The title attribute carries the whole text
      expect(((await el.getAttribute('title')) ?? '').length).toBeGreaterThanOrEqual(189);
    }
    // A long condition wraps inside its badge
    const condition = main.getByText('c'.repeat(150), { exact: true });
    expect(await condition.evaluate((n) => n.scrollWidth <= n.clientWidth + 1)).toBe(true);
    expect(await noPageScroll(page)).toBe(true);
    const pane = page.getByRole('region', { name: 'Security feature list' });
    expect(await pane.evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(true);
  });

  test('the dialog is the kit Dialog, with 28px fields, and nothing in it is mono', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 560 });
    await setUp(page);
    await page.setViewportSize({ width: 1280, height: 560 });
    const dialog = await openAdd(page);
    await expect(dialog).toHaveClass(/mantine-Modal-content/);
    expect(await style(dialog, ['border-top-left-radius'])).toEqual({ 'border-top-left-radius': '8px' });
    expect(Math.round((await box(dialog)).width)).toBe(560);
    for (const name of ['Name', 'Type', 'Target']) {
      const field = dialog.getByRole('textbox', { name });
      expect(Math.round((await box(field)).height)).toBe(28);
      expect((await style(field, ['font-family']))['font-family']).not.toMatch(/mono|Menlo|Consolas|Courier/i);
    }
    await expect(dialog.getByRole('button', { name: 'Add Feature' })).toBeInViewport();
    await expect(dialog.getByRole('heading', { name: 'Add Security Feature' })).toBeInViewport();
    expect(await noPageScroll(page)).toBe(true);
  });

  test('feature dialog: Escape in an open Select closes only the Select', async ({ page }) => {
    await setUp(page);
    const dialog = await openAdd(page);
    const name = dialog.getByRole('textbox', { name: 'Name' });
    await name.fill('Tokenize card numbers');
    const target = dialog.getByRole('textbox', { name: 'Target' });
    await target.fill('main.pay.cards');

    await dialog.getByRole('textbox', { name: 'Type' }).click();
    const list = page.getByRole('listbox');
    await expect(list.getByRole('option', { name: 'Tokenization' })).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(list).toHaveCount(0);
    await expect(dialog).toBeVisible();
    await expect(page.getByRole('alertdialog')).toHaveCount(0);
    await expect(name).toHaveValue('Tokenize card numbers');
    await expect(target).toHaveValue('main.pay.cards');

    // A chosen option stays chosen; the next Escape is the dialog's
    await dialog.getByRole('textbox', { name: 'Type' }).click();
    await page.getByRole('option', { name: 'Tokenization' }).click();
    await expect(dialog.getByRole('textbox', { name: 'Type' })).toHaveValue('Tokenization');
    await page.keyboard.press('Escape');
    await expect(dialog).toHaveCount(0);
    await expect(addButton(page)).toBeFocused();
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
    await mockApi(page, PERSONAS.admin, { ...DATA_FIXTURES, '/api/security-features': [] });
    await page.goto('/security-features');
    await expect(page.locator('main').getByText('No security features yet.')).toBeVisible();
    await expect(addButton(page)).toBeEnabled();
    expect(await noPageScroll(page)).toBe(true);
    await capture(page, 'empty');

    // A failed load: the error, then Retry, which brings the list back
    let failing = true;
    await page.route((url) => url.pathname === '/api/security-features', (route) =>
      failing ? route.fulfill({ status: 500, json: { detail: 'boom' } }) : route.fallback());
    await page.reload();
    const pane = page.getByRole('region', { name: 'Security feature list' });
    await expect(pane.getByRole('alert')).toContainText('Failed to load security features');
    await expect(addButton(page)).toBeEnabled();
    failing = false;
    await page.unroute((url) => url.pathname === '/api/security-features');
    await mockApi(page, PERSONAS.admin, { ...DATA_FIXTURES, '/api/security-features': base });
    await pane.getByRole('button', { name: 'Retry' }).click();
    await expect(pane.getByText('Regional row filter', { exact: true })).toBeVisible();
  });

  test('delete confirm is an alertdialog, sends once and returns focus', async ({ page }) => {
    let deletes = 0;
    let gone = false;
    await setUp(page, base);
    await page.route((url) => url.pathname.startsWith('/api/security-features'), async (route) => {
      const req = route.request();
      const url = new URL(req.url());
      if (req.method() === 'DELETE') {
        deletes += 1;
        gone = true;
        await new Promise((r) => setTimeout(r, 300));
        return route.fulfill({ status: 204, body: '' });
      }
      if (req.method() === 'GET' && url.pathname === '/api/security-features' && gone) {
        return route.fulfill({ json: base.filter((f) => f.id !== 'e2e-sec-1') });
      }
      return route.fallback();
    });

    // Cancel: nothing sent, focus back on the row's delete button
    const del = rowOf(page, 'Regional row filter').locator('button').nth(1);
    await del.click();
    const confirm = page.getByRole('alertdialog');
    await expect(confirm).toBeVisible();
    await expect(confirm).toContainText('Regional row filter');
    expect(await style(confirm, ['border-top-left-radius'])).toEqual({ 'border-top-left-radius': '8px' });
    await confirm.getByRole('button', { name: 'Cancel' }).click();
    await expect(confirm).toHaveCount(0);
    await expect(del).toBeFocused();
    expect(deletes).toBe(0);

    // Confirm with a double click: one request, the row goes, focus is on Add
    await del.click();
    await page.getByRole('alertdialog').getByRole('button', { name: 'Delete' }).dblclick();
    await expect(page.getByRole('alertdialog')).toHaveCount(0);
    await expect(page.locator('main').getByText('Regional row filter', { exact: true })).toHaveCount(0);
    expect(deletes).toBe(1);
    await expect(addButton(page)).toBeFocused();
  });
});
