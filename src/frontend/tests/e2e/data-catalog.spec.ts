/**
 * Task 12: the Data Catalog (/data-catalog and /data-catalog/*) on the page
 * kit, measured in a real browser (ruling R10: jsdom ignores the cascade).
 * Full bleed (no layout padding), the kit's breadcrumb and one-line header,
 * the Asset Explorer's grid (28px header and rows, monospace names, its
 * hover and selection highlight), panes stacked with shared 1px borders, the
 * kit tabs, and Mantine Selects where the Radix ones were.
 */
import { expect, test, type Locator } from '@playwright/test';
import { mockApi } from './fixtures/api';
import { DATA_FIXTURES } from './fixtures/data';
import { PERSONAS } from './fixtures/personas';
import { SELECT_LIKE, controlInventory } from './restyle-pages';

const BORDER = 'rgb(226, 221, 205)';
const NAVY = 'rgb(31, 48, 102)';
const ACCENT = 'rgb(79, 106, 197)';
const ACCENT_SUBTLE = 'rgb(241, 245, 255)';
const CANVAS = 'rgb(255, 253, 247)';
const TEXT_SECONDARY = 'rgb(86, 93, 101)';

const style = (loc: Locator, props: string[]) =>
  loc.evaluate((el, names) => {
    const cs = getComputedStyle(el);
    return Object.fromEntries(names.map((n) => [n, cs.getPropertyValue(n)]));
  }, props);

const box = async (loc: Locator) => (await loc.boundingBox())!;

const FQN = 'main.sales.orders';
const LINEAGE = {
  root_table: FQN,
  nodes: [
    { id: FQN, name: 'orders', type: 'table', catalog: 'main', schema: 'sales', is_root: true, depth: 0 },
    { id: 'main.sales.raw_orders', name: 'raw_orders', type: 'table', catalog: 'main', schema: 'sales', is_root: false, depth: -1 },
  ],
  edges: [{ source: 'main.sales.raw_orders', target: FQN }],
  upstream_count: 1,
  downstream_count: 0,
  external_count: 0,
};
const IMPACT = {
  source_table: FQN, impacted_tables: [{ id: 'main.sales.daily' }], impacted_views: [], impacted_external: [],
  total_impacted_count: 1, affected_owners: ['owner@example.com'],
};

test.beforeEach(async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.clock.setFixedTime(new Date('2026-11-09T12:00:00Z'));
  await mockApi(page, PERSONAS.admin, {
    ...DATA_FIXTURES,
    [`/api/data-catalog/tables/${FQN}/lineage`]: LINEAGE,
    [`/api/data-catalog/tables/${FQN}/impact`]: IMPACT,
  });
});

test.describe('the list', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/data-catalog');
    await expect(page.locator('main table tbody tr').first()).toContainText('order_id');
  });

  test('full bleed: no layout padding, one breadcrumb, and the page fills the main area', async ({ page }) => {
    const main = page.locator('main');
    expect(await style(main, ['padding-top', 'padding-left'])).toEqual({ 'padding-top': '0px', 'padding-left': '0px' });
    // One breadcrumb, the shell's (Task 16d)
    const crumbs = main.getByRole('navigation', { name: 'Breadcrumb' });
    await expect(crumbs).toHaveCount(1);
    await expect(crumbs.getByRole('listitem')).toHaveText(['Home', '>Discover', '>Data Catalog']);
    expect(await style(crumbs.getByRole('link', { name: 'Discover' }), ['color', 'font-size'])).toEqual({
      color: ACCENT, 'font-size': '12px',
    });
    // The pager sits at the bottom of the window, under the grid
    const pager = main.getByText('Page 1 of 1');
    const p = await box(pager);
    expect(p.y + p.height).toBeGreaterThan(800 - 30);
    // A full-bleed pane: no frame of its own
    const pane = main.getByRole('region', { name: 'Columns' });
    expect(await style(pane, ['border-top-width', 'border-left-width', 'box-shadow'])).toEqual({
      'border-top-width': '0px', 'border-left-width': '0px', 'box-shadow': 'none',
    });
  });

  test('header: the 16px navy title, its count and Refresh on one line; filters in the kit bar', async ({ page }) => {
    const title = page.getByRole('heading', { level: 1, name: 'Data Catalog' });
    expect(await style(title, ['font-size', 'font-weight', 'color', 'white-space'])).toEqual({
      'font-size': '16px', 'font-weight': '700', color: NAVY, 'white-space': 'nowrap',
    });
    const t = await box(title);
    const mid = t.y + t.height / 2;
    const refresh = await box(page.getByRole('button', { name: 'Refresh' }));
    expect(refresh.height).toBe(26);
    expect(Math.abs(refresh.y + refresh.height / 2 - mid)).toBeLessThanOrEqual(2);
    const count = await box(page.getByText('(1 Tables)'));
    expect(Math.abs(count.y + count.height / 2 - mid)).toBeLessThanOrEqual(2);
    expect((await style(page.getByText('Browse all columns across Unity Catalog tables and views'), ['color'])).color).toBe(TEXT_SECONDARY);

    // The Mantine Selects and the search share the filter bar's line, ruled off below
    const search = page.getByPlaceholder('Search columns...');
    const bar = search.locator('xpath=ancestor::div[contains(@class, "_bar_")]');
    expect(await style(bar, ['border-bottom-width', 'border-bottom-color'])).toEqual({
      'border-bottom-width': '1px', 'border-bottom-color': BORDER,
    });
    const selects = bar.locator(SELECT_LIKE);
    await expect(selects).toHaveCount(3);
    const s = await box(search);
    for (let i = 0; i < 3; i++) {
      const b = await box(selects.nth(i));
      expect(b.height).toBe(28);
      expect(Math.abs(b.y - s.y)).toBeLessThanOrEqual(1);
    }
    // Recorded as comboboxes, with the page size: 4, as the Radix ones were
    expect((await controlInventory(page)).filter((c) => c.startsWith('combobox '))).toHaveLength(4);
  });

  test("grid: the explorer's 28px header and rows, monospace names, hover and focus highlight", async ({ page }) => {
    const grid = page.locator('main table');
    const th = grid.locator('thead th').first();
    expect(await style(th, ['height', 'font-size', 'font-weight', 'color', 'position'])).toEqual({
      height: '28px', 'font-size': '11px', 'font-weight': '600', color: TEXT_SECONDARY, position: 'sticky',
    });
    const row = grid.locator('tbody tr').first();
    const cells = row.locator('td');
    expect((await box(cells.first())).height).toBe(28);
    expect((await box(grid.locator('tbody tr').nth(1).locator('td').first())).height).toBe(28);
    // Monospace names: the column, its type and the table
    for (const text of ['order_id', 'BIGINT']) {
      const family = (await style(row.getByText(text, { exact: true }).last(), ['font-family']))['font-family'];
      expect(family).toContain('monospace');
    }
    expect((await style(row.getByText('orders', { exact: true }), ['font-family']))['font-family']).toContain('monospace');
    // The sort mark is on: the active column is fully opaque, the others dimmed
    expect(await grid.getByRole('columnheader', { name: 'Column Name' }).getAttribute('aria-sort')).toBe('ascending');

    // Hover: the explorer's canvas tint
    await row.hover();
    expect((await style(cells.nth(1), ['background-color']))['background-color']).toBe(CANVAS);
    // Keyboard focus: the explorer's selection highlight, with the accent bar
    await page.mouse.move(0, 0);
    await page.getByPlaceholder('Search columns...').focus();
    await page.keyboard.press('Tab');
    await expect(row).toBeFocused();
    expect((await style(cells.nth(1), ['background-color']))['background-color']).toBe(ACCENT_SUBTLE);
    expect((await style(cells.first(), ['box-shadow']))['box-shadow']).toBe(`${ACCENT} 2px 0px 0px 0px inset`);
    await page.keyboard.press('Enter');
    await expect(page).toHaveURL(/\/assets\/e2e-asset-1$/);
  });
});

const LONG = 'A long description that runs well past the width of one grid cell, so it has to wrap onto further lines to stay readable in full.';
const MANY_COLUMNS = {
  ...(DATA_FIXTURES['/api/data-catalog/columns'] as Record<string, unknown>),
  column_count: 60,
  columns: Array.from({ length: 60 }, (_, i) => ({
    ...((DATA_FIXTURES['/api/data-catalog/columns'] as { columns: Record<string, unknown>[] }).columns[0]),
    column_name: `col_${String(i).padStart(2, '0')}`,
    description: i === 0 ? LONG : 'Short',
  })),
};

test.describe('the list, long and many', () => {
  test.beforeEach(async ({ page }) => {
    await mockApi(page, PERSONAS.admin, { ...DATA_FIXTURES, '/api/data-catalog/columns': MANY_COLUMNS });
    await page.goto('/data-catalog');
    await expect(page.locator('main table tbody tr').first()).toContainText('col_00');
  });

  test('a long description wraps and is shown in full; short rows stay 28px', async ({ page }) => {
    const rows = page.locator('main table tbody tr');
    const cell = rows.first().locator('td').nth(1);
    // The list's 100-character cut, as before, all of it visible
    await expect(cell).toHaveText(`${LONG.slice(0, 100)}...`);
    expect(await cell.evaluate((el) => getComputedStyle(el).whiteSpace)).toBe('normal');
    expect(await cell.evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(true);
    expect((await box(cell)).height).toBeGreaterThan(28);
    expect((await box(rows.nth(1).locator('td').first())).height).toBe(28);
  });

  test('full bleed has a single scroller: the grid, under a sticky header', async ({ page }) => {
    const overflow = await page.evaluate(() => {
      const main = document.querySelector('main')!;
      const doc = document.scrollingElement!;
      return {
        doc: doc.scrollHeight - doc.clientHeight,
        main: main.scrollHeight - main.clientHeight,
        // Every element in main that can scroll and has more than it shows
        scrollers: Array.from(main.querySelectorAll('*'))
          .filter((el) => /(auto|scroll)/.test(getComputedStyle(el).overflowY) && el.scrollHeight > el.clientHeight + 1)
          .map((el) => el.className),
      };
    });
    expect(overflow.doc).toBeLessThanOrEqual(0);
    expect(overflow.main).toBeLessThanOrEqual(0);
    expect(overflow.scrollers).toHaveLength(1);
    expect(overflow.scrollers[0]).toContain('tableWrap');
    // The pager stays at the window's bottom
    const p = await box(page.getByText('Page 1 of 2'));
    expect(p.y + p.height).toBeGreaterThan(800 - 30);
  });
});

test.describe('a table', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(`/data-catalog/${FQN}`);
    await expect(page.getByRole('heading', { level: 1, name: 'orders' })).toBeVisible();
  });

  test('full bleed with the kit header: the title, its type and Back to List on one line', async ({ page }) => {
    const main = page.locator('main');
    expect(await style(main, ['padding-top', 'padding-left'])).toEqual({ 'padding-top': '0px', 'padding-left': '0px' });
    await expect(main.getByRole('navigation', { name: 'breadcrumb' })).toHaveCount(1);
    const title = page.getByRole('heading', { level: 1, name: 'orders' });
    expect(await style(title, ['font-size', 'color'])).toEqual({ 'font-size': '16px', color: NAVY });
    const t = await box(title);
    const mid = t.y + t.height / 2;
    const back = await box(page.getByRole('button', { name: 'Back to List' }));
    expect(back.height).toBe(26);
    expect(Math.abs(back.y + back.height / 2 - mid)).toBeLessThanOrEqual(2);
    const badge = await box(title.locator('..').getByText('MANAGED', { exact: true }));
    expect(Math.abs(badge.y + badge.height / 2 - mid)).toBeLessThanOrEqual(2);
    // The full name in monospace, with its copy button beside it
    const fqn = main.locator('code', { hasText: FQN });
    expect((await style(fqn, ['font-family']))['font-family']).toContain('monospace');
  });

  test('overview: panes stacked with shared 1px borders and the explorer-density details grid', async ({ page }) => {
    const names = ['Basic Information', 'Storage & Statistics', 'Description'];
    const panes = names.map((name) => page.getByRole('region', { name, exact: true }));
    const boxes = await Promise.all(panes.map(box));
    for (let i = 0; i < panes.length; i++) {
      const s = await style(panes[i], [
        'border-top-width', 'border-left-width', 'border-bottom-width', 'border-left-color', 'box-shadow',
        'border-top-left-radius', 'border-bottom-left-radius',
      ]);
      expect(s['border-left-width']).toBe('1px');
      expect(s['border-bottom-width']).toBe('1px');
      expect(s['border-left-color']).toBe(BORDER);
      expect(s['box-shadow']).toBe('none');
      expect(s['border-top-width']).toBe(i === 0 ? '1px' : '0px');
      expect(s['border-top-left-radius']).toBe(i === 0 ? '6px' : '0px');
      expect(s['border-bottom-left-radius']).toBe(i === panes.length - 1 ? '6px' : '0px');
      expect(boxes[i].x).toBe(boxes[0].x);
      expect(boxes[i].width).toBe(boxes[0].width);
      if (i > 0) expect(Math.abs(boxes[i].y - (boxes[i - 1].y + boxes[i - 1].height))).toBeLessThanOrEqual(0.5);
    }
    // The kit's 14px page margin
    expect(boxes[0].x - (await box(page.locator('main'))).x).toBe(14);

    const basic = panes[0];
    const label = basic.locator('dt', { hasText: 'Catalog' });
    const value = basic.locator('dd', { hasText: 'main' });
    expect(await style(label, ['color', 'font-size'])).toEqual({ color: TEXT_SECONDARY, 'font-size': '12px' });
    expect(Math.round((await box(value)).x - (await box(label)).x)).toBe(86);
    const schema = await box(basic.locator('dt', { hasText: 'Schema' }));
    expect(Math.abs(schema.y - (await box(label)).y - 23)).toBeLessThanOrEqual(1);
  });

  test('the white page surface fills the window under a short page', async ({ page }) => {
    const main = await box(page.locator('main'));
    // The page, under the shell's breadcrumb
    const surface = page.locator('main > *').last();
    expect((await style(surface, ['background-color']))['background-color']).toBe('rgb(255, 255, 255)');
    const s = await box(surface);
    expect(Math.round(s.y + s.height)).toBeGreaterThanOrEqual(Math.round(main.y + main.height) - 1);
    expect(Math.round(s.y + s.height)).toBeGreaterThanOrEqual(799);
  });

  test('a long column comment wraps and is shown in full', async ({ page }) => {
    await page.route('**/api/data-catalog/tables/main.sales.orders', (route) =>
      route.fulfill({
        json: {
          ...(DATA_FIXTURES[`/api/data-catalog/tables/${FQN}`] as { columns: Record<string, unknown>[] }),
          columns: [{ name: 'order_id', type_text: 'bigint', position: 0, nullable: false, comment: LONG, partition_index: null }],
        },
      }),
    );
    await page.reload();
    await page.getByRole('tab', { name: 'Data Details' }).click();
    const cell = page.getByRole('region', { name: 'Columns', exact: true }).locator('tbody td').nth(4);
    await expect(cell).toHaveText(LONG);
    expect(await cell.evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(true);
    expect((await box(cell)).height).toBeGreaterThan(28);
  });

  test("tabs: the kit's 30px list with 14px icons; columns in the explorer's grid; lineage in panes", async ({ page }) => {
    const list = page.getByRole('tablist');
    expect((await box(list)).height).toBe(30);
    const icon = page.getByRole('tab', { name: 'Overview' }).locator('svg');
    expect((await box(icon)).width).toBe(14);

    await page.getByRole('tab', { name: 'Data Details' }).click();
    const pane = page.getByRole('region', { name: 'Columns', exact: true });
    const grid = pane.locator('table');
    expect((await style(grid.locator('thead th').first(), ['height']))['height']).toBe('28px');
    expect((await box(grid.locator('tbody tr').first().locator('td').first())).height).toBe(28);
    expect((await style(grid.getByText('order_id', { exact: true }), ['font-family']))['font-family']).toContain('monospace');
    // A flush pane: the grid runs to the pane's edges
    expect((await box(grid)).x).toBe((await box(pane)).x + 1);
    await expect(page.getByRole('region', { name: 'Basic Information' })).toHaveCount(0);

    // Its rows open nothing, so they take no hover tint
    const firstRow = grid.locator('tbody tr').first();
    await firstRow.hover();
    expect(await style(firstRow.locator('td').nth(1), ['background-color'])).toEqual({ 'background-color': 'rgba(0, 0, 0, 0)' });

    await page.getByRole('tab', { name: 'Lineage' }).click();
    const lineage = page.getByRole('region', { name: 'Data Lineage', exact: true });
    await expect(lineage.getByText('raw_orders')).toBeVisible();
    const impact = page.getByRole('region', { name: 'Impact Summary', exact: true });
    await expect(impact).toBeVisible();
    const l = await box(lineage);
    expect(Math.abs((await box(impact)).y - (l.y + l.height))).toBeLessThanOrEqual(0.5);
    // The direction is a Mantine Select now, 28px like the other fields
    const direction = lineage.locator('input[aria-label="Lineage direction"]');
    await expect(direction).toHaveAttribute('aria-haspopup', 'listbox');
    expect((await box(direction)).height).toBe(28);
    await direction.click();
    const request = page.waitForRequest((r) => r.url().includes('/lineage?direction=upstream'));
    await page.getByRole('option', { name: 'Upstream Only' }).click();
    await request;
  });
});
