/**
 * Task 11: asset detail (/assets/:assetId) on the page kit, measured in a real
 * browser (ruling R10: jsdom ignores the cascade). Full bleed (no layout
 * padding), the kit's breadcrumb and one-line header, panes stacked with
 * shared 1px borders at their own heights, the explorer's details grid, the kit tabs, and
 * the lineage view framed only by its pane.
 */
import { expect, test, type Locator } from '@playwright/test';
import { mockApi } from './fixtures/api';
import { DATA_FIXTURES } from './fixtures/data';
import { PERSONAS } from './fixtures/personas';

const BORDER = 'rgb(226, 221, 205)';
const NAVY = 'rgb(31, 48, 102)';
const ACCENT = 'rgb(79, 106, 197)';
const TEXT_SECONDARY = 'rgb(86, 93, 101)';
const CRITICAL = 'rgb(212, 28, 22)';

const style = (loc: Locator, props: string[]) =>
  loc.evaluate((el, names) => {
    const cs = getComputedStyle(el);
    return Object.fromEntries(names.map((n) => [n, cs.getPropertyValue(n)]));
  }, props);

// One centre node, so the lineage view draws its frame and canvas
const LINEAGE = {
  center_entity_type: 'Table',
  center_entity_id: 'e2e-asset-1',
  nodes: [{ id: 'Table:e2e-asset-1', entity_type: 'Table', entity_id: 'e2e-asset-1', name: 'orders', is_center: true }],
  edges: [],
};

test.beforeEach(async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.clock.setFixedTime(new Date('2026-11-09T12:00:00Z'));
  await mockApi(page, PERSONAS.admin, { ...DATA_FIXTURES, '/api/business-lineage/Table/e2e-asset-1': LINEAGE });
  await page.goto('/assets/e2e-asset-1');
  await expect(page.getByRole('heading', { level: 1, name: 'orders' })).toBeVisible();
});

test('full bleed: no layout padding, the page draws its own breadcrumb', async ({ page }) => {
  const main = page.locator('main');
  expect(await style(main, ['padding-top', 'padding-left'])).toEqual({ 'padding-top': '0px', 'padding-left': '0px' });
  // One breadcrumb: the page's, not the layout's as well
  const crumbs = main.getByRole('navigation', { name: 'breadcrumb' });
  await expect(crumbs).toHaveCount(1);
  const explorer = crumbs.getByRole('link', { name: 'Asset Explorer' });
  expect(await style(explorer, ['color', 'font-size'])).toEqual({ color: ACCENT, 'font-size': '11.5px' });
});

test('header: one line with the 16px navy title, its badges and every action', async ({ page }) => {
  const title = page.getByRole('heading', { level: 1, name: 'orders' });
  expect(await style(title, ['font-size', 'font-weight', 'color', 'white-space'])).toEqual({
    'font-size': '16px', 'font-weight': '700', color: NAVY, 'white-space': 'nowrap',
  });
  const header = title.locator('..');
  // Under a breadcrumb the header keeps its 4px top padding (10px only as the first child)
  expect(await style(header, ['padding-top'])).toEqual({ 'padding-top': '4px' });
  const t = (await title.boundingBox())!;
  for (const name of ['Back', 'Comments', 'View in Hierarchy', 'Manage Lineage', 'Edit', 'Delete']) {
    const b = (await header.getByRole('button', { name }).boundingBox())!;
    // Same line: the button's box spans the title's vertical centre
    expect(b.y).toBeLessThan(t.y + t.height / 2);
    expect(b.y + b.height).toBeGreaterThan(t.y + t.height / 2);
    expect(b.height).toBe(26);
  }
  for (const text of ['active', 'Table', 'databricks']) {
    const b = (await header.getByText(text, { exact: true }).boundingBox())!;
    expect(Math.abs(b.y + b.height / 2 - (t.y + t.height / 2))).toBeLessThanOrEqual(2);
  }
  // Delete reads as destructive over Mantine's default button colour
  expect((await style(header.getByRole('button', { name: 'Delete' }), ['color'])).color).toBe(CRITICAL);
  // The description sits under the header in secondary text
  expect((await style(page.getByText('One row per customer order'), ['color'])).color).toBe(TEXT_SECONDARY);
});

test('panes: stacked panes share 1px borders, square inner corners, no shadow', async ({ page }) => {
  // Two stacks: the Overview tab's panes, then the panes under the tabs
  const groups = [
    ['Details', 'Relationships'],
    ['Owners', 'Metadata', 'Ratings & Reviews', 'Cost Management', 'Data Quality'],
  ];
  const all = groups.flat().map((name) => page.getByRole('region', { name, exact: true }));
  await expect(all[all.length - 1]).toBeVisible();
  const props = [
    'border-top-width', 'border-bottom-width', 'border-left-width', 'border-right-width', 'border-top-color',
    'border-top-left-radius', 'border-top-right-radius', 'border-bottom-left-radius', 'border-bottom-right-radius', 'box-shadow',
  ];
  const boxes = await Promise.all(all.map(async (r) => (await r.boundingBox())!));
  // Same left edge and width, inside the kit's 14px margin
  const main = (await page.locator('main').boundingBox())!;
  for (const b of boxes) {
    expect(b.x).toBe(boxes[0].x);
    expect(b.width).toBe(boxes[0].width);
  }
  expect(boxes[0].x - main.x).toBe(14);

  let at = 0;
  for (const group of groups) {
    const panes = all.slice(at, at + group.length);
    const box = boxes.slice(at, at + group.length);
    const s = await Promise.all(panes.map((p) => style(p, props)));
    group.forEach((_, i) => {
      const first = i === 0;
      const last = i === group.length - 1;
      expect(s[i]['box-shadow']).toBe('none');
      expect(s[i]['border-top-color']).toBe(BORDER);
      expect(s[i]['border-left-width']).toBe('1px');
      expect(s[i]['border-right-width']).toBe('1px');
      expect(s[i]['border-bottom-width']).toBe('1px');
      // One 1px seam: a following pane has no top border of its own
      expect(s[i]['border-top-width']).toBe(first ? '1px' : '0px');
      // Only the stack's outer corners are rounded
      const top = first ? '6px' : '0px';
      const bottom = last ? '6px' : '0px';
      expect([s[i]['border-top-left-radius'], s[i]['border-top-right-radius']]).toEqual([top, top]);
      expect([s[i]['border-bottom-left-radius'], s[i]['border-bottom-right-radius']]).toEqual([bottom, bottom]);
      // Touching: no gap between stacked panes
      if (!first) expect(box[i].y).toBe(box[i - 1].y + box[i - 1].height);
    });
    at += group.length;
  }
  // The persistent panes sit 12px under the tab content
  expect(boxes[2].y - (boxes[1].y + boxes[1].height)).toBe(12);

  // Each pane is as tall as its content: no inner scrolling, and not one share of the column
  for (const r of all) {
    const body = r.locator(':scope > div').last();
    const { scrollHeight, clientHeight } = await body.evaluate((el) => ({ scrollHeight: el.scrollHeight, clientHeight: el.clientHeight }));
    expect(scrollHeight).toBeLessThanOrEqual(clientHeight + 1);
  }
  expect(new Set(boxes.map((b) => Math.round(b.height))).size).toBeGreaterThan(3);
});

test('details: the explorer details grid', async ({ page }) => {
  const details = page.getByRole('region', { name: 'Details', exact: true });
  const terms = details.getByRole('term');
  await expect(terms).toHaveCount(6);
  const dl = details.locator('dl');
  expect((await style(dl, ['grid-template-columns']))['grid-template-columns']).toMatch(/^86px /);
  expect(await style(terms.first(), ['color', 'font-size'])).toEqual({ color: TEXT_SECONDARY, 'font-size': '12px' });
  // Text rows about 23px apart, with no rules between them (R12)
  const a = (await terms.nth(1).boundingBox())!;
  const b = (await terms.nth(2).boundingBox())!;
  expect(Math.abs(b.y - a.y - 23)).toBeLessThanOrEqual(1);
  expect((await style(terms.first(), ['border-bottom-width']))['border-bottom-width']).toBe('0px');
  // The location keeps to one line with an ellipsis, as before (truncate)
  const location = details.getByText('main.sales.orders', { exact: true });
  expect(await style(location, ['white-space', 'text-overflow', 'overflow-x'])).toEqual({
    'white-space': 'nowrap', 'text-overflow': 'ellipsis', 'overflow-x': 'hidden',
  });
  const narrow = await location.evaluate((el) => {
    el.textContent = 'main.sales.' + 'very_long_table_name_'.repeat(20);
    return { scroll: el.scrollWidth, client: el.clientWidth, height: el.getBoundingClientRect().height };
  });
  expect(narrow.scroll).toBeGreaterThan(narrow.client);
  expect(narrow.height).toBeLessThan(20);
  // The pane head is the kit's: 36px, 12.5px navy title
  const head = details.getByRole('heading', { name: 'Details' });
  expect(await style(head, ['font-size', 'color'])).toEqual({ 'font-size': '12.5px', color: NAVY });
});

test('tabs: the kit tab look, and the lineage view framed only by its pane', async ({ page }) => {
  const list = page.getByRole('tablist');
  expect((await list.boundingBox())!.height).toBe(30);
  const overview = page.getByRole('tab', { name: 'Overview' });
  expect((await style(overview, ['box-shadow']))['box-shadow']).toContain('inset');
  // The Lineage tab's icon sits 4px before its label
  const lineageTab = page.getByRole('tab', { name: 'Lineage' });
  const icon = (await lineageTab.locator('svg').boundingBox())!;
  expect(icon.width).toBe(14);

  await lineageTab.click();
  await expect(lineageTab).toHaveAttribute('aria-selected', 'true');
  // Radix-like: the Overview panes are gone, not hidden
  await expect(page.getByRole('region', { name: 'Details', exact: true })).toHaveCount(0);
  const pane = page.getByRole('region', { name: 'Lineage', exact: true });
  await expect(pane.locator('.react-flow')).toBeVisible();
  expect((await style(pane, ['border-top-width']))['border-top-width']).toBe('1px');
  // The view inside draws no second border
  const frame = pane.locator(':scope > div > div').first();
  expect(await style(frame, ['border-top-width', 'border-left-width'])).toEqual({ 'border-top-width': '0px', 'border-left-width': '0px' });
  expect((await frame.boundingBox())!.height).toBe(600);
  // Flush: the view runs to the pane's border
  const p = (await pane.boundingBox())!;
  const f = (await frame.boundingBox())!;
  expect(f.x - p.x).toBe(1);
});

test('relationships graph: its own frame dropped for the pane, a Mantine layout Select', async ({ page }) => {
  await page.getByRole('tab', { name: 'Relationships' }).click();
  const table = page.getByRole('button', { name: 'Table view' });
  await expect(table).toHaveAttribute('aria-pressed', 'true');
  await page.getByRole('button', { name: 'Graph view' }).click();
  await expect(page.getByRole('button', { name: 'Graph view' })).toHaveAttribute('aria-pressed', 'true');

  const pane = page.getByRole('region', { name: 'Relationship graph' });
  const layout = pane.getByRole('textbox', { name: 'Layout' });
  await expect(layout).toBeVisible();
  // Mantine's Select: a text input that pops up a listbox
  await expect(layout).toHaveAttribute('aria-haspopup', 'listbox');
  await expect(layout).toHaveValue('Concentric');
  await layout.click();
  await page.getByRole('option', { name: 'Circular' }).click();
  await expect(layout).toHaveValue('Circular');

  expect((await style(pane, ['border-top-width']))['border-top-width']).toBe('1px');
  const root = pane.locator(':scope > div > div').first();
  expect(await style(root, ['border-top-width', 'border-left-width'])).toEqual({ 'border-top-width': '0px', 'border-left-width': '0px' });
  expect((await root.boundingBox())!.height).toBe(600);
  // The toolbar is ruled off like a pane head, its icon buttons named
  const toolbar = root.locator(':scope > div').first();
  expect(await style(toolbar, ['border-bottom-width', 'border-bottom-color'])).toEqual({ 'border-bottom-width': '1px', 'border-bottom-color': BORDER });
  for (const name of ['Group by type', 'Zoom Out', 'Zoom In', 'Fit to View', 'Reset Layout']) {
    await expect(toolbar.getByRole('button', { name })).toBeVisible();
  }
});
