/**
 * Wave 2 Task 7: a Data Product (/data-products/:id and /my-products/:id) on
 * the page kit, measured in a real browser (ruling R10: jsdom ignores the
 * cascade). Full bleed under the shell's breadcrumb; the kit header (a long
 * name truncates with its title, the actions wrap before the page scrolls
 * sideways), the purpose wrapping under it, and the sections as stacked
 * panes, whose long lists scroll inside them.
 */
import { expect, test, type Locator, type Page } from '@playwright/test';
import { mockApi } from './fixtures/api';
import { DATA_FIXTURES } from './fixtures/data';
import { PERSONAS, type PersonaId } from './fixtures/personas';

const PATH = '/api/data-products/e2e-product-1';
const BASE = DATA_FIXTURES[PATH] as Record<string, unknown>;

// Review Focus 1: a 200-character name and a long purpose
const LONG_NAME = `Quarterly ${'revenue-and-margin-by-region-'.repeat(8)}`.slice(0, 200);
const LONG_PURPOSE = `${'Orders for reporting across every region and channel, refreshed nightly. '.repeat(4)}${'x'.repeat(120)}`.slice(0, 400);

const many = <T,>(n: number, make: (i: number) => T) => Array.from({ length: n }, (_, i) => make(i));
const FULL = {
  ...BASE,
  outputPorts: many(30, (i) => ({ id: `e2e-out-${i}`, name: `orders_gold_${i}`, version: '1.0.0', type: 'table', description: 'Gold orders' })),
  team: { name: 'Sales', members: many(30, (i) => ({ username: `member${i}@example.com`, name: `Member ${i}`, role: 'contributor' })) },
  support: many(3, (i) => ({ channel: `Channel ${i}`, url: `https://example.com/support/${i}`, tool: 'slack' })),
};

const style = (loc: Locator, props: string[]) =>
  loc.evaluate((el, names) => {
    const cs = getComputedStyle(el);
    return Object.fromEntries(names.map((n) => [n, cs.getPropertyValue(n)]));
  }, props);

const noPageScroll = (page: Page) =>
  page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);

async function open(page: Page, product: unknown, { persona = 'admin', route = '/data-products/e2e-product-1', size }: {
  persona?: PersonaId; route?: string; size?: 'minimal' | 'medium' | 'large';
} = {}) {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.clock.setFixedTime(new Date('2026-11-09T12:00:00Z'));
  if (size) await page.addInitScript((s) => localStorage.setItem('data-product-view-mode', s), size);
  await mockApi(page, PERSONAS[persona], { ...DATA_FIXTURES, [PATH]: product });
  await page.goto(route);
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
}

test('full bleed from both lists: no layout padding, one breadcrumb (the shell\'s)', async ({ page }) => {
  for (const route of ['/data-products/e2e-product-1', '/my-products/e2e-product-1']) {
    await open(page, BASE, { route });
    const main = page.locator('main');
    expect(await style(main, ['padding-top', 'padding-left'])).toEqual({ 'padding-top': '0px', 'padding-left': '0px' });
    await expect(main.getByRole('navigation', { name: 'Breadcrumb' })).toHaveCount(1);
  }
});

test('a 200-character name truncates with its title, the purpose wraps, and nothing scrolls sideways', async ({ page }) => {
  await open(page, { ...BASE, name: LONG_NAME, description: { purpose: LONG_PURPOSE } });
  const title = page.getByRole('heading', { level: 1 });
  await expect(title).toHaveAttribute('title', LONG_NAME);
  expect(await style(title, ['text-overflow', 'white-space', 'overflow-x'])).toEqual({
    'text-overflow': 'ellipsis', 'white-space': 'nowrap', 'overflow-x': 'hidden',
  });
  // Truncated: the text is wider than its box
  expect(await title.evaluate((el) => el.scrollWidth > el.clientWidth)).toBe(true);

  const purpose = page.locator('main p').filter({ hasText: 'Orders for reporting across' }).first();
  const lineHeight = parseFloat((await style(purpose, ['line-height']))['line-height']);
  const box = (await purpose.boundingBox())!;
  // Several lines, inside the window
  expect(box.height).toBeGreaterThan(lineHeight * 2);
  expect(box.x + box.width).toBeLessThanOrEqual(1280);
  expect(await purpose.evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(true);

  // At 1280 and at a narrow 900, the header's actions wrap before the page scrolls
  expect(await noPageScroll(page)).toBe(true);
  await page.setViewportSize({ width: 900, height: 800 });
  expect(await noPageScroll(page)).toBe(true);
  const deleteButton = page.getByRole('button', { name: 'Delete', exact: true });
  const d = (await deleteButton.boundingBox())!;
  expect(d.x + d.width).toBeLessThanOrEqual(900);
});

test('long port and team lists scroll inside their panes; the header stays in place', async ({ page }) => {
  await open(page, FULL, { size: 'large' });
  const title = page.getByRole('heading', { level: 1 });
  for (const name of [/^Deliverables \(30\)$/, /^ODPS Team Metadata/]) {
    const pane = page.getByRole('region', { name });
    const list = pane.locator('[class*="_list_"]');
    expect(await style(list, ['overflow-y'])).toEqual({ 'overflow-y': 'auto' });
    expect(await list.evaluate((el) => el.scrollHeight > el.clientHeight)).toBe(true);

    await list.scrollIntoViewIfNeeded();
    const before = (await title.boundingBox())!.y;
    const scrollY = await page.evaluate(() => window.scrollY);
    const lb = (await list.boundingBox())!;
    await page.mouse.move(lb.x + lb.width / 2, lb.y + Math.min(lb.height / 2, 100));
    await page.mouse.wheel(0, 200);
    await expect.poll(() => list.evaluate((el) => el.scrollTop)).toBeGreaterThan(0);
    // The list scrolled, not the page
    expect(await page.evaluate(() => window.scrollY)).toBe(scrollY);
    expect((await title.boundingBox())!.y).toBe(before);
  }
  expect(await noPageScroll(page)).toBe(true);
});

test('with every action showing, a short name keeps its full width and the actions wrap from the end', async ({ page }) => {
  await open(page, { ...BASE, status: 'active' }, { size: 'large' });
  const title = page.getByRole('heading', { level: 1, name: 'Sales orders' });
  expect(await title.evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(true);
  // The last action ends at the header's right edge (14px padding), and nothing scrolls sideways
  const header = title.locator('..');
  const h = (await header.boundingBox())!;
  const d = (await page.getByRole('button', { name: 'Delete', exact: true }).boundingBox())!;
  expect(Math.abs(h.x + h.width - 14 - (d.x + d.width))).toBeLessThanOrEqual(1);
  expect(await noPageScroll(page)).toBe(true);
});

test('empty ports and support show their message and Add for an admin', async ({ page }) => {
  await open(page, BASE, { size: 'large' });
  for (const [name, empty, add] of [
    [/^Deliverables \(0\)$/, 'No deliverables defined. Add deliverables and link assets when ready.', 'Add Deliverable'],
    [/^Consumables \(0\)$/, 'No consumables defined', 'Add Consumable'],
    [/^Support Channels \(0\)$/, 'No support channels defined', 'Add Channel'],
  ] as const) {
    const pane = page.getByRole('region', { name });
    await expect(pane.getByText(empty, { exact: true })).toBeVisible();
    await expect(pane.getByRole('button', { name: add })).toBeEnabled();
  }
});

test('a product that fails to load shows its error and a way back', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await mockApi(page, PERSONAS.admin, DATA_FIXTURES);
  await page.route((url) => url.pathname === PATH, (route) => route.fulfill({ status: 500, json: { detail: 'Backend down' } }));
  await page.goto('/my-products/e2e-product-1');
  // The page's alert (a toast says it too)
  await expect(page.locator('main').getByRole('alert', { name: 'Error' })).toContainText('Backend down');
  await page.getByRole('button', { name: 'Back to List' }).click();
  await expect(page).toHaveURL(/\/my-products$/);
});

test('the consumer sees no edit or certify control, and Delete is disabled', async ({ page }) => {
  await open(page, { ...BASE, status: 'active' }, { persona: 'consumer' });
  const main = page.locator('main');
  await expect(main.getByRole('button', { name: 'Subscribe' })).toBeVisible();
  await expect(main.getByRole('button', { name: 'Edit', exact: true })).toHaveCount(0);
  await expect(main.getByRole('button', { name: 'Certify' })).toHaveCount(0);
  await expect(main.getByRole('button', { name: 'Publish' })).toHaveCount(0);
  await expect(main.getByRole('button', { name: 'Delete', exact: true })).toBeDisabled();
});

test('the maturity badge opens its details on keyboard focus and on hover; blur and Escape close them', async ({ page }) => {
  await open(page, BASE);
  const target = page.getByRole('button', { name: 'Not assessed Maturity' });
  const card = page.getByText('Maturity: Not assessed', { exact: true });
  await expect(target).toBeVisible();
  await expect(card).toHaveCount(0);

  // Keyboard: focus opens, Escape closes, focus stays on the badge
  await target.focus();
  await expect(card).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(card).toBeHidden();
  await expect(target).toBeFocused();

  // Focus again, then move on: blur closes
  await target.blur();
  await target.focus();
  await expect(card).toBeVisible();
  await page.getByRole('button', { name: 'Back to List' }).focus();
  await expect(card).toBeHidden();

  // Mouse: hover opens, leaving closes
  await target.hover();
  await expect(card).toBeVisible();
  await page.mouse.move(5, 700);
  await expect(card).toBeHidden();
});

test('the version and access-grant tooltips open on keyboard focus', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.clock.setFixedTime(new Date('2026-11-09T12:00:00Z'));
  await page.addInitScript(() => localStorage.setItem('data-product-view-mode', 'large'));
  await mockApi(page, PERSONAS.admin, {
    ...DATA_FIXTURES,
    '/api/data-products/e2e-product-1/versions': [
      { id: 'e2e-product-2', version: '2.0.0', status: 'draft' },
      { id: 'e2e-product-1', version: '1.0.0', status: 'draft' },
    ],
    '/api/access-grants/entity/data_product/e2e-product-1': {
      total: 1,
      grants: [{ id: 'g-1', grantee_email: 'sam@example.com', permission_level: 'READ', granted_at: '2026-11-01T09:00:00Z',
        expires_at: '2026-11-12T09:00:00Z', granted_by: 'rita@example.com', status: 'active', days_until_expiry: 3, is_active: true }],
    },
    '/api/access-grants/entity/data_product/e2e-product-1/summary':
      { active_grants_count: 1, pending_requests_count: 0, expiring_soon_count: 1, total_grants_count: 1 },
    '/api/access-grants/entity/data_product/e2e-product-1/requests': { total: 0, requests: [] },
  });
  await page.goto('/data-products/e2e-product-1');
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();

  await page.getByRole('button', { name: 'Newer version' }).focus();
  await expect(page.getByRole('tooltip', { name: 'Newer: v2.0.0' })).toBeVisible();

  const grants = page.getByRole('region', { name: 'Access Grants' });
  // The badges themselves are focus stops
  await grants.locator('[tabindex="0"]', { hasText: '1 expiring' }).focus();
  await expect(page.getByRole('tooltip', { name: '1 grant expiring soon' })).toBeVisible();
  await grants.getByRole('cell').locator('[tabindex="0"]', { hasText: /day/ }).focus();
  await expect(page.getByRole('tooltip', { name: /^Expires: / })).toBeVisible();
});
