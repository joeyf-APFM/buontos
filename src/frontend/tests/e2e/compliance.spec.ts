/**
 * Wave 3 Task 2: Compliance (/compliance) on the page kit, measured in a real
 * browser (ruling R10: jsdom ignores the cascade). The list is full bleed: the
 * shell's breadcrumb, the kit header, then one pane holding the four figures
 * and the shared DataTable. The create/edit dialog and the delete confirm are
 * the kit Dialog.
 *
 * CAPTURE=before|after also saves images of the page and its dialogs to
 * .superpowers/sdd/2026-11-13-mantine-restyle-wave-3/task-2-images/.
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test, type Locator, type Page } from '@playwright/test';
import { mockApi } from './fixtures/api';
import { DATA_FIXTURES } from './fixtures/data';
import { PERSONAS } from './fixtures/personas';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const IMAGES = path.resolve(HERE, '../../../../.superpowers/sdd/2026-11-13-mantine-restyle-wave-3/task-2-images');
const CAPTURE = process.env.CAPTURE;

const NAVY = 'rgb(31, 48, 102)';

// Review Focus 1: Task 1's fixtures hold a 200-character policy name
// (e2e-policy-4, with spaces); this one has no break opportunity at all, so
// only overflow-wrap can wrap it
const UNBROKEN_NAME = 'x'.repeat(200);
const LONG_NAME_START = /^Every data product that holds personal data/;

const base = DATA_FIXTURES['/api/compliance/policies'] as { policies: Record<string, unknown>[]; stats: unknown };
const WITH_UNBROKEN = {
  ...base,
  policies: [...base.policies, { ...base.policies[0], id: 'e2e-policy-unbroken', name: UNBROKEN_NAME }],
};

const style = (loc: Locator, props: string[]) =>
  loc.evaluate((el, names) => {
    const cs = getComputedStyle(el);
    return Object.fromEntries(names.map((n) => [n, cs.getPropertyValue(n)]));
  }, props);

const box = async (loc: Locator) => (await loc.boundingBox())!;

const noPageScroll = (page: Page) =>
  page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);

async function setUp(page: Page, list: unknown = base) {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.clock.setFixedTime(new Date('2026-11-09T12:00:00Z'));
  await mockApi(page, PERSONAS.admin, { ...DATA_FIXTURES, '/api/compliance/policies': list });
  await page.goto('/compliance');
  await expect(page.getByRole('heading', { level: 1, name: 'Compliance' })).toBeVisible();
  await expect(page.locator('main').getByText('Owner assigned', { exact: true })).toBeVisible();
}

async function capture(page: Page, name: string) {
  if (!CAPTURE) return;
  await page.mouse.move(0, 0);
  await page.waitForTimeout(400);
  await page.screenshot({ path: path.join(IMAGES, `${name}-${CAPTURE}.png`), animations: 'disabled', caret: 'hide' });
}

const rowOf = (page: Page, name: string) => page.locator('main tbody tr', { hasText: name });

async function openCreate(page: Page) {
  await page.getByRole('button', { name: 'Create Rule' }).click();
  const dialog = page.getByRole('dialog', { name: 'Create New Compliance Rule' });
  await expect(dialog).toBeVisible();
  return dialog;
}

test.describe('captures', () => {
  test('captures the page and its dialogs', async ({ page }) => {
    test.skip(!CAPTURE, 'only with CAPTURE=before|after');
    await setUp(page, WITH_UNBROKEN);
    await capture(page, 'compliance');
    await openCreate(page);
    await capture(page, 'dialog-create');
    await page.keyboard.press('Escape');
    await rowOf(page, 'Owner assigned').getByRole('button', { name: 'Open' }).click();
    await page.getByRole('menuitem', { name: 'Edit' }).click();
    await expect(page.getByRole('dialog', { name: 'Edit Compliance Rule' })).toBeVisible();
    await capture(page, 'dialog-edit');
    await page.keyboard.press('Escape');
    await rowOf(page, 'Owner assigned').getByRole('button', { name: 'Open' }).click();
    await page.getByRole('menuitem', { name: 'Delete' }).click();
    await expect(page.getByRole('alertdialog')).toBeVisible();
    await capture(page, 'dialog-delete');
  });
});

test.describe('compliance', () => {
  test('is full bleed, under the shell breadcrumb, with the kit header and one pane', async ({ page }) => {
    await setUp(page);
    const main = page.locator('main');
    expect(await style(main, ['padding-top', 'padding-left'])).toEqual({ 'padding-top': '0px', 'padding-left': '0px' });
    const kitPage = main.locator('[data-full-bleed]');
    await expect(kitPage).toHaveCount(1);
    const mainBox = await box(main);
    const crumbBar = await box(main.getByRole('navigation', { name: 'Breadcrumb' }).locator('..'));
    expect(Math.round(crumbBar.height + (await box(kitPage)).height)).toBe(Math.round(mainBox.height));

    const title = page.getByRole('heading', { level: 1, name: 'Compliance' });
    expect(await style(title, ['font-size', 'color'])).toEqual({ 'font-size': '16px', color: NAVY });
    expect(Math.round((await box(title)).x - mainBox.x)).toBe(14);

    const pane = page.getByRole('region', { name: 'Policy list' });
    await expect(pane.getByRole('table')).toHaveCount(1);
    expect(Math.round((await box(page.locator('main thead tr').first())).height)).toBe(28);
    expect(Math.round((await box(page.getByRole('button', { name: 'Create Rule' }))).height)).toBe(28);
    // The figures: a 12px label over a 16px value
    const label = pane.getByText('Overall Compliance', { exact: true });
    expect(await style(label, ['font-size'])).toEqual({ 'font-size': '12px' });
    expect((await style(pane.getByText('77%'), ['font-size']))['font-size']).toBe('16px');
  });

  test('a 200-character policy name wraps and causes no horizontal page scroll', async ({ page }) => {
    await setUp(page, WITH_UNBROKEN);
    const long = page.locator('main').getByText(LONG_NAME_START);
    for (const name of [long, page.locator('main').getByText(UNBROKEN_NAME, { exact: true })]) {
      await expect(name).toBeVisible();
      expect(await name.evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(true);
      expect((await box(name)).height).toBeGreaterThan(30);
      // The title attribute carries the whole name
      expect((await name.getAttribute('title'))?.length).toBe(200);
    }
    expect(await noPageScroll(page)).toBe(true);
    const pane = page.getByRole('region', { name: 'Policy list' });
    expect(await pane.evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(true);
  });

  test('a row click opens the policy; the row menu does not', async ({ page }) => {
    await setUp(page);
    await rowOf(page, 'Owner assigned').getByRole('button', { name: 'Open' }).click();
    await expect(page.getByRole('menuitem', { name: 'Edit' })).toBeVisible();
    await page.keyboard.press('Escape');
    await rowOf(page, 'PII is tagged').getByText('PII is tagged').click();
    await expect(page).toHaveURL(/\/compliance\/policies\/e2e-policy-2$/);
  });

  test('the policy dialog is the kit Dialog, with the rule in mono and the rest not', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 560 });
    await setUp(page);
    await page.setViewportSize({ width: 1280, height: 560 });
    const dialog = await openCreate(page);
    await expect(dialog).toHaveClass(/mantine-Modal-content/);
    expect(await style(dialog, ['border-top-left-radius'])).toEqual({ 'border-top-left-radius': '8px' });
    expect(Math.round((await box(dialog)).width)).toBe(720);

    const mono = async (loc: Locator) => (await style(loc, ['font-family']))['font-family'];
    const ruleFont = await mono(dialog.getByRole('textbox', { name: /^Rule Code/ }));
    expect(ruleFont).toMatch(/mono|Menlo|Consolas|Courier/i);
    for (const name of [/^Name/, /^Description/, /^Failure Message/]) {
      expect(await mono(dialog.getByRole('textbox', { name }))).not.toBe(ruleFont);
    }
    // 28px fields; the title and the buttons stay in view in a short window
    expect(Math.round((await box(dialog.getByRole('textbox', { name: /^Name/ }))).height)).toBe(28);
    expect(Math.round((await box(dialog.getByRole('textbox', { name: 'Category' }))).height)).toBe(28);
    await expect(dialog.getByRole('button', { name: 'Save' })).toBeInViewport();
    await expect(dialog.getByRole('heading', { name: 'Create New Compliance Rule' })).toBeInViewport();
    expect(await noPageScroll(page)).toBe(true);
  });

  test('policy dialog: Escape in an open Select closes only the Select', async ({ page }) => {
    await setUp(page);
    const dialog = await openCreate(page);
    const name = dialog.getByRole('textbox', { name: /^Name/ });
    await name.fill('Orders have a retention period');
    const rule = dialog.getByRole('textbox', { name: /^Rule Code/ });
    await rule.fill('MATCH (t:table) ASSERT t.retention IS NOT NULL');

    for (const [field, option] of [['Category', 'Privacy'], ['Severity', 'Critical']] as const) {
      await dialog.getByRole('textbox', { name: field }).click();
      const list = page.getByRole('listbox');
      await expect(list.getByRole('option', { name: option })).toBeVisible();
      await page.keyboard.press('Escape');
      await expect(list).toHaveCount(0);
      await expect(dialog).toBeVisible();
      await expect(page.getByRole('alertdialog')).toHaveCount(0);
      await expect(name).toHaveValue('Orders have a retention period');
      await expect(rule).toHaveValue('MATCH (t:table) ASSERT t.retention IS NOT NULL');
    }

    // A chosen option stays chosen; the next Escape is the dialog's
    await dialog.getByRole('textbox', { name: 'Category' }).click();
    await page.getByRole('option', { name: 'Privacy' }).click();
    await expect(dialog.getByRole('textbox', { name: 'Category' })).toHaveValue('Privacy');
    await page.keyboard.press('Escape');
    await expect(dialog).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Create Rule' })).toBeFocused();
  });

  test('a click outside the policy dialog leaves it open, as the Radix dialog did', async ({ page }) => {
    await setUp(page);
    const dialog = await openCreate(page);
    await dialog.getByRole('textbox', { name: /^Name/ }).fill('Kept');
    await page.mouse.click(20, 780);
    await page.waitForTimeout(400);
    await expect(dialog).toBeVisible();
    await expect(dialog.getByRole('textbox', { name: /^Name/ })).toHaveValue('Kept');
  });

  test('delete confirm is an alertdialog, sends once and returns focus', async ({ page }) => {
    let deletes = 0;
    let gone = false;
    await setUp(page, base);
    await page.route((url) => url.pathname.startsWith('/api/compliance/policies'), async (route) => {
      const req = route.request();
      const url = new URL(req.url());
      if (req.method() === 'DELETE') {
        deletes += 1;
        gone = true;
        await new Promise((r) => setTimeout(r, 300));
        return route.fulfill({ status: 204, body: '' });
      }
      if (req.method() === 'GET' && url.pathname === '/api/compliance/policies' && gone) {
        return route.fulfill({ json: { ...base, policies: base.policies.filter((p) => p.id !== 'e2e-policy-1') } });
      }
      return route.fallback();
    });

    // Cancel: nothing sent, focus back on the row's menu button
    const open = rowOf(page, 'Owner assigned').getByRole('button', { name: 'Open' });
    await open.click();
    await page.getByRole('menuitem', { name: 'Delete' }).click();
    const confirm = page.getByRole('alertdialog');
    await expect(confirm).toBeVisible();
    await expect(confirm).toContainText('Owner assigned');
    expect(await style(confirm, ['border-top-left-radius'])).toEqual({ 'border-top-left-radius': '8px' });
    await confirm.getByRole('button', { name: 'Cancel' }).click();
    await expect(confirm).toHaveCount(0);
    await expect(open).toBeFocused();
    expect(deletes).toBe(0);

    // Confirm with a double click: one request, the row goes, focus is on Create Rule
    await open.click();
    await page.getByRole('menuitem', { name: 'Delete' }).click();
    await page.getByRole('alertdialog').getByRole('button', { name: 'Delete' }).dblclick();
    await expect(page.getByRole('alertdialog')).toHaveCount(0);
    await expect(page.locator('main').getByText('Owner assigned', { exact: true })).toHaveCount(0);
    expect(deletes).toBe(1);
    await expect(page.getByRole('button', { name: 'Create Rule' })).toBeFocused();
  });
});
