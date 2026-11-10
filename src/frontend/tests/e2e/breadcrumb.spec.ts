/**
 * Task 16d: the shell's breadcrumb in a real browser. Its trail follows the
 * user: an in-page link extends it, back brings each entry's trail back, a
 * crumb cuts it, and the side menu starts it over. Also its look (12px, the
 * accent for links, one line), which the cascade decides (R10).
 *
 * CAPTURE=1 also saves images to
 * .superpowers/sdd/2026-11-09-mantine-restyle-waves-0-1/task-16d-images/.
 *
 * Run: npx playwright test -c tests/e2e/playwright.config.ts breadcrumb
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test, type Page } from '@playwright/test';
import { mockApi } from './fixtures/api';
import { DATA_FIXTURES } from './fixtures/data';
import { PERSONAS } from './fixtures/personas';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const IMAGES = path.resolve(HERE, '../../../../.superpowers/sdd/2026-11-09-mantine-restyle-waves-0-1/task-16d-images');
const CAPTURE = !!process.env.CAPTURE;

const CREATED = '2026-10-01T09:00:00Z';

// A contract in a domain, and that domain, for the owner's example
const CONTRACT = {
  id: 'e2e-contract-1', name: 'Orders', version: '1.0.0', status: 'draft', apiVersion: 'v3.0.2', kind: 'DataContract',
  domainId: 'e2e-domain-1', domain: 'Finance', owner_team_id: null, schema: [], tags: [], customProperties: [],
  created: CREATED, updated: CREATED,
};
const DOMAIN = {
  id: 'e2e-domain-1', name: 'Finance', description: 'Money in and out', parent_id: null, parent_name: null,
  children_count: 0, children_info: [], tags: [], owner: [], created_at: CREATED, updated_at: CREATED,
};
const FIXTURES = {
  ...DATA_FIXTURES,
  '/api/data-contracts/e2e-contract-1': CONTRACT,
  '/api/data-contracts/e2e-contract-1/maturity': {
    entity_type: 'DataContract', entity_id: 'e2e-contract-1', entity_name: 'Orders', achieved_level_order: null,
    achieved_level_name: null, total_levels: 0, gates_passed: 0, gates_total: 0, levels: [], evaluated_at: CREATED,
    evaluated_by: null,
  },
  '/api/data-domains': [DOMAIN],
  '/api/data-domains/e2e-domain-1': DOMAIN,
};

const crumbs = (page: Page) => page.getByRole('navigation', { name: 'Breadcrumb' });
/** The trail as the user reads it, "Home > Build > …". */
const trail = (page: Page) =>
  crumbs(page)
    .getByRole('listitem')
    .evaluateAll((items) => items.map((li) => li.textContent!.replace(/^>/, '').trim()).join(' > '));

async function capture(page: Page, name: string) {
  if (!CAPTURE) return;
  const box = (await page.locator('main').boundingBox())!;
  await page.screenshot({ path: path.join(IMAGES, `${name}.png`), clip: { x: box.x, y: box.y, width: Math.min(box.width, 1100), height: 90 } });
}

test.beforeEach(async ({ page }) => {
  await mockApi(page, PERSONAS.admin, FIXTURES);
});

test('the trail follows the owner’s path from a contract to its domain, back, a crumb and the menu', async ({ page }) => {
  await page.goto('/data-contracts/e2e-contract-1');
  await expect.poll(() => trail(page)).toBe('Home > Build > Data Contracts > Orders');
  await expect(crumbs(page)).toHaveCount(1);
  await capture(page, 'detail-page');

  // The contract's domain, through the link in the page
  await page.locator('main').getByText('Finance', { exact: true }).first().click();
  await expect(page).toHaveURL(/\/settings\/data-domains\/e2e-domain-1$/);
  await expect.poll(() => trail(page)).toBe('Home > Build > Data Contracts > Orders > Data domains > Finance');
  await capture(page, 'owner-contract-to-domain');

  // Back: the contract's own trail
  await page.goBack();
  await expect.poll(() => trail(page)).toBe('Home > Build > Data Contracts > Orders');

  // Forward, then a crumb: the trail is cut after it
  await page.goForward();
  await expect.poll(() => trail(page)).toBe('Home > Build > Data Contracts > Orders > Data domains > Finance');
  await crumbs(page).getByRole('link', { name: 'Data domains' }).click();
  await expect(page).toHaveURL(/\/settings\/data-domains$/);
  await expect.poll(() => trail(page)).toBe('Home > Build > Data Contracts > Orders > Data domains');

  // The side menu starts over
  await page.getByRole('navigation', { name: 'Main menu' }).getByRole('button', { name: 'Discover' }).click();
  await expect(page).toHaveURL(/\/marketplace$/);
  await expect.poll(() => trail(page)).toBe('Home > Discover > Marketplace');

  // A reload keeps the entry's trail
  await page.goBack();
  await expect.poll(() => trail(page)).toBe('Home > Build > Data Contracts > Orders > Data domains');
  await page.reload();
  await expect.poll(() => trail(page)).toBe('Home > Build > Data Contracts > Orders > Data domains');
});

test('a hierarchy breadcrumb: 12px, links in the accent, the current page in the secondary text colour', async ({ page }) => {
  await page.goto('/settings/certification-levels');
  await expect.poll(() => trail(page)).toBe('Home > Semantics > Levels > Certification');
  const home = crumbs(page).getByRole('link', { name: 'Home' });
  const current = crumbs(page).locator('[aria-current="page"]');
  const levels = crumbs(page).getByText('Levels', { exact: true });
  const css = (loc: typeof home) => loc.evaluate((el) => ({ size: getComputedStyle(el).fontSize, color: getComputedStyle(el).color }));
  expect(await css(home)).toEqual({ size: '12px', color: 'rgb(79, 106, 197)' });
  expect(await css(current)).toEqual({ size: '12px', color: 'rgb(86, 93, 101)' });
  // Levels has no page: plain text
  expect(await levels.evaluate((el) => el.tagName)).toBe('SPAN');
  // In <main>, above the page
  expect(await crumbs(page).evaluate((el) => !!el.closest('main'))).toBe(true);
  // A keyboard focus ring (2px outside the link) isn't clipped by the one-line nav
  await home.focus();
  const room = await home.evaluate((link) => {
    const nav = link.closest('nav')!.getBoundingClientRect();
    const box = link.getBoundingClientRect();
    return Math.min(box.top - nav.top, nav.bottom - box.bottom, box.left - nav.left);
  });
  expect(room).toBeGreaterThanOrEqual(2);
  await capture(page, 'hierarchy');
});

test('a long trail collapses its middle into "…" and stays on one line (the explorer’s tree path)', async ({ page }) => {
  await page.goto('/assets');
  const tree = page.getByRole('tree', { name: 'Data Assets' });
  // Unity Catalog opens selected; the tree shows each node's own name and count
  await expect.poll(() => trail(page)).toBe('Home > Build > Assets > Explorer > Unity Catalog');
  for (const name of ['main 3', 'sales 2', 'orders 0']) {
    await tree.getByRole('treeitem', { name, exact: true }).locator('[title]').first().click();
  }
  // Home > Build > Assets > Explorer > Unity Catalog > main > main.sales > main.sales.orders: eight crumbs
  await expect.poll(() => trail(page)).toBe('Home > … > Unity Catalog > main > main.sales > main.sales.orders');
  const height = await crumbs(page).evaluate((el) => el.getBoundingClientRect().height);
  expect(height).toBeLessThanOrEqual(20);
  await crumbs(page).getByRole('button', { name: 'Show the hidden levels' }).click();
  const hidden = page.getByRole('menu').getByRole('menuitem');
  await expect(hidden).toHaveText(['Build', 'Assets', 'Explorer']);
  await capture(page, 'collapsed-long-trail');
  // An ancestor's crumb selects it
  await page.keyboard.press('Escape');
  await crumbs(page).getByRole('button', { name: 'main', exact: true }).click();
  await expect.poll(() => trail(page)).toBe('Home > Build > Assets > Explorer > Unity Catalog > main');
});
