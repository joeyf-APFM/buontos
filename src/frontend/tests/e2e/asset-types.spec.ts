/**
 * Task 14: Settings → Asset Types (/settings/asset-types) on the page kit,
 * measured in a real browser (ruling R10: jsdom ignores the cascade). The
 * page is full bleed inside the Settings layout (which draws no padding or
 * sub-navigation of its own): the kit's breadcrumb and header, then one pane
 * holding the shared DataTable. The row menu is a Mantine Menu, and the form
 * and delete dialogs are Mantine Modals.
 *
 * CAPTURE=before|after also saves images of the page and its dialogs to
 * .superpowers/sdd/2026-11-09-mantine-restyle-waves-0-1/task-14-images/.
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test, type Locator, type Page } from '@playwright/test';
import { mockApi } from './fixtures/api';
import { DATA_FIXTURES } from './fixtures/data';
import { PERSONAS, type Persona } from './fixtures/personas';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const IMAGES = path.resolve(HERE, '../../../../.superpowers/sdd/2026-11-09-mantine-restyle-waves-0-1/task-14-images');
const CAPTURE = process.env.CAPTURE;

const NAVY = 'rgb(31, 48, 102)';
const TEXT_SECONDARY = 'rgb(86, 93, 101)';
const CRITICAL = 'rgb(212, 28, 22)';

const LONG_NAME = 'An asset type with a very long name that should wrap inside its cell rather than run on';
const LONG_DESCRIPTION =
  'A long description of this asset type that goes on for well over one hundred characters, so that it can never fit on one line of the table at this width, and must wrap to stay readable.';

const style = (loc: Locator, props: string[]) =>
  loc.evaluate((el, names) => {
    const cs = getComputedStyle(el);
    return Object.fromEntries(names.map((n) => [n, cs.getPropertyValue(n)]));
  }, props);

const box = async (loc: Locator) => (await loc.boundingBox())!;

const ASSET_TYPES = DATA_FIXTURES['/api/asset-types'] as Record<string, unknown>[];
const LONG_TYPE = {
  ...ASSET_TYPES[1], id: 'e2e-type-long', name: LONG_NAME, description: LONG_DESCRIPTION, category: 'integration', status: 'deprecated',
};

async function setUp(page: Page, persona: Persona = PERSONAS.admin, types: unknown[] = [...ASSET_TYPES, LONG_TYPE]) {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.clock.setFixedTime(new Date('2026-11-09T12:00:00Z'));
  await mockApi(page, persona, { ...DATA_FIXTURES, '/api/asset-types': types });
  await page.goto('/settings/asset-types');
  await expect(page.getByRole('heading', { level: 1, name: 'Asset Types' })).toBeVisible();
  await expect(page.locator('main').getByText('Report', { exact: true })).toBeVisible();
}

async function capture(page: Page, name: string) {
  if (!CAPTURE) return;
  await page.mouse.move(0, 0);
  // Let the dialog and menu transitions finish
  await page.waitForTimeout(400);
  await page.screenshot({ path: path.join(IMAGES, `${name}-${CAPTURE}.png`), animations: 'disabled', caret: 'hide' });
}

const rowOf = (page: Page, name: string) => page.locator('main tbody tr', { has: page.getByText(name, { exact: true }) });
const openMenu = (page: Page, name: string) => rowOf(page, name).getByRole('button', { name: 'Open menu' });
/** Focus is inside the open dialog (Mantine's or Radix's). */
const focusInDialog = (page: Page) =>
  page.evaluate(() => !!document.activeElement?.closest('[role="dialog"], [role="alertdialog"]'));

test.describe('captures', () => {
  test('captures the page and its dialogs', async ({ page }) => {
    test.skip(!CAPTURE, 'only with CAPTURE=before|after');
    await setUp(page);
    await capture(page, 'page');

    await openMenu(page, 'Report').click();
    await expect(page.getByRole('menuitem', { name: 'Edit Asset Type' })).toBeVisible();
    await capture(page, 'row-menu');
    await page.keyboard.press('Escape');

    await page.getByRole('button', { name: 'Add Asset Type' }).click();
    const create = page.getByRole('dialog', { name: 'Create Asset Type' });
    await expect(create).toBeVisible();
    await capture(page, 'dialog-create');
    await create.getByRole('button', { name: 'Create' }).click();
    await expect(create.getByText('Name is required')).toBeVisible();
    await capture(page, 'dialog-create-invalid');
    await create.getByLabel('Category', { exact: true }).click();
    await expect(page.getByRole('option', { name: 'Analytics' })).toBeVisible();
    await capture(page, 'dialog-create-category');
    await page.keyboard.press('Escape');
    await page.keyboard.press('Escape');
    await expect(create).toHaveCount(0);

    await openMenu(page, LONG_NAME).click();
    await page.getByRole('menuitem', { name: 'Edit Asset Type' }).click();
    const edit = page.getByRole('dialog', { name: 'Edit Asset Type' });
    await expect(edit.getByRole('textbox', { name: 'Name' })).toHaveValue(LONG_NAME);
    await capture(page, 'dialog-edit');
    await page.keyboard.press('Escape');
    await expect(edit).toHaveCount(0);

    await openMenu(page, 'Report').click();
    await page.getByRole('menuitem', { name: 'Delete Asset Type' }).click();
    await expect(page.getByRole('heading', { name: 'Delete Asset Type?' })).toBeVisible();
    await capture(page, 'dialog-delete');
  });

  test('captures the page as the consumer', async ({ page }) => {
    test.skip(!CAPTURE, 'only with CAPTURE=before|after');
    await setUp(page, PERSONAS.consumer);
    await openMenu(page, 'Report').click();
    await expect(page.getByRole('menuitem', { name: 'Edit Asset Type' })).toBeVisible();
    await capture(page, 'consumer-row-menu');
  });
});

test.describe('the page', () => {
  test('is full bleed in the Settings layout, with the kit breadcrumb and header', async ({ page }) => {
    await setUp(page);
    const main = page.locator('main');
    expect(await style(main, ['padding-top', 'padding-left'])).toEqual({ 'padding-top': '0px', 'padding-left': '0px' });
    const kitPage = main.locator('[data-full-bleed]');
    await expect(kitPage).toHaveCount(1);
    // It fills the main area under the top bar: no page scroll
    const mainBox = await box(main);
    expect(Math.round((await box(kitPage)).height)).toBe(Math.round(mainBox.height));
    expect(await main.evaluate((el) => el.scrollHeight - el.clientHeight)).toBe(0);

    const crumb = page.getByRole('navigation', { name: 'breadcrumb' });
    await expect(crumb).toHaveText(/Asset Types/);
    await expect(crumb.getByRole('link')).toHaveCount(1);

    const title = page.getByRole('heading', { level: 1, name: 'Asset Types' });
    expect(await style(title, ['font-size', 'color'])).toEqual({ 'font-size': '16px', color: NAVY });
    const subtitle = main.getByText('Reusable templates that define how different kinds of assets are structured.');
    expect(await style(subtitle, ['color', 'font-size'])).toEqual({ color: TEXT_SECONDARY, 'font-size': '12px' });

    // The table sits in the one pane, 14px in from the page's edges
    const pane = page.getByRole('region', { name: 'Asset type list' });
    await expect(pane.getByRole('table')).toHaveCount(1);
    const filter = pane.getByRole('textbox', { name: 'Filter names...' });
    expect(Math.round((await box(filter)).x - mainBox.x)).toBe(14);
    expect(Math.round((await box(title)).x - mainBox.x)).toBe(14);
  });

  test('keeps the grid density, and wraps long names and descriptions', async ({ page }) => {
    await setUp(page);
    const header = page.locator('main thead tr').first();
    expect(Math.round((await box(header)).height)).toBe(28);
    expect(Math.round((await box(rowOf(page, 'Report'))).height)).toBe(28);

    // The sort headers are the grid's header labels, with a sort mark
    const sortName = page.getByRole('button', { name: 'Name', exact: true });
    expect(await style(sortName, ['font-size', 'font-weight', 'color'])).toEqual({
      'font-size': '11px', 'font-weight': '600', color: TEXT_SECONDARY,
    });
    expect(Math.round((await box(sortName)).height)).toBeLessThanOrEqual(20);
    const plain = page.locator('main thead th', { hasText: 'Description' });
    expect(await style(plain, ['color'])).toEqual({ color: TEXT_SECONDARY });

    // Long values wrap in full (no ellipsis), in a readable measure
    const longRow = rowOf(page, LONG_NAME);
    const name = longRow.getByText(LONG_NAME, { exact: true });
    const description = longRow.getByText(LONG_DESCRIPTION, { exact: true });
    for (const cell of [name, description]) {
      expect(await cell.evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(true);
      expect(await style(cell, ['white-space', 'text-overflow'])).toEqual({ 'white-space': 'normal', 'text-overflow': 'clip' });
    }
    expect((await box(description)).height).toBeGreaterThan(30);
    expect(Math.round((await box(description)).width)).toBeLessThanOrEqual(420);
    expect(await style(description, ['color'])).toEqual({ color: TEXT_SECONDARY });
  });

  test('sorts by name from the header button', async ({ page }) => {
    await setUp(page);
    const firstName = () => page.locator('main tbody tr').first().locator('td').nth(1);
    await expect(firstName()).toContainText(LONG_NAME);
    // Ascending by name at first; one click turns it round
    await page.getByRole('button', { name: 'Name', exact: true }).click();
    await expect(firstName()).toContainText('Table');
  });

  test('row menu is a Mantine Menu, keyboard reachable, with the delete item in the critical colour', async ({ page }) => {
    await setUp(page);
    const trigger = openMenu(page, 'Report');
    await trigger.focus();
    await page.keyboard.press('Enter');
    const menu = page.getByRole('menu');
    await expect(menu).toBeVisible();
    await expect(menu).toHaveClass(/mantine-Menu-dropdown/);
    await expect(menu.getByText('Actions', { exact: true })).toBeVisible();
    expect(await style(menu.getByText('Actions', { exact: true }), ['color'])).toEqual({ color: TEXT_SECONDARY });
    const del = menu.getByRole('menuitem', { name: 'Delete Asset Type' });
    expect(await style(del, ['color'])).toEqual({ color: CRITICAL });
    await page.keyboard.press('Escape');
    await expect(menu).toHaveCount(0);
    await expect(trigger).toBeFocused();
  });

  test('the consumer sees the menu items disabled', async ({ page }) => {
    await setUp(page, PERSONAS.consumer);
    await expect(page.getByRole('button', { name: 'Add Asset Type' })).toBeDisabled();
    await openMenu(page, 'Report').click();
    await expect(page.getByRole('menuitem', { name: 'Edit Asset Type' })).toBeDisabled();
    await expect(page.getByRole('menuitem', { name: 'Delete Asset Type' })).toBeDisabled();
  });
});

test.describe('the form dialog', () => {
  test('create: a Mantine Modal with 28px fields, focus trapped and returned to the opener', async ({ page }) => {
    await setUp(page);
    const add = page.getByRole('button', { name: 'Add Asset Type' });
    await add.click();
    const dialog = page.getByRole('dialog', { name: 'Create Asset Type' });
    await expect(dialog).toHaveClass(/mantine-Modal-content/);
    await expect(dialog).toHaveAccessibleDescription('Add a new asset type template.');
    expect(Math.round((await box(dialog)).width)).toBe(512);
    expect(await style(dialog, ['border-top-left-radius'])).toEqual({ 'border-top-left-radius': '8px' });
    const name = dialog.getByRole('textbox', { name: 'Name' });
    await expect(name).toBeFocused();
    for (const field of [name, dialog.getByRole('textbox', { name: 'Icon' }), dialog.getByLabel('Category', { exact: true })]) {
      expect(Math.round((await box(field)).height)).toBe(28);
    }
    expect(await style(dialog.getByText('Name', { exact: true }), ['font-size', 'color'])).toEqual({ 'font-size': '12px', color: 'rgb(44, 47, 52)' });

    // Tab and Shift+Tab stay in the dialog
    for (let i = 0; i < 9; i += 1) {
      await page.keyboard.press('Tab');
      expect(await focusInDialog(page)).toBe(true);
    }
    for (let i = 0; i < 3; i += 1) {
      await page.keyboard.press('Shift+Tab');
      expect(await focusInDialog(page)).toBe(true);
    }

    // Choosing a category keeps focus in the dialog; Escape closes only the list
    const category = dialog.getByLabel('Category', { exact: true });
    await category.click();
    await page.getByRole('option', { name: 'Analytics' }).click();
    await expect(category).toHaveValue('Analytics');
    expect(await focusInDialog(page)).toBe(true);
    await category.click();
    await expect(page.getByRole('option', { name: 'Data' })).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.getByRole('option', { name: 'Data' })).toHaveCount(0);
    await expect(dialog).toBeVisible();
    expect(await focusInDialog(page)).toBe(true);

    await page.keyboard.press('Escape');
    await expect(dialog).toHaveCount(0);
    await expect(add).toBeFocused();
  });

  test('create: the empty name is flagged in the critical colour', async ({ page }) => {
    await setUp(page);
    await page.getByRole('button', { name: 'Add Asset Type' }).click();
    const dialog = page.getByRole('dialog', { name: 'Create Asset Type' });
    await dialog.getByRole('button', { name: 'Create' }).click();
    const message = dialog.getByText('Name is required');
    await expect(message).toBeVisible();
    expect(await style(message, ['color'])).toEqual({ color: CRITICAL });
    await expect(dialog.getByRole('textbox', { name: 'Name' })).toHaveAttribute('aria-invalid', 'true');
    // Focus goes to the first invalid field, inside the dialog
    await expect(dialog.getByRole('textbox', { name: 'Name' })).toBeFocused();
  });

  test('create posts the payload and closes', async ({ page }) => {
    await setUp(page);
    const posted: unknown[] = [];
    await page.route((url) => url.pathname === '/api/asset-types', async (route) => {
      if (route.request().method() !== 'POST') return route.fallback();
      posted.push(route.request().postDataJSON());
      return route.fulfill({ json: { ...ASSET_TYPES[1], id: 'new', name: 'Dashboard' } });
    });
    await page.getByRole('button', { name: 'Add Asset Type' }).click();
    const dialog = page.getByRole('dialog', { name: 'Create Asset Type' });
    await dialog.getByRole('textbox', { name: 'Name' }).fill('Dashboard');
    await dialog.getByLabel('Status', { exact: true }).click();
    await page.getByRole('option', { name: 'Deprecated' }).click();
    await dialog.getByRole('button', { name: 'Create' }).click();
    await expect(dialog).toHaveCount(0);
    expect(posted).toEqual([{ name: 'Dashboard', status: 'deprecated' }]);
  });

  test('edit: opened from the row menu, prefilled, long values readable, focus back on the row menu', async ({ page }) => {
    await setUp(page);
    const trigger = openMenu(page, LONG_NAME);
    await trigger.click();
    await page.getByRole('menuitem', { name: 'Edit Asset Type' }).click();
    const dialog = page.getByRole('dialog', { name: 'Edit Asset Type' });
    await expect(dialog).toHaveAccessibleDescription('Update the details of this asset type.');
    await expect(dialog.getByRole('textbox', { name: 'Name' })).toHaveValue(LONG_NAME);
    await expect(dialog.getByLabel('Category', { exact: true })).toHaveValue('Integration');
    await expect(dialog.getByLabel('Status', { exact: true })).toHaveValue('Deprecated');
    const description = dialog.getByRole('textbox', { name: 'Description' });
    await expect(description).toHaveValue(LONG_DESCRIPTION);
    // The whole description shows: the field grows with it
    expect(await description.evaluate((el) => el.scrollHeight <= el.clientHeight + 1)).toBe(true);
    await expect(dialog.getByRole('button', { name: 'Save Changes' })).toBeEnabled();
    expect(await focusInDialog(page)).toBe(true);

    await dialog.getByRole('button', { name: 'Cancel' }).click();
    await expect(dialog).toHaveCount(0);
    await expect(trigger).toBeFocused();
  });
});

test.describe('the delete dialog', () => {
  test('a Mantine Modal: Cancel focused, a click outside keeps it, Delete calls the API', async ({ page }) => {
    await setUp(page);
    const deleted: string[] = [];
    await page.route((url) => url.pathname.startsWith('/api/asset-types/'), async (route) => {
      if (route.request().method() !== 'DELETE') return route.fallback();
      deleted.push(new URL(route.request().url()).pathname);
      return route.fulfill({ json: {} });
    });
    const trigger = openMenu(page, 'Report');
    await trigger.click();
    await page.getByRole('menuitem', { name: 'Delete Asset Type' }).click();
    const dialog = page.getByRole('alertdialog', { name: 'Delete Asset Type?' });
    await expect(dialog).toHaveClass(/mantine-Modal-content/);
    await expect(dialog).toHaveAccessibleDescription(/This action cannot be undone/);
    await expect(dialog.getByRole('button', { name: 'Cancel' })).toBeFocused();
    await expect(dialog.getByRole('button', { name: 'Close' })).toHaveCount(0);
    const del = dialog.getByRole('button', { name: 'Delete' });
    expect(await style(del, ['background-color'])).toEqual({ 'background-color': CRITICAL });

    await page.mouse.click(10, 10);
    await expect(dialog).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(dialog).toHaveCount(0);
    await expect(trigger).toBeFocused();

    await trigger.click();
    await page.getByRole('menuitem', { name: 'Delete Asset Type' }).click();
    await page.getByRole('alertdialog', { name: 'Delete Asset Type?' }).getByRole('button', { name: 'Delete' }).click();
    await expect(page.getByRole('alertdialog', { name: 'Delete Asset Type?' })).toHaveCount(0);
    expect(deleted).toEqual(['/api/asset-types/e2e-type-report']);
  });
});

/** Answers the writes, so a save or delete succeeds; the list reloads from the fixtures. */
async function acceptWrites(page: Page) {
  await page.route((url) => url.pathname.startsWith('/api/asset-types'), async (route) => {
    const method = route.request().method();
    if (method === 'GET') return route.fallback();
    return route.fulfill({ json: method === 'DELETE' ? {} : { ...ASSET_TYPES[1] } });
  });
}

/** Waits for the list to load again after a save (the GET after the write). */
const reloaded = (page: Page) =>
  page.waitForResponse((r) => new URL(r.url()).pathname === '/api/asset-types' && r.request().method() === 'GET');

test.describe('focus after a save or delete', () => {
  test('create: back on Add Asset Type once the list has reloaded', async ({ page }) => {
    await setUp(page);
    await acceptWrites(page);
    await page.getByRole('button', { name: 'Add Asset Type' }).click();
    const dialog = page.getByRole('dialog', { name: 'Create Asset Type' });
    await dialog.getByRole('textbox', { name: 'Name' }).fill('Dashboard');
    const reload = reloaded(page);
    await dialog.getByRole('button', { name: 'Create' }).click();
    await reload;
    await expect(dialog).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Add Asset Type' })).toBeFocused();
  });

  test('edit: back on the row\'s menu button once the list has reloaded', async ({ page }) => {
    await setUp(page);
    await acceptWrites(page);
    await openMenu(page, 'Report').click();
    await page.getByRole('menuitem', { name: 'Edit Asset Type' }).click();
    const dialog = page.getByRole('dialog', { name: 'Edit Asset Type' });
    const reload = reloaded(page);
    await dialog.getByRole('button', { name: 'Save Changes' }).click();
    await reload;
    await expect(dialog).toHaveCount(0);
    await expect(openMenu(page, 'Report')).toBeFocused();
  });

  test('delete: on Add Asset Type once the list has reloaded (the row\'s button is gone)', async ({ page }) => {
    await setUp(page);
    await acceptWrites(page);
    await openMenu(page, 'Report').click();
    await page.getByRole('menuitem', { name: 'Delete Asset Type' }).click();
    const reload = reloaded(page);
    await page.getByRole('alertdialog', { name: 'Delete Asset Type?' }).getByRole('button', { name: 'Delete' }).click();
    await reload;
    await expect(page.getByRole('alertdialog')).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Add Asset Type' })).toBeFocused();
  });

  test('a failed reload: on the page title', async ({ page }) => {
    await setUp(page);
    await acceptWrites(page);
    await page.getByRole('button', { name: 'Add Asset Type' }).click();
    const dialog = page.getByRole('dialog', { name: 'Create Asset Type' });
    await dialog.getByRole('textbox', { name: 'Name' }).fill('Dashboard');
    // The reload fails: the pane shows the error, without the table or Add
    await page.route((url) => url.pathname === '/api/asset-types', (route) =>
      route.request().method() === 'GET' ? route.fulfill({ status: 500, json: { detail: 'Backend down' } }) : route.fallback());
    await dialog.getByRole('button', { name: 'Create' }).click();
    await expect(page.locator('main').getByText('Backend down')).toBeVisible();
    await expect(page.getByRole('heading', { level: 1, name: 'Asset Types' })).toBeFocused();
  });

  test('a slow reload: focus the user moved elsewhere stays there', async ({ page }) => {
    await setUp(page);
    await acceptWrites(page);
    await page.getByRole('button', { name: 'Add Asset Type' }).click();
    const dialog = page.getByRole('dialog', { name: 'Create Asset Type' });
    await dialog.getByRole('textbox', { name: 'Name' }).fill('Dashboard');

    // Hold the reload until the user has moved on
    let release: () => void = () => {};
    const held = new Promise<void>((resolve) => { release = resolve; });
    let reloads = 0;
    await page.route((url) => url.pathname === '/api/asset-types', async (route) => {
      if (route.request().method() !== 'GET') return route.fallback();
      reloads += 1;
      await held;
      return route.fallback();
    });
    await dialog.getByRole('button', { name: 'Create' }).click();
    await expect(dialog).toHaveCount(0);
    await expect.poll(() => reloads).toBe(1);

    // While the list is loading, the user goes to the app's search
    const search = page.getByPlaceholder(/^Search assets, concepts, contracts/);
    await search.focus();
    await expect(search).toBeFocused();

    release();
    await expect(page.getByRole('button', { name: 'Add Asset Type' })).toBeVisible();
    await expect(openMenu(page, 'Report')).toBeVisible();
    // Give any late focus move a chance to happen
    await page.waitForTimeout(300);
    await expect(search).toBeFocused();
  });

  test('a failed delete: back on the row\'s menu button, once', async ({ page }) => {
    await setUp(page);
    await page.route((url) => url.pathname.startsWith('/api/asset-types/'), (route) =>
      route.request().method() === 'DELETE' ? route.fulfill({ status: 409, json: { detail: 'In use' } }) : route.fallback());
    await openMenu(page, 'Report').click();
    await page.getByRole('menuitem', { name: 'Delete Asset Type' }).click();
    await page.getByRole('alertdialog', { name: 'Delete Asset Type?' }).getByRole('button', { name: 'Delete' }).click();
    await expect(page.getByRole('alertdialog')).toHaveCount(0);
    await expect(openMenu(page, 'Report')).toBeFocused();
  });
});

