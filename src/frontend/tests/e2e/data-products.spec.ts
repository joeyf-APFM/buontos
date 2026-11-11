/**
 * Wave 2 Task 4: Data Products (/data-products) and My Products
 * (/my-products) on the page kit, measured in a real browser (ruling R10:
 * jsdom ignores the cascade). The list is full bleed: the shell's breadcrumb,
 * the kit header, then one pane holding the shared DataTable or the graph.
 * My Products stacks a domain browser pane and the subscribed products pane.
 *
 * CAPTURE=before|after also saves images of the pages and the create dialog to
 * .superpowers/sdd/2026-11-10-mantine-restyle-wave-2/task-4-images/.
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test, type Locator, type Page } from '@playwright/test';
import { mockApi } from './fixtures/api';
import { DATA_FIXTURES } from './fixtures/data';
import { PERSONAS } from './fixtures/personas';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const IMAGES = path.resolve(HERE, '../../../../.superpowers/sdd/2026-11-10-mantine-restyle-wave-2/task-4-images');
const CAPTURE = process.env.CAPTURE;

const NAVY = 'rgb(31, 48, 102)';

// Review Focus 1: a 200-character product name
const LONG_NAME = `Quarterly ${'revenue-and-margin-by-region-'.repeat(7)}`.slice(0, 200);

const style = (loc: Locator, props: string[]) =>
  loc.evaluate((el, names) => {
    const cs = getComputedStyle(el);
    return Object.fromEntries(names.map((n) => [n, cs.getPropertyValue(n)]));
  }, props);

const box = async (loc: Locator) => (await loc.boundingBox())!;

const PRODUCTS = DATA_FIXTURES['/api/data-products'] as Record<string, unknown>[];
const LONG_PRODUCT = { ...PRODUCTS[0], id: 'e2e-product-long', name: LONG_NAME };
// And one with no break opportunity at all, so only overflow-wrap can wrap it
const UNBROKEN_NAME = 'x'.repeat(200);
const UNBROKEN_PRODUCT = { ...PRODUCTS[0], id: 'e2e-product-unbroken', name: UNBROKEN_NAME };

const DOMAINS = [
  { id: 'e2e-domain-1', name: 'Sales', parent_id: null, description: 'Selling things', children_count: 1 },
  { id: 'e2e-domain-2', name: 'Retail', parent_id: 'e2e-domain-1', description: 'Shops', children_count: 0 },
];

const noPageScroll = (page: Page) =>
  page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);

async function setUp(page: Page, route: string, extra: Record<string, unknown> = {}) {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.clock.setFixedTime(new Date('2026-11-09T12:00:00Z'));
  await mockApi(page, PERSONAS.admin, { ...DATA_FIXTURES, '/api/data-domains': DOMAINS, ...extra });
  await page.goto(route);
}

async function setUpList(page: Page, extra: Record<string, unknown> = {}) {
  await setUp(page, '/data-products', extra);
  await expect(page.getByRole('heading', { level: 1, name: 'Data Products' })).toBeVisible();
  await expect(page.locator('main').getByText('Sales orders', { exact: true })).toBeVisible();
}

async function setUpMine(page: Page, list: unknown[] = PRODUCTS) {
  await setUp(page, '/my-products', { '/api/data-products/my-subscriptions': list });
  await expect(page.getByRole('heading', { level: 1, name: 'My Products' })).toBeVisible();
}

async function capture(page: Page, name: string) {
  if (!CAPTURE) return;
  await page.mouse.move(0, 0);
  await page.waitForTimeout(400);
  await page.screenshot({ path: path.join(IMAGES, `${name}-${CAPTURE}.png`), animations: 'disabled', caret: 'hide' });
}

test.describe('captures', () => {
  test('captures the pages and the create dialog', async ({ page }) => {
    test.skip(!CAPTURE, 'only with CAPTURE=before|after');
    await setUpList(page, { '/api/data-products': [...PRODUCTS, LONG_PRODUCT] });
    await capture(page, 'data-products');
    await page.getByRole('button', { name: 'Graph View' }).click();
    await expect(page.locator('.react-flow')).toBeVisible();
    await capture(page, 'data-products-graph');
    await page.getByRole('button', { name: 'Table View', exact: true }).click();

    await page.getByRole('button', { name: 'Create Product' }).click();
    const dialog = page.getByRole('dialog', { name: 'Create Data Product (ODPS v1.0.0)' });
    await expect(dialog).toBeVisible();
    await capture(page, 'dialog-create');
    await dialog.getByRole('button', { name: 'Create Product' }).click();
    await expect(dialog.getByText('Product name is required')).toBeVisible();
    await capture(page, 'dialog-create-invalid');

    await setUpMine(page, [...PRODUCTS, LONG_PRODUCT]);
    await expect(page.locator('main').getByText('Sales orders', { exact: true })).toBeVisible();
    await capture(page, 'my-products');
    await setUpMine(page, []);
    await expect(page.getByRole('button', { name: 'Browse Marketplace' })).toBeVisible();
    await capture(page, 'my-products-empty');
  });
});

test.describe('data products', () => {
  test('is full bleed, under the shell breadcrumb, with the kit header and one pane', async ({ page }) => {
    await setUpList(page);
    const main = page.locator('main');
    expect(await style(main, ['padding-top', 'padding-left'])).toEqual({ 'padding-top': '0px', 'padding-left': '0px' });
    const kitPage = main.locator('[data-full-bleed]');
    await expect(kitPage).toHaveCount(1);
    const mainBox = await box(main);
    const crumbBar = await box(main.getByRole('navigation', { name: 'Breadcrumb' }).locator('..'));
    expect(Math.round(crumbBar.height + (await box(kitPage)).height)).toBe(Math.round(mainBox.height));

    const title = page.getByRole('heading', { level: 1, name: 'Data Products' });
    expect(await style(title, ['font-size', 'color'])).toEqual({ 'font-size': '16px', color: NAVY });
    expect(Math.round((await box(title)).x - mainBox.x)).toBe(14);

    const pane = page.getByRole('region', { name: 'Data product list' });
    await expect(pane.getByRole('table')).toHaveCount(1);
    expect(Math.round((await box(page.locator('main thead tr').first())).height)).toBe(28);
  });

  test('a 200-character name wraps and causes no horizontal page scroll', async ({ page }) => {
    await setUpList(page, { '/api/data-products': [...PRODUCTS, LONG_PRODUCT, UNBROKEN_PRODUCT] });
    for (const text of [LONG_NAME, UNBROKEN_NAME]) {
      const name = page.locator('main').getByText(text, { exact: true });
      await expect(name).toBeVisible();
      expect(await name.evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(true);
      expect((await box(name)).height).toBeGreaterThan(30);
    }
    expect(await noPageScroll(page)).toBe(true);
    const pane = page.getByRole('region', { name: 'Data product list' });
    expect(await pane.evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(true);
  });

  test('the graph fills the pane', async ({ page }) => {
    await setUpList(page);
    await page.getByRole('button', { name: 'Graph View' }).click();
    const pane = page.getByRole('region', { name: 'Data product list' });
    const graph = pane.locator('.react-flow');
    await expect(graph).toBeVisible();
    expect((await box(graph)).height).toBeGreaterThan(400);
    expect(await noPageScroll(page)).toBe(true);
    // The graph's own switch back to the table
    await pane.getByRole('button', { name: 'Switch to Table View' }).click();
    await expect(pane.getByRole('table')).toHaveCount(1);
  });

  test('both view modes keep their row actions: a graph node opens its product', async ({ page }) => {
    await setUpList(page);
    const row = page.locator('main tbody tr', { has: page.getByText('Sales orders', { exact: true }) });
    await expect(row.getByRole('button')).toHaveCount(3);
    await page.getByRole('button', { name: 'Graph View' }).click();
    const node = page.locator('.react-flow__node').filter({ hasText: 'Sales orders' }).getByRole('button');
    await expect(node).toBeVisible();
    await node.click();
    await expect(page).toHaveURL(/\/data-products\/e2e-product-1$/);
  });
});

test.describe('my products', () => {
  test('stacks the domain browser and the products in kit panes', async ({ page }) => {
    await setUpMine(page);
    const main = page.locator('main');
    const title = page.getByRole('heading', { level: 1, name: 'My Products' });
    expect(await style(title, ['font-size', 'color'])).toEqual({ 'font-size': '16px', color: NAVY });
    expect(Math.round((await box(title)).x - (await box(main)).x)).toBe(14);
    await expect(page.getByRole('region', { name: 'Browse Data Domains' })).toBeVisible();
    await expect(page.getByRole('region', { name: 'Subscribed products' })).toBeVisible();
    await expect(main.getByText('Sales orders', { exact: true })).toBeVisible();
  });

  test('a 200-character name is truncated with a title and causes no horizontal page scroll', async ({ page }) => {
    await setUpMine(page, [...PRODUCTS, LONG_PRODUCT, UNBROKEN_PRODUCT]);
    for (const text of [LONG_NAME, UNBROKEN_NAME]) {
      const name = page.locator('main').getByText(text, { exact: true });
      await expect(name).toBeVisible();
      await expect(name).toHaveAttribute('title', text);
      expect(await style(name, ['text-overflow', 'white-space'])).toEqual({ 'text-overflow': 'ellipsis', 'white-space': 'nowrap' });
    }
    expect(await noPageScroll(page)).toBe(true);
  });
});
