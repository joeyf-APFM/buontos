/**
 * Wave 2 Task 5: My Requests (/my-requests), Business Owners
 * (/business-owners) and Owner Consumers (/owner-consumers) on the page kit,
 * measured in a real browser (ruling R10: jsdom ignores the cascade).
 *
 * CAPTURE=before|after also saves images of the pages to
 * .superpowers/sdd/2026-11-10-mantine-restyle-wave-2/task-5-images/.
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test, type Locator, type Page } from '@playwright/test';
import { mockApi } from './fixtures/api';
import { DATA_FIXTURES } from './fixtures/data';
import { PERSONAS } from './fixtures/personas';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const IMAGES = path.resolve(HERE, '../../../../.superpowers/sdd/2026-11-10-mantine-restyle-wave-2/task-5-images');
const CAPTURE = process.env.CAPTURE;

const NAVY = 'rgb(31, 48, 102)';

// Review Focus 1: a 200-character name, with break opportunities and without
const LONG_NAME = `Quarterly ${'revenue-and-margin-by-region-'.repeat(7)}`.slice(0, 200);
const UNBROKEN_NAME = 'x'.repeat(200);
const LONG_EMAIL = `${'y'.repeat(188)}@example.com`;

const request = (id: string, name: string, status: string) => ({
  id, requester_email: 'e2e.user@example.com', entity_type: 'data_product', entity_id: `e2e-product-${id}`,
  entity_name: name, requested_duration_days: 30, permission_level: 'READ', reason: 'Reporting', status,
  created_at: '2026-11-01T09:00:00Z', handled_at: status === 'pending' ? null : '2026-11-02T09:00:00Z',
  handled_by: null, admin_message: null,
});
const REQUESTS = [
  request('r1', 'Sales orders', 'pending'),
  request('r2', LONG_NAME, 'approved'),
  request('r3', UNBROKEN_NAME, 'pending'),
];

const owner = (id: string, name: string | null, email: string) => ({
  id, object_type: 'data_product', object_id: `e2e-product-${id}`, user_email: email, user_name: name,
  role_id: 'role-1', role_name: 'Data Owner', is_active: true, assigned_at: '2026-11-01T09:00:00Z',
  removed_at: null, created_by: 'e2e.user@example.com',
});
const OWNERS = [
  owner('o1', 'Rita Owner', 'rita@example.com'),
  owner('o2', LONG_NAME, 'long@example.com'),
  owner('o3', UNBROKEN_NAME, 'unbroken@example.com'),
];

const SUBSCRIBERS = {
  subscribers: [
    { email: 'sam@example.com', subscribed_at: '2026-11-01T09:00:00Z', reason: 'Weekly reporting' },
    { email: LONG_EMAIL, subscribed_at: '2026-11-02T09:00:00Z', reason: LONG_NAME },
    { email: `${UNBROKEN_NAME}@example.com`, subscribed_at: '2026-11-03T09:00:00Z', reason: null },
  ],
};

const PRODUCTS = DATA_FIXTURES['/api/data-products'] as Record<string, unknown>[];
const LONG_PRODUCT = { ...PRODUCTS[0], id: 'e2e-product-long', name: LONG_NAME };

const FIXTURES = {
  '/api/access-grants/my-requests': { requests: REQUESTS, total: REQUESTS.length },
  '/api/business-owners': OWNERS,
  '/api/data-products': [...PRODUCTS, LONG_PRODUCT],
  '/api/data-products/e2e-product-1/subscribers': SUBSCRIBERS,
};

const style = (loc: Locator, props: string[]) =>
  loc.evaluate((el, names) => {
    const cs = getComputedStyle(el);
    return Object.fromEntries(names.map((n) => [n, cs.getPropertyValue(n)]));
  }, props);

const box = async (loc: Locator) => (await loc.boundingBox())!;

const noPageScroll = (page: Page) =>
  page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);

/** The kit panes in <main> that scroll sideways, by name (none should). */
const panesScrollingSideways = (page: Page) =>
  page.locator('main section').evaluateAll((panes) =>
    panes
      .filter((p) => [p, ...p.querySelectorAll('*')].some((el) => el.scrollWidth > el.clientWidth + 1
        && ['auto', 'scroll'].includes(getComputedStyle(el).overflowX)))
      .map((p) => p.getAttribute('aria-label') ?? p.querySelector('h2')?.textContent ?? '?'));

/** No page scroll, and no pane scrolling sideways, at 1280px and at 1024px (M4). */
async function expectNoSidewaysScroll(page: Page) {
  for (const width of [1280, 1024]) {
    await page.setViewportSize({ width, height: 800 });
    await page.waitForTimeout(100);
    expect(await noPageScroll(page), `page scroll at ${width}px`).toBe(true);
    expect(await panesScrollingSideways(page), `panes scrolling at ${width}px`).toEqual([]);
  }
}

async function setUp(page: Page, route: string, title: string) {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.clock.setFixedTime(new Date('2026-11-09T12:00:00Z'));
  await mockApi(page, PERSONAS.admin, { ...DATA_FIXTURES, ...FIXTURES });
  await page.goto(route);
  await expect(page.getByRole('heading', { level: 1, name: title })).toBeVisible();
}

async function capture(page: Page, name: string) {
  if (!CAPTURE) return;
  await page.mouse.move(0, 0);
  await page.waitForTimeout(400);
  await page.screenshot({ path: path.join(IMAGES, `${name}-${CAPTURE}.png`), animations: 'disabled', caret: 'hide' });
}

/** The kit's title: 16px navy, 14px in from <main>. */
async function expectKitTitle(page: Page, title: string) {
  const heading = page.getByRole('heading', { level: 1, name: title });
  expect(await style(heading, ['font-size', 'color'])).toEqual({ 'font-size': '16px', color: NAVY });
  expect(Math.round((await box(heading)).x - (await box(page.locator('main'))).x)).toBe(14);
}

/** A long text wraps inside its own box (no overflow), or is cut off with a title. */
async function expectFits(loc: Locator, text: string) {
  await expect(loc).toBeVisible();
  const fits = await loc.evaluate((el) => el.scrollWidth <= el.clientWidth);
  if (!fits) {
    await expect(loc).toHaveAttribute('title', text);
    expect(await style(loc, ['text-overflow'])).toEqual({ 'text-overflow': 'ellipsis' });
  }
}

test.describe('captures', () => {
  test('captures the three pages', async ({ page }) => {
    test.skip(!CAPTURE, 'only with CAPTURE=before|after');
    await setUp(page, '/my-requests', 'My Requests');
    await expect(page.locator('main').getByText('Sales orders', { exact: true })).toBeVisible();
    await capture(page, 'my-requests');
    await page.getByRole('tab', { name: /My Subscriptions/ }).click();
    await capture(page, 'my-requests-subscriptions');

    await setUp(page, '/business-owners', 'Business Owners');
    await expect(page.locator('main').getByText('Rita Owner', { exact: true })).toBeVisible();
    await capture(page, 'business-owners');

    await page.setViewportSize({ width: 1280, height: 800 });
    await page.clock.setFixedTime(new Date('2026-11-09T12:00:00Z'));
    await mockApi(page, PERSONAS.admin, { ...DATA_FIXTURES, ...FIXTURES });
    await page.goto('/owner-consumers');
    await expect(page.locator('main').getByText('sam@example.com', { exact: true })).toBeVisible();
    await capture(page, 'owner-consumers');
  });
});

test.describe('my requests', () => {
  test('has the kit header, and its tabs over a pane', async ({ page }) => {
    await setUp(page, '/my-requests', 'My Requests');
    await expectKitTitle(page, 'My Requests');
    const pane = page.getByRole('region', { name: 'Access Requests' });
    await expect(pane.getByRole('table')).toHaveCount(1);
    expect(Math.round((await box(pane.locator('thead tr').first())).height)).toBe(28);
    await expect(page.getByRole('tab', { name: /Access Requests/ })).toHaveAttribute('aria-selected', 'true');
  });

  test('a 200-character name causes no horizontal page scroll', async ({ page }) => {
    await setUp(page, '/my-requests', 'My Requests');
    for (const text of [LONG_NAME, UNBROKEN_NAME]) {
      // The link wraps inside its cell's box, and reads in full
      const link = page.locator('main').getByRole('link', { name: text, exact: true });
      await expectFits(link.locator('..'), text);
      expect((await box(link)).height).toBeGreaterThan(30);
    }
    await expectNoSidewaysScroll(page);
  });
});

test.describe('business owners', () => {
  test('is full bleed with the kit header and one pane', async ({ page }) => {
    await setUp(page, '/business-owners', 'Business Owners');
    await expectKitTitle(page, 'Business Owners');
    await expect(page.locator('main [data-full-bleed]')).toHaveCount(1);
    await expect(page.getByRole('region', { name: 'Business owner list' }).getByRole('table')).toHaveCount(1);
  });

  test('a 200-character owner name causes no horizontal page scroll', async ({ page }) => {
    await setUp(page, '/business-owners', 'Business Owners');
    for (const text of [LONG_NAME, UNBROKEN_NAME]) {
      await expectFits(page.locator('main').getByText(text, { exact: true }), text);
    }
    await expectNoSidewaysScroll(page);
  });
});

test.describe('owner consumers', () => {
  async function setUpConsumers(page: Page) {
    await setUp(page, '/owner-consumers', 'Consumers');
    await expect(page.locator('main').getByText('sam@example.com', { exact: true })).toBeVisible();
  }

  test('has the kit header and two panes side by side', async ({ page }) => {
    await setUpConsumers(page);
    await expectKitTitle(page, 'Consumers');
    const products = await box(page.getByRole('region', { name: 'Products' }));
    const subscribers = await box(page.getByRole('region', { name: /^Subscribers/ }));
    expect(Math.round(products.y)).toBe(Math.round(subscribers.y));
    expect(products.x + products.width).toBeLessThanOrEqual(subscribers.x + 1);
    expect(Math.round((await box(page.locator('main tbody tr').first())).height)).toBe(28);
  });

  test('a 200-character subscriber or product name causes no horizontal page scroll', async ({ page }) => {
    await setUpConsumers(page);
    await expectFits(page.locator('main').getByText(LONG_EMAIL, { exact: true }), LONG_EMAIL);
    await expectFits(page.locator('main').getByText(`${UNBROKEN_NAME}@example.com`, { exact: true }), `${UNBROKEN_NAME}@example.com`);
    await expectFits(page.getByRole('region', { name: 'Products' }).getByText(LONG_NAME, { exact: true }), LONG_NAME);
    await expectNoSidewaysScroll(page);
  });

  test('the summary strip wraps with a rule between every cell, and none at its edge', async ({ page }) => {
    await setUpConsumers(page);
    await page.setViewportSize({ width: 560, height: 800 });
    const strip = page.getByRole('group', { name: 'Summary' });
    const cells = strip.locator(':scope > div');
    await expect(cells).toHaveCount(3);
    // The strip wraps onto a second row
    const tops = await cells.evaluateAll((els) => els.map((el) => Math.round(el.getBoundingClientRect().top)));
    expect(new Set(tops).size).toBeGreaterThan(1);
    // The 1px gap draws the rules, in both directions; no cell has its own
    expect(await style(strip, ['row-gap', 'column-gap'])).toEqual({ 'row-gap': '1px', 'column-gap': '1px' });
    for (const cell of await cells.all()) {
      expect(await style(cell, ['border-left-width', 'border-top-width'])).toEqual({ 'border-left-width': '0px', 'border-top-width': '0px' });
    }
    // The last cell fills its row, so no empty slot shows beside it
    const stripBox = await box(strip);
    const last = await box(cells.last());
    expect(Math.round(last.x + last.width)).toBe(Math.round(stripBox.x + stripBox.width - 1));
  });
});
