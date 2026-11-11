/**
 * Wave 2 Task 13c: the Hierarchy Browser (/concepts/hierarchy) on the page
 * kit, measured in a real browser (ruling R10). The kit header; the Browse
 * and detail panes side by side; long labels truncating with a title and no
 * horizontal page scroll (Review Focus 1); a deep tree scrolling inside its
 * pane under a head that stays put (Review Focus 3); the graph view's frame
 * around the reactflow canvas; the row's page button on keyboard focus.
 *
 * CAPTURE=before|after also saves images of the page to
 * .superpowers/sdd/2026-11-10-mantine-restyle-wave-2/task-13c-images/.
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test, type Locator, type Page } from '@playwright/test';
import { mockApi } from './fixtures/api';
import { DATA_FIXTURES } from './fixtures/data';
import { PERSONAS, type Persona } from './fixtures/personas';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const IMAGES = path.resolve(HERE, '../../../../.superpowers/sdd/2026-11-10-mantine-restyle-wave-2/task-13c-images');
const CAPTURE = process.env.CAPTURE;

const NAVY = 'rgb(31, 48, 102)';

// Review Focus 1: a 200-character label, and one with no break opportunity
const LONG_LABEL = `Customer ${'lifetime-revenue-and-retention-domain-'.repeat(6)}`.slice(0, 200);
const UNBROKEN = `urn:e2e:${'y'.repeat(192)}`;

const node = (entity_type: string, entity_id: string, name: string, extra: Record<string, unknown> = {}) => ({
  entity_type, entity_id, name, child_count: 0, children: [], ...extra,
});

// Enough roots to overflow the Browse pane
const MANY_PRODUCTS = Array.from({ length: 40 }, (_, i) =>
  node('DataProduct', `p${i}`, `Product ${String(i).padStart(2, '0')}`, { status: 'draft' }));

const ROOTS = [
  {
    entity_type: 'System', label: 'Systems', icon: 'Server',
    roots: [
      node('System', 's1', 'Billing System', { child_count: 60, status: 'active' }),
      node('System', 's2', UNBROKEN, { child_count: 1 }),
    ],
  },
  { entity_type: 'DataDomain', label: 'Data Domains', icon: 'FolderOpen', roots: [node('DataDomain', 'd1', LONG_LABEL, { child_count: 1 })] },
  { entity_type: 'DataProduct', label: 'Data Products', icon: 'Box', roots: MANY_PRODUCTS },
];

// A deep and long hierarchy: 60 tables, the first with a long name and columns
const BILLING = node('System', 's1', 'Billing System', {
  status: 'active',
  description: 'Bills the customers',
  child_count: 60,
  children: Array.from({ length: 60 }, (_, i) =>
    node('Table', `t${i}`, i === 0 ? UNBROKEN : `table_${i}`, {
      child_count: i === 0 ? 2 : 0,
      relationship_label: 'hasTable',
      children: i === 0 ? [node('Column', 'c1', LONG_LABEL), node('Column', 'c2', 'amount')] : [],
    })),
});

const style = (loc: Locator, props: string[]) =>
  loc.evaluate((el, names) => {
    const cs = getComputedStyle(el);
    return Object.fromEntries(names.map((n) => [n, cs.getPropertyValue(n)]));
  }, props);

const noPageScroll = (page: Page) =>
  page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);

const right = async (loc: Locator) => {
  const b = (await loc.boundingBox())!;
  return b.x + b.width;
};

async function setUp(page: Page, persona: Persona = PERSONAS.admin, route = '/concepts/hierarchy') {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.clock.setFixedTime(new Date('2026-11-09T12:00:00Z'));
  await mockApi(page, persona, {
    ...DATA_FIXTURES,
    '/api/entity-hierarchy/roots': ROOTS,
    '/api/entity-hierarchy/System/s1': BILLING,
    '/api/entity-hierarchy/System/s2': node('System', 's2', UNBROKEN, { children: [node('Table', 'tx', 'orders')], child_count: 1 }),
    '/api/entity-hierarchy/DataDomain/d1': node('DataDomain', 'd1', LONG_LABEL, { children: [node('DataProduct', 'dp', LONG_LABEL)], child_count: 1 }),
  });
  await page.goto(route);
  await expect(page.locator('main').getByRole('heading', { level: 1, name: 'Hierarchy Browser' })).toBeVisible();
}

async function capture(page: Page, name: string) {
  if (!CAPTURE) return;
  await page.mouse.move(0, 0);
  await page.waitForTimeout(400);
  await page.screenshot({ path: path.join(IMAGES, `${name}-${CAPTURE}.png`), animations: 'disabled', caret: 'hide' });
}

const browsePane = (page: Page) => page.locator('main').getByRole('region', { name: 'Browse' });
const detailPane = (page: Page) => page.locator('main').getByRole('region', { name: 'Hierarchy detail' });

test.describe('captures', () => {
  test('captures the browser, a tree and the graph', async ({ page }) => {
    test.skip(!CAPTURE, 'only with CAPTURE=before|after');
    await setUp(page);
    await page.waitForTimeout(400);
    await capture(page, 'hierarchy-browse');
    await page.locator('main').getByRole('button', { name: 'Billing System', exact: true }).first().click();
    await page.waitForTimeout(600);
    await capture(page, 'hierarchy-tree');
    await page.locator('main').getByRole('button', { name: 'Graph view' }).click();
    await page.waitForTimeout(800);
    await capture(page, 'hierarchy-graph');
  });
});

test.describe('concepts-hierarchy', () => {
  test('the kit header and the two panes, at the kit sizes', async ({ page }) => {
    await setUp(page);
    const main = page.locator('main');
    const title = main.getByRole('heading', { level: 1, name: 'Hierarchy Browser' });
    expect(await style(title, ['font-size', 'color'])).toEqual({ 'font-size': '16px', color: NAVY });

    const browse = browsePane(page);
    const detail = detailPane(page);
    await expect(browse).toBeVisible();
    await expect(detail).toBeVisible();
    expect(await style(browse, ['border-top-width', 'box-shadow'])).toEqual({ 'border-top-width': '1px', 'box-shadow': 'none' });
    // Side by side, the detail pane sharing the Browse pane's border
    const b = (await browse.boundingBox())!;
    const d = (await detail.boundingBox())!;
    expect(Math.abs(b.y - d.y)).toBeLessThan(1);
    expect(Math.round(b.width)).toBe(320);
    expect((await style(detail, ['border-left-width']))['border-left-width']).toBe('0px');

    // The filter and the tree rows at the kit's control and row sizes
    const filter = browse.getByRole('textbox', { name: 'Filter...' });
    expect(Math.round((await filter.boundingBox())!.height)).toBeLessThanOrEqual(28);
    const row = browse.getByRole('button', { name: 'Billing System', exact: true }).locator('..');
    expect(Math.round((await row.boundingBox())!.height)).toBe(28);
    expect((await style(browse.getByRole('button', { name: 'Billing System', exact: true }), ['font-size']))['font-size']).toBe('12px');
  });

  test('long labels truncate with a title in the tree and the detail head, with no horizontal page scroll', async ({ page }) => {
    await setUp(page);
    const browse = browsePane(page);
    for (const label of [LONG_LABEL, UNBROKEN]) {
      const name = browse.getByRole('button', { name: label, exact: true });
      await expect(name).toHaveAttribute('title', label);
      expect(await style(name, ['text-overflow', 'white-space', 'overflow-x'])).toEqual({
        'text-overflow': 'ellipsis', 'white-space': 'nowrap', 'overflow-x': 'hidden',
      });
      expect(await name.evaluate((el) => el.scrollWidth > el.clientWidth)).toBe(true);
      expect(await right(name)).toBeLessThanOrEqual(await right(browse));
    }
    // Nothing in the tree pushes the pane wider than its 320px
    const tree = browse.getByRole('tree', { name: 'Browse' });
    expect(await tree.evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(true);
    expect(await noPageScroll(page)).toBe(true);

    // The chosen entity: its pane heading truncates with its title; the head keeps its actions
    await browse.getByRole('button', { name: UNBROKEN, exact: true }).click();
    const detail = detailPane(page);
    const heading = detail.getByRole('heading', { level: 2, name: UNBROKEN });
    await expect(heading).toHaveAttribute('title', UNBROKEN);
    expect(await style(heading, ['text-overflow', 'white-space'])).toEqual({ 'text-overflow': 'ellipsis', 'white-space': 'nowrap' });
    const viewDetail = detail.getByRole('button', { name: 'View Detail', exact: true });
    await expect(viewDetail).toBeVisible();
    expect(await right(viewDetail)).toBeLessThanOrEqual(await right(detail));
    expect(await noPageScroll(page)).toBe(true);

    // A long child and grandchild in the detail tree
    await browse.getByRole('button', { name: 'Billing System', exact: true }).click();
    const first = detail.getByRole('button', { name: UNBROKEN, exact: true });
    await expect(first).toHaveAttribute('title', UNBROKEN);
    expect(await right(first)).toBeLessThanOrEqual(await right(detail));
    await detail.getByRole('button', { name: `Expand ${UNBROKEN}` }).click();
    const column = detail.getByRole('button', { name: LONG_LABEL, exact: true });
    await expect(column).toHaveAttribute('title', LONG_LABEL);
    expect(await right(column)).toBeLessThanOrEqual(await right(detail));
    expect(await noPageScroll(page)).toBe(true);
  });

  test('a deep tree scrolls inside its pane, and the heads stay in place', async ({ page }) => {
    await setUp(page);
    const browse = browsePane(page);

    // Browse: the root list scrolls under the chips and the filter
    const tree = browse.getByRole('tree', { name: 'Browse' });
    const filter = browse.getByRole('textbox', { name: 'Filter...' });
    const browseHead = browse.getByRole('heading', { level: 2, name: 'Browse' });
    expect(await tree.evaluate((el) => el.scrollHeight > el.clientHeight)).toBe(true);
    const filterY = (await filter.boundingBox())!.y;
    const headY = (await browseHead.boundingBox())!.y;
    await tree.evaluate((el) => { el.scrollTop = el.scrollHeight; });
    await expect(browse.getByRole('button', { name: 'Product 39', exact: true })).toBeInViewport();
    expect((await filter.boundingBox())!.y).toBe(filterY);
    expect((await browseHead.boundingBox())!.y).toBe(headY);

    // Detail: 60 children scroll inside the pane, under its head
    await browse.getByRole('button', { name: 'Billing System', exact: true }).click();
    const detail = detailPane(page);
    const detailHead = detail.getByRole('heading', { level: 2, name: 'Billing System' });
    await expect(detailHead).toBeVisible();
    const children = detail.getByRole('tree', { name: 'Hierarchy' }).locator('..');
    expect(await children.evaluate((el) => el.scrollHeight > el.clientHeight)).toBe(true);
    const detailHeadY = (await detailHead.boundingBox())!.y;
    const depth = detail.getByRole('textbox', { name: 'Max hierarchy depth' });
    await children.evaluate((el) => { el.scrollTop = el.scrollHeight; });
    await expect(detail.getByRole('button', { name: 'table_59', exact: true })).toBeInViewport();
    expect((await detailHead.boundingBox())!.y).toBe(detailHeadY);
    await expect(depth).toBeInViewport();

    // The page itself doesn't scroll: both panes end inside the window
    expect(await page.evaluate(() => document.scrollingElement!.scrollTop)).toBe(0);
    const view = page.viewportSize()!;
    expect((await detail.boundingBox())!.y + (await detail.boundingBox())!.height).toBeLessThanOrEqual(view.height);
    expect((await browse.boundingBox())!.y + (await browse.boundingBox())!.height).toBeLessThanOrEqual(view.height);
  });

  test('the toolbar sizes, and the graph fills its frame', async ({ page }) => {
    await setUp(page, PERSONAS.admin, '/concepts/hierarchy?type=System&id=s1');
    const detail = detailPane(page);
    const depth = detail.getByRole('textbox', { name: 'Max hierarchy depth' });
    await expect(depth).toHaveValue('4 levels');
    expect(Math.round((await depth.boundingBox())!.height)).toBeLessThanOrEqual(28);
    for (const name of ['Tree view', 'Graph view', 'View Detail']) {
      expect(Math.round((await detail.getByRole('button', { name, exact: true }).boundingBox())!.height)).toBeLessThanOrEqual(28);
    }
    // The depth tooltip opens on keyboard focus
    await depth.focus();
    await expect(page.getByRole('tooltip', { name: 'Max hierarchy depth' })).toBeVisible();

    await detail.getByRole('button', { name: 'Graph view' }).click();
    const frame = page.getByTestId('hierarchy-graph-view');
    await expect(frame).toBeVisible();
    expect(await style(frame, ['border-top-width', 'border-top-left-radius'])).toEqual({
      'border-top-width': '1px', 'border-top-left-radius': '6px',
    });
    const f = (await frame.boundingBox())!;
    const d = (await detail.boundingBox())!;
    expect(f.height).toBeGreaterThan(300);
    expect(f.x + f.width).toBeLessThanOrEqual(d.x + d.width);
    expect(f.y + f.height).toBeLessThanOrEqual(d.y + d.height);
    await expect(frame.locator('.react-flow__node').first()).toBeVisible();
    expect(await noPageScroll(page)).toBe(true);
  });

  test('a row\'s page button shows on keyboard focus, and the keyboard opens and selects', async ({ page }) => {
    await setUp(page, PERSONAS.consumer);
    const browse = browsePane(page);
    const toggle = browse.getByRole('button', { name: 'Collapse Billing System' });
    await toggle.focus();
    await page.keyboard.press('Tab'); // the name
    await page.keyboard.press('Tab'); // its page
    const open = browse.getByRole('button', { name: 'View details' }).first();
    await expect(open).toBeFocused();
    expect((await style(open, ['opacity']))['opacity']).toBe('1');
    await expect(page.getByRole('tooltip', { name: 'View details' })).toBeVisible();

    // Enter on the toggle selects the row
    await toggle.focus();
    await page.keyboard.press('Enter');
    await expect(detailPane(page).getByRole('heading', { level: 2, name: 'Billing System' })).toBeVisible();
    await expect(page).toHaveURL(/\?type=System&id=s1$/);
  });
});
