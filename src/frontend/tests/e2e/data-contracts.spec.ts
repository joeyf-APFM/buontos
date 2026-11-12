/**
 * Wave 2 Task 6: Data Contracts (/data-contracts) on the page kit, measured in
 * a real browser (ruling R10: jsdom ignores the cascade). The list is full
 * bleed: the shell's breadcrumb, the kit header, then one pane holding the
 * shared DataTable. The create and upload dialogs are the kit Dialog.
 *
 * CAPTURE=before|after also saves images of the page and its dialogs to
 * .superpowers/sdd/2026-11-10-mantine-restyle-wave-2/task-6-images/.
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test, type Locator, type Page } from '@playwright/test';
import { mockApi } from './fixtures/api';
import { DATA_FIXTURES } from './fixtures/data';
import { PERSONAS } from './fixtures/personas';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const IMAGES = path.resolve(HERE, '../../../../.superpowers/sdd/2026-11-10-mantine-restyle-wave-2/task-6-images');
const CAPTURE = process.env.CAPTURE;

const NAVY = 'rgb(31, 48, 102)';

// Review Focus 1: a 200-character contract name
const LONG_NAME = `Quarterly ${'revenue-and-margin-by-region-'.repeat(7)}`.slice(0, 200);
// And one with no break opportunity at all, so only overflow-wrap can wrap it
const UNBROKEN_NAME = 'x'.repeat(200);

const contract = (id: string, name: string, status: string, extra: Record<string, unknown> = {}) => ({
  id, name, status, version: '1.0.0', owner_team_name: 'Sales', tags: [], domainIds: [],
  created: '2026-10-01T09:00:00Z', updated: '2026-11-02T15:30:00Z',
  ...extra,
});
const CONTRACTS = [
  contract('e2e-contract-1', 'Orders contract', 'active', { versionCount: 3 }),
  contract('e2e-contract-2', 'Customer contract', 'draft', { draftOwnerId: 'rita@example.com' }),
];
const LONG = [
  ...CONTRACTS,
  contract('e2e-contract-long', LONG_NAME, 'proposed'),
  contract('e2e-contract-unbroken', UNBROKEN_NAME, 'deprecated'),
];

const style = (loc: Locator, props: string[]) =>
  loc.evaluate((el, names) => {
    const cs = getComputedStyle(el);
    return Object.fromEntries(names.map((n) => [n, cs.getPropertyValue(n)]));
  }, props);

const box = async (loc: Locator) => (await loc.boundingBox())!;

const noPageScroll = (page: Page) =>
  page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);

async function setUp(page: Page, list: unknown[] = CONTRACTS) {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.clock.setFixedTime(new Date('2026-11-09T12:00:00Z'));
  await mockApi(page, PERSONAS.admin, {
    ...DATA_FIXTURES,
    '/api/data-contracts': list,
    '/api/teams/summary': [{ id: 'e2e-team-1', name: 'Sales Analytics' }],
    '/api/user/projects': { projects: [{ id: 'e2e-project-1', name: 'Revenue', team_count: 2 }], current_project_id: null },
  });
  await page.goto('/data-contracts');
  await expect(page.getByRole('heading', { level: 1, name: 'Data Contracts' })).toBeVisible();
  if (list.length) await expect(page.locator('main').getByText('Orders contract', { exact: true })).toBeVisible();
}

async function capture(page: Page, name: string) {
  if (!CAPTURE) return;
  await page.mouse.move(0, 0);
  await page.waitForTimeout(400);
  await page.screenshot({ path: path.join(IMAGES, `${name}-${CAPTURE}.png`), animations: 'disabled', caret: 'hide' });
}

async function openCreate(page: Page) {
  await page.getByRole('button', { name: 'New Contract' }).click();
  const dialog = page.getByRole('dialog', { name: 'Create New Data Contract' });
  await expect(dialog).toBeVisible();
  return dialog;
}

test.describe('captures', () => {
  test('captures the page and its dialogs', async ({ page }) => {
    test.skip(!CAPTURE, 'only with CAPTURE=before|after');
    await setUp(page, LONG);
    await capture(page, 'data-contracts');
    await openCreate(page);
    await capture(page, 'dialog-create');
    await page.keyboard.press('Escape');
    await page.getByRole('button', { name: 'Upload File' }).click();
    await expect(page.getByRole('dialog', { name: 'Upload Data Contract' })).toBeVisible();
    await capture(page, 'dialog-upload');
    await page.keyboard.press('Escape');
    await setUp(page, []);
    await capture(page, 'data-contracts-empty');
  });
});

test.describe('data contracts', () => {
  test('is full bleed, under the shell breadcrumb, with the kit header and one pane', async ({ page }) => {
    await setUp(page);
    const main = page.locator('main');
    expect(await style(main, ['padding-top', 'padding-left'])).toEqual({ 'padding-top': '0px', 'padding-left': '0px' });
    const kitPage = main.locator('[data-full-bleed]');
    await expect(kitPage).toHaveCount(1);
    const mainBox = await box(main);
    const crumbBar = await box(main.getByRole('navigation', { name: 'Breadcrumb' }).locator('..'));
    expect(Math.round(crumbBar.height + (await box(kitPage)).height)).toBe(Math.round(mainBox.height));

    const title = page.getByRole('heading', { level: 1, name: 'Data Contracts' });
    expect(await style(title, ['font-size', 'color'])).toEqual({ 'font-size': '16px', color: NAVY });
    expect(Math.round((await box(title)).x - mainBox.x)).toBe(14);

    const pane = page.getByRole('region', { name: 'Data contract list' });
    await expect(pane.getByRole('table')).toHaveCount(1);
    expect(Math.round((await box(page.locator('main thead tr').first())).height)).toBe(28);
    // The toolbar's controls are 28px
    expect(Math.round((await box(page.getByRole('button', { name: 'New Contract' }))).height)).toBe(28);
    expect(Math.round((await box(page.getByRole('button', { name: 'Upload File' }))).height)).toBe(28);
  });

  test('a 200-character name wraps and causes no horizontal page scroll', async ({ page }) => {
    await setUp(page, LONG);
    for (const text of [LONG_NAME, UNBROKEN_NAME]) {
      const name = page.locator('main').getByText(text, { exact: true });
      await expect(name).toBeVisible();
      expect(await name.evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(true);
      expect((await box(name)).height).toBeGreaterThan(30);
    }
    expect(await noPageScroll(page)).toBe(true);
    const pane = page.getByRole('region', { name: 'Data contract list' });
    expect(await pane.evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(true);
  });

  test('Escape in a Select inside the create dialog closes only the Select, and the typed name survives', async ({ page }) => {
    await setUp(page);
    const dialog = await openCreate(page);
    await expect(dialog).toHaveClass(/mantine-Modal-content/);
    const name = dialog.getByRole('textbox', { name: /Name/ });
    await name.fill('Orders v2');

    await dialog.getByRole('textbox', { name: 'Status' }).click();
    const list = page.getByRole('listbox');
    await expect(list.getByRole('option', { name: 'Proposed' })).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(list).toHaveCount(0);
    await expect(dialog).toBeVisible();
    await expect(page.getByRole('alertdialog')).toHaveCount(0);
    await expect(name).toHaveValue('Orders v2');

    // The same in the Owner Team Select
    await dialog.getByRole('textbox', { name: 'Owner Team' }).click();
    await expect(page.getByRole('option', { name: 'Sales Analytics' })).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.getByRole('listbox')).toHaveCount(0);
    await expect(dialog).toBeVisible();
    await expect(name).toHaveValue('Orders v2');

    // And in the Project Select
    await dialog.getByRole('textbox', { name: 'Project' }).click();
    await expect(page.getByRole('option', { name: 'Revenue (2 teams)' })).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.getByRole('listbox')).toHaveCount(0);
    await expect(dialog).toBeVisible();
    await expect(name).toHaveValue('Orders v2');

    // The next Escape is the dialog's: with a typed name, it asks first
    await page.keyboard.press('Escape');
    await expect(page.getByRole('alertdialog', { name: 'Discard unsaved changes?' })).toBeVisible();
    await page.getByRole('button', { name: 'Continue Editing' }).click();
    await expect(page.getByRole('alertdialog')).toHaveCount(0);
    await expect(name).toHaveValue('Orders v2');
  });

  test('a click outside the create dialog leaves it open, as the Radix dialog did', async ({ page }) => {
    await setUp(page);
    const dialog = await openCreate(page);
    // Untouched: a click on the overlay would close it
    await page.mouse.click(20, 780);
    await page.waitForTimeout(400);
    await expect(dialog).toBeVisible();
    // Typed in: it would ask to discard
    await dialog.getByRole('textbox', { name: /Name/ }).fill('Orders v2');
    await page.mouse.click(20, 780);
    await page.waitForTimeout(400);
    await expect(page.getByRole('alertdialog')).toHaveCount(0);
    await expect(dialog.getByRole('textbox', { name: /Name/ })).toHaveValue('Orders v2');
  });

  test('the create dialog keeps its title and buttons in view, with 28px fields', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 560 });
    await setUp(page);
    await page.setViewportSize({ width: 1280, height: 560 });
    const dialog = await openCreate(page);
    expect(Math.round((await box(dialog)).width)).toBe(720);
    expect(Math.round((await box(dialog.getByRole('textbox', { name: /Name/ }))).height)).toBe(28);
    expect(Math.round((await box(dialog.getByRole('textbox', { name: 'Status' }))).height)).toBe(28);
    const create = dialog.getByRole('button', { name: 'Create Contract' });
    await expect(create).toBeInViewport();
    await expect(dialog.getByRole('heading', { name: 'Create New Data Contract' })).toBeInViewport();
    expect(await noPageScroll(page)).toBe(true);
  });

  test('the upload dialog is the kit Dialog, with its switches and paste box', async ({ page }) => {
    await setUp(page);
    await page.getByRole('button', { name: 'Upload File' }).click();
    const dialog = page.getByRole('dialog', { name: 'Upload Data Contract' });
    await expect(dialog).toHaveClass(/mantine-Modal-content/);
    expect(await style(dialog, ['border-top-left-radius'])).toEqual({ 'border-top-left-radius': '8px' });
    for (const name of ['Create missing domains', 'Adopt IDs from file', 'Import duplicate IDs as new copies']) {
      await expect(dialog.getByRole('switch', { name })).not.toBeChecked();
    }
    await expect(dialog.getByRole('textbox', { name: 'Or paste ODCS JSON' })).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(dialog).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Upload File' })).toBeFocused();
  });
});
