/**
 * Wave 3 Task 6: Entitlements (/entitlements) on the page kit, measured in a
 * real browser (ruling R10: jsdom ignores the cascade). The baselines show only
 * the unselected state (ruling R6), so this spec clicks through: it selects a
 * persona and covers the Access Privileges tab, the Group Assignments tab, and
 * the create, edit, Add Privilege and delete dialogs.
 *
 * CAPTURE=before|after also saves images to
 * .superpowers/sdd/2026-11-13-mantine-restyle-wave-3/task-6-images/.
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test, type Locator, type Page } from '@playwright/test';
import { mockApi } from './fixtures/api';
import { DATA_FIXTURES } from './fixtures/data';
import { PERSONAS } from './fixtures/personas';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const IMAGES = path.resolve(HERE, '../../../../.superpowers/sdd/2026-11-13-mantine-restyle-wave-3/task-6-images');
const CAPTURE = process.env.CAPTURE;

const NAVY = 'rgb(31, 48, 102)';
const LIST = '/api/entitlements/personas';

// Review Focus 1: a 200-character persona name, in two forms. One has spaces;
// the other has no break opportunity at all, so only overflow-wrap can wrap it.
const SPACED_NAME = `Steward of every partner dataset ${'and owner of its quality rules '.repeat(8)}`.slice(0, 199) + '.';
const UNBROKEN_NAME = 'x'.repeat(200);
const LONG_SECURABLE = `main.${'y'.repeat(190)}`;

type Rec = Record<string, unknown>;
const base = DATA_FIXTURES[LIST] as Rec[];
const WITH_LONG = [
  ...base,
  { ...base[1], id: 'e2e-persona-spaced', name: SPACED_NAME, privileges: [{ securable_id: LONG_SECURABLE, securable_type: 'table', permission: 'WRITE' }] },
  { ...base[1], id: 'e2e-persona-unbroken', name: UNBROKEN_NAME },
];

const style = (loc: Locator, props: string[]) =>
  loc.evaluate((el, names) => {
    const cs = getComputedStyle(el);
    return Object.fromEntries(names.map((n) => [n, cs.getPropertyValue(n)]));
  }, props);

const box = async (loc: Locator) => (await loc.boundingBox())!;

const noPageScroll = (page: Page) =>
  page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);

const MONO = /mono|Menlo|Consolas|Courier/i;

async function setUp(page: Page, data: unknown = base, extra: Record<string, unknown> = {}) {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.clock.setFixedTime(new Date('2026-11-09T12:00:00Z'));
  await mockApi(page, PERSONAS.admin, { ...DATA_FIXTURES, [LIST]: data, ...extra });
  await page.goto('/entitlements');
  await expect(page.getByRole('heading', { level: 1, name: 'Entitlements' })).toBeVisible();
  await expect(page.locator('main').getByText('Data Steward', { exact: true })).toBeVisible();
}

async function capture(page: Page, name: string) {
  if (!CAPTURE) return;
  await page.mouse.move(0, 0);
  await page.waitForTimeout(400);
  await page.screenshot({ path: path.join(IMAGES, `${name}-${CAPTURE}.png`), animations: 'disabled', caret: 'hide' });
}

const createButton = (page: Page) => page.getByRole('button', { name: 'Create Persona' });
const detail = (page: Page, name: string) => page.getByRole('region', { name, exact: true });
const personaRow = (page: Page, name: string | RegExp) => page.locator('main').getByRole('option', { name });
const pick = (page: Page, name: string | RegExp) => personaRow(page, name).click();

test.describe('captures', () => {
  test('captures the page, both tabs and the dialogs', async ({ page }) => {
    test.skip(!CAPTURE, 'only with CAPTURE=before|after');
    await setUp(page, WITH_LONG);
    await capture(page, 'entitlements');
    await page.locator('main').getByText('Data Steward', { exact: true }).click();
    await capture(page, 'selected');
    await page.getByRole('tab', { name: 'Group Assignments' }).click();
    await capture(page, 'groups');
    await page.getByRole('tab', { name: 'Access Privileges' }).click();
    await createButton(page).click();
    await capture(page, 'dialog-create');
    await page.keyboard.press('Escape');
    // (the old page deselected the persona when Create opened)
    await page.locator('main').getByText('Data Steward', { exact: true }).first().click();
    await page.getByRole('button', { name: 'Edit', exact: true }).click();
    await capture(page, 'dialog-edit');
    await page.keyboard.press('Escape');
    await page.getByRole('button', { name: 'Add Privilege' }).click();
    await capture(page, 'dialog-add-privilege');
    await page.keyboard.press('Escape');
    if (CAPTURE === 'after') {
      await page.getByRole('button', { name: 'Delete', exact: true }).click();
      await capture(page, 'dialog-delete');
    }
  });
});

test.describe('entitlements', () => {
  test('is under the shell breadcrumb, with the kit header and two panes of 1/4 and 3/4', async ({ page }) => {
    await setUp(page);
    const main = page.locator('main');
    expect(await style(main, ['padding-top', 'padding-left'])).toEqual({ 'padding-top': '0px', 'padding-left': '0px' });

    const title = page.getByRole('heading', { level: 1, name: 'Entitlements' });
    expect(await style(title, ['font-size', 'color'])).toEqual({ 'font-size': '16px', color: NAVY });
    const mainBox = await box(main);
    expect(Math.round((await box(title)).x - mainBox.x)).toBe(14);
    // Create Persona is at the end of the header's line, 28px tall
    expect(Math.round((await box(createButton(page))).height)).toBe(28);
    const header = await box(title.locator('..'));
    const add = await box(createButton(page));
    expect(Math.abs(add.y + add.height / 2 - (header.y + header.height / 2))).toBeLessThan(2);
    expect(add.x + add.width).toBeGreaterThan(header.x + header.width - 20);

    // 1/4 and 3/4 of the width, side by side, sharing one border
    const list = await box(page.getByRole('region', { name: 'Personas', exact: true }));
    const side = await box(detail(page, 'Select a Persona'));
    expect(Math.abs(side.width / list.width - 3)).toBeLessThan(0.05);
    expect(Math.abs(list.x + list.width - side.x)).toBeLessThanOrEqual(1);
    expect(Math.round(list.y)).toBe(Math.round(side.y));

    // The hint, with nothing selected
    await expect(detail(page, 'Select a Persona').getByText('Select a persona to view details')).toBeVisible();
    // The list: 28px rows at 12px
    const row = personaRow(page, /Data Steward/);
    expect(Math.round((await box(row)).height)).toBe(28);
    expect((await style(row, ['font-size']))['font-size']).toBe('12px');
    expect((await style(row.getByText('Data Steward', { exact: true }), ['font-family']))['font-family']).not.toMatch(MONO);
    expect(await noPageScroll(page)).toBe(true);
  });

  test('selecting a persona fills the detail pane: tabs, privileges in mono, groups', async ({ page }) => {
    await setUp(page);
    await pick(page, /Data Steward/);
    const pane = detail(page, 'Data Steward');
    await expect(pane).toBeVisible();
    await expect(personaRow(page, /Data Steward/)).toHaveAttribute('aria-selected', 'true');
    // The selected row carries the accent bar
    expect((await style(personaRow(page, /Data Steward/), ['box-shadow']))['box-shadow']).not.toBe('none');
    expect(await style(pane.getByRole('heading', { level: 2 }), ['color'])).toEqual({ color: NAVY });
    for (const name of ['Edit', 'Delete', 'Add Privilege']) {
      expect(Math.round((await box(pane.getByRole('button', { name, exact: true }))).height)).toBe(28);
    }

    // Access Privileges: id and type, the identifier in mono, the permission in a badge
    const tab = pane.getByRole('tab', { name: 'Access Privileges' });
    await expect(tab).toHaveAttribute('aria-selected', 'true');
    expect(Math.round((await box(tab)).height)).toBe(30);
    expect((await style(pane.getByText('main.sales.orders', { exact: true }), ['font-family']))['font-family']).toMatch(MONO);
    expect((await style(pane.getByText('table', { exact: true }), ['font-family']))['font-family']).not.toMatch(MONO);
    for (const text of ['MANAGE', 'READ']) await expect(pane.getByText(text, { exact: true })).toBeVisible();
    // The permission colours differ: warning for MANAGE, info for READ (the outline badge carries the tone in its text)
    const manage = (await style(pane.getByText('MANAGE', { exact: true }), ['color']))['color'];
    const read = (await style(pane.getByText('READ', { exact: true }), ['color']))['color'];
    expect(manage).not.toBe(read);
    expect(Math.round((await box(pane.getByRole('button', { name: 'Remove privilege' }).first())).height)).toBe(24);
    await capture(page, 'selected');

    // Group Assignments
    await pane.getByRole('tab', { name: 'Group Assignments' }).click();
    await expect(pane.getByRole('tab', { name: 'Group Assignments' })).toHaveAttribute('aria-selected', 'true');
    await expect(pane.getByText('Add Groups')).toBeVisible();
    await expect(pane.getByText('data-stewards')).toBeVisible();
    await expect(pane.getByText('data-governance')).toBeVisible();
    await expect(pane.getByText('main.sales.orders')).toHaveCount(0);
    expect(await noPageScroll(page)).toBe(true);
    await capture(page, 'groups');

    // Another persona: its own privileges
    await pick(page, /Analyst/);
    await expect(detail(page, 'Analyst')).toBeVisible();
  });

  test('arrow keys move through the persona list, and Enter selects', async ({ page }) => {
    await setUp(page);
    const rows = page.locator('main').getByRole('listbox', { name: 'Personas' }).getByRole('option');
    await rows.first().focus();
    await page.keyboard.press('ArrowDown');
    await expect(rows.nth(1)).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(rows.nth(1)).toHaveAttribute('aria-selected', 'true');
    await expect(detail(page, 'Analyst')).toBeVisible();
    await page.keyboard.press('ArrowUp');
    await expect(rows.first()).toBeFocused();
    expect(await rows.first().evaluate((el) => getComputedStyle(el).outlineStyle)).not.toBe('none');
  });

  test('a 200-character persona name wraps or truncates with a title, and causes no horizontal page scroll', async ({ page }) => {
    await setUp(page, WITH_LONG);
    const main = page.locator('main');
    for (const [name, match] of [[SPACED_NAME, /^Steward of every partner dataset/], [UNBROKEN_NAME, /^x{200}/]] as const) {
      const row = personaRow(page, match);
      await expect(row).toBeVisible();
      // In the list: one 28px line, truncated, with the whole name in its title
      expect(Math.round((await box(row)).height)).toBe(28);
      expect(await row.getByText(name, { exact: true }).getAttribute('title')).toBe(name);
      expect(await noPageScroll(page)).toBe(true);
      await row.click();
      // In the detail header: one line, truncated, with the title
      const heading = main.getByRole('heading', { level: 2, name });
      await expect(heading).toBeVisible();
      expect(await heading.getAttribute('title')).toBe(name);
      expect(await heading.evaluate((el) => el.getBoundingClientRect().right <= (el.parentElement as HTMLElement).getBoundingClientRect().right + 1)).toBe(true);
      expect(await noPageScroll(page)).toBe(true);
      // The Edit and Delete buttons stay in view
      await expect(detail(page, name).getByRole('button', { name: 'Delete', exact: true })).toBeInViewport();
    }
    // A long securable wraps in its privilege row
    await personaRow(page, /^Steward of every/).click();
    const long = main.getByText(LONG_SECURABLE, { exact: true });
    await expect(long).toBeVisible();
    expect(await long.evaluate((n) => n.scrollWidth <= n.clientWidth)).toBe(true);
    expect((await box(long)).height).toBeGreaterThan(30);
    expect(await long.getAttribute('title')).toBe(LONG_SECURABLE);
    expect(await noPageScroll(page)).toBe(true);
    expect(await main.evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(true);
  });

  test('the dialogs are the kit Dialog, with 28px fields, and nothing in them is mono', async ({ page }) => {
    await setUp(page);
    await page.setViewportSize({ width: 1280, height: 560 });
    await createButton(page).click();
    const create = page.getByRole('dialog', { name: 'Create New Persona' });
    await expect(create).toBeVisible();
    await expect(create).toHaveClass(/mantine-Modal-content/);
    expect(await style(create, ['border-top-left-radius'])).toEqual({ 'border-top-left-radius': '8px' });
    expect(Math.round((await box(create)).width)).toBe(560);
    const name = create.getByRole('textbox', { name: /Persona Name/ });
    expect(Math.round((await box(name)).height)).toBe(28);
    expect((await style(name, ['font-family']))['font-family']).not.toMatch(MONO);
    await expect(name).toBeFocused();
    await expect(create.getByRole('button', { name: 'Create Persona' })).toBeInViewport();
    await capture(page, 'dialog-create');
    await page.keyboard.press('Escape');
    await expect(create).toHaveCount(0);
    await expect(createButton(page)).toBeFocused();

    await pick(page, /Data Steward/);
    await page.getByRole('button', { name: 'Edit', exact: true }).click();
    const edit = page.getByRole('dialog', { name: 'Edit Persona' });
    await expect(edit.getByRole('textbox', { name: /Persona Name/ })).toHaveValue('Data Steward');
    await expect(edit.getByRole('textbox', { name: 'Description' })).toHaveValue('Curates and approves data assets');
    await capture(page, 'dialog-edit');
    await page.keyboard.press('Escape');
    await expect(edit).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Edit', exact: true })).toBeFocused();

    await page.getByRole('button', { name: 'Add Privilege' }).click();
    const add = page.getByRole('dialog', { name: 'Add Privilege' });
    for (const label of [/Securable ID/, 'Securable Type', 'Permission']) {
      const field = add.getByRole('textbox', { name: label });
      expect(Math.round((await box(field)).height)).toBe(28);
      expect((await style(field, ['font-family']))['font-family']).not.toMatch(MONO);
    }
    await expect(add.getByRole('textbox', { name: 'Securable Type' })).toHaveValue('Table');
    await expect(add.getByRole('textbox', { name: 'Permission' })).toHaveValue('READ');
    await expect(add.getByRole('button', { name: 'Add', exact: true })).toBeDisabled();
    await capture(page, 'dialog-add-privilege');
    expect(await noPageScroll(page)).toBe(true);
  });

  test('Escape in an open Select closes only the Select (Add Privilege dialog)', async ({ page }) => {
    await setUp(page);
    await pick(page, /Data Steward/);
    await page.getByRole('button', { name: 'Add Privilege' }).click();
    const dialog = page.getByRole('dialog', { name: 'Add Privilege' });
    const id = dialog.getByRole('textbox', { name: /Securable ID/ });
    await id.fill('main.finance.ledger');

    for (const field of ['Securable Type', 'Permission']) {
      await dialog.getByRole('textbox', { name: field }).click();
      const list = page.locator('.mantine-Select-dropdown:visible');
      await expect(list.getByRole('option').first()).toBeVisible();
      await page.keyboard.press('Escape');
      await expect(list).toHaveCount(0);
      await expect(dialog).toBeVisible();
      await expect(id).toHaveValue('main.finance.ledger');
    }

    // A chosen option stays chosen, and the chosen one cannot be cleared by choosing it again
    await dialog.getByRole('textbox', { name: 'Permission' }).click();
    await page.getByRole('option', { name: 'WRITE' }).click();
    await dialog.getByRole('textbox', { name: 'Permission' }).click();
    await page.getByRole('option', { name: 'WRITE' }).click();
    await expect(dialog.getByRole('textbox', { name: 'Permission' })).toHaveValue('WRITE');
    // The next Escape is the dialog's, and focus goes back to Add Privilege
    await page.keyboard.press('Escape');
    await expect(dialog).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Add Privilege' })).toBeFocused();
  });

  test('a click outside a dialog leaves it open, and Escape waits while a save is out', async ({ page }) => {
    await setUp(page);
    let release: () => void = () => {};
    const held = new Promise<void>((resolve) => { release = resolve; });
    let posts = 0;
    await page.route((url) => url.pathname === LIST, async (route) => {
      if (route.request().method() !== 'POST') return route.fallback();
      posts += 1;
      await held;
      return route.fulfill({ json: base[0] });
    });
    await createButton(page).click();
    const dialog = page.getByRole('dialog', { name: 'Create New Persona' });
    await dialog.getByRole('textbox', { name: /Persona Name/ }).fill('Kept');
    await page.mouse.click(20, 780);
    await page.waitForTimeout(400);
    await expect(dialog).toBeVisible();

    await dialog.getByRole('button', { name: 'Create Persona' }).dblclick();
    await expect.poll(() => posts).toBe(1);
    await page.keyboard.press('Escape');
    await page.waitForTimeout(400);
    await expect(dialog).toBeVisible();
    release();
    await expect(dialog).toHaveCount(0);
    expect(posts).toBe(1);
  });

  test('empty and error states keep their message and actions', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await mockApi(page, PERSONAS.admin, { ...DATA_FIXTURES, [LIST]: [] });
    await page.goto('/entitlements');
    await expect(page.locator('main').getByText('No personas found. Create one to get started.')).toBeVisible();
    await expect(createButton(page)).toBeEnabled();
    expect(await noPageScroll(page)).toBe(true);
    await capture(page, 'empty');

    // A failed load: the error, then Retry, which brings the list back
    let failing = true;
    await page.route((url) => url.pathname === LIST, (route) =>
      failing ? route.fulfill({ status: 500, json: { detail: 'boom' } }) : route.fallback());
    await page.reload();
    const pane = page.getByRole('region', { name: 'Personas', exact: true });
    await expect(pane.getByRole('alert')).toContainText('Failed to load personas');
    await expect(createButton(page)).toBeEnabled();
    failing = false;
    await page.unroute((url) => url.pathname === LIST);
    await mockApi(page, PERSONAS.admin, { ...DATA_FIXTURES, [LIST]: base });
    await pane.getByRole('button', { name: 'Retry' }).click();
    await expect(pane.getByText('Data Steward', { exact: true })).toBeVisible();
    await expect(pane.getByRole('alert')).toHaveCount(0);
  });

  test('delete confirms are alertdialogs, send once and return focus (persona and privilege)', async ({ page }) => {
    await setUp(page, base);
    let personaDeletes = 0;
    let privilegeDeletes = 0;
    let gone = false;
    await page.route((url) => url.pathname.startsWith('/api/entitlements/personas'), async (route) => {
      const req = route.request();
      const url = new URL(req.url());
      if (req.method() === 'DELETE' && url.pathname.includes('/privileges/')) {
        privilegeDeletes += 1;
        await new Promise((r) => setTimeout(r, 300));
        return route.fulfill({ json: { ...base[0], privileges: (base[0].privileges as Rec[]).slice(1) } });
      }
      if (req.method() === 'DELETE') {
        personaDeletes += 1;
        gone = true;
        await new Promise((r) => setTimeout(r, 300));
        return route.fulfill({ status: 204, body: '' });
      }
      if (req.method() === 'GET' && url.pathname === LIST && gone) {
        return route.fulfill({ json: base.filter((p) => p.id !== 'e2e-persona-1') });
      }
      return route.fallback();
    });
    await pick(page, /Data Steward/);
    const pane = detail(page, 'Data Steward');

    // Privilege: Cancel sends nothing and focus is back on the row's button
    const remove = pane.getByRole('button', { name: 'Remove privilege' }).first();
    await remove.click();
    const confirm = page.getByRole('alertdialog');
    await expect(confirm).toBeVisible();
    await expect(confirm).toContainText('main.sales.orders');
    expect(await style(confirm, ['border-top-left-radius'])).toEqual({ 'border-top-left-radius': '8px' });
    await confirm.getByRole('button', { name: 'Cancel' }).click();
    await expect(confirm).toHaveCount(0);
    await expect(remove).toBeFocused();
    expect(privilegeDeletes).toBe(0);
    // Confirm with a double click: one request, the row goes, focus is on Add Privilege
    await remove.click();
    await page.getByRole('alertdialog').getByRole('button', { name: 'Remove' }).dblclick();
    await expect(page.getByRole('alertdialog')).toHaveCount(0);
    await expect(pane.getByText('main.sales.orders', { exact: true })).toHaveCount(0);
    expect(privilegeDeletes).toBe(1);
    await expect(page.getByRole('button', { name: 'Add Privilege' })).toBeFocused();
    await capture(page, 'dialog-remove');

    // Persona
    const del = pane.getByRole('button', { name: 'Delete', exact: true });
    await del.click();
    const personaConfirm = page.getByRole('alertdialog');
    await expect(personaConfirm).toContainText('Data Steward');
    await capture(page, 'dialog-delete');
    await personaConfirm.getByRole('button', { name: 'Cancel' }).click();
    await expect(personaConfirm).toHaveCount(0);
    await expect(del).toBeFocused();
    expect(personaDeletes).toBe(0);
    await del.click();
    await page.getByRole('alertdialog').getByRole('button', { name: 'Delete' }).dblclick();
    await expect(page.getByRole('alertdialog')).toHaveCount(0);
    await expect(page.locator('main').getByText('Data Steward', { exact: true })).toHaveCount(0);
    expect(personaDeletes).toBe(1);
    await expect(detail(page, 'Select a Persona')).toBeVisible();
    await expect(createButton(page)).toBeFocused();
  });
});
