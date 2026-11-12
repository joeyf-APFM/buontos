/**
 * Task 13: the Schema Importer (/schema-importer, and /concepts/import inside
 * the Concepts layout) on the page kit, measured in a real browser (ruling
 * R10: jsdom ignores the cascade). Its own route is full bleed, with the
 * kit's breadcrumb and header and two panes sharing one border; inside the
 * Concepts layout it keeps that layout's padding and breadcrumb and draws
 * framed panes. The schema browser's rows are the explorer's 24px tree rows.
 * The preview dialog is a Mantine Modal, with the shared asset selector
 * (a kit Dialog since wave 2 Task 11) opening above it.
 *
 * CAPTURE=before|after also saves an image of each wizard step to
 * .superpowers/sdd/2026-11-09-mantine-restyle-waves-0-1/task-13-images/.
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test, type Locator, type Page } from '@playwright/test';
import { mockApi } from './fixtures/api';
import { DATA_FIXTURES } from './fixtures/data';
import { PERSONAS } from './fixtures/personas';
import { SELECT_LIKE } from './restyle-pages';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const IMAGES = path.resolve(HERE, '../../../../.superpowers/sdd/2026-11-09-mantine-restyle-waves-0-1/task-13-images');
const CAPTURE = process.env.CAPTURE;

const BORDER = 'rgb(226, 221, 205)';
const NAVY = 'rgb(31, 48, 102)';
const ACCENT = 'rgb(79, 106, 197)';
const ACCENT_SUBTLE = 'rgb(241, 245, 255)';
const TEXT_SECONDARY = 'rgb(86, 93, 101)';

const style = (loc: Locator, props: string[]) =>
  loc.evaluate((el, names) => {
    const cs = getComputedStyle(el);
    return Object.fromEntries(names.map((n) => [n, cs.getPropertyValue(n)]));
  }, props);

const box = async (loc: Locator) => (await loc.boundingBox())!;

const LONG_NAME = 'a_table_with_a_very_long_name_that_will_not_fit_in_the_preview_row_or_the_tree_row_at_all';

const PREVIEW = [
  { path: 'main', name: 'main', asset_type: 'Catalog', will_create: true, existing_asset_id: null, parent_path: null, is_ancestor: true },
  { path: 'main.sales', name: 'sales', asset_type: 'Schema', will_create: true, existing_asset_id: null, parent_path: 'main', is_ancestor: true },
  { path: 'main.sales.orders', name: 'orders', asset_type: 'Table', will_create: true, existing_asset_id: null, parent_path: 'main.sales', is_ancestor: false },
  { path: `main.sales.${LONG_NAME}`, name: LONG_NAME, asset_type: 'Table', will_create: false, existing_asset_id: 'x', parent_path: 'main.sales', is_ancestor: false },
];
const RESULT = {
  created: 3, skipped: 1, errors: 0, error_messages: [], system_asset_id: null,
  items: PREVIEW.map((p) => ({
    path: p.path, name: p.name, asset_type: p.asset_type, action: p.will_create ? 'created' : 'skipped',
    asset_id: null, error: null, parent_path: p.parent_path,
  })),
};
const RUN = {
  id: 'e2e-run-1', status: 'running', progress_message: null, total_items: 3, processed_items: 1,
  created_count: 1, skipped_count: 0, error_count: 0,
};

// fixtures/api.ts's /api/settings, with the background-import threshold
const SETTINGS_ASYNC = {
  job_cluster_id: null, enabled_jobs: [], available_workflows: [], current_settings: {},
  llm_enabled: false, helix_enabled: false, schema_import_async_threshold: 1,
};

const BASE_BROWSE = DATA_FIXTURES['/api/schema-import/browse/e2e-conn-1'] as (url: URL) => { nodes: unknown[] };

async function setUp(page: Page, extra: Record<string, unknown> = {}) {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.clock.setFixedTime(new Date('2026-11-09T12:00:00Z'));
  await mockApi(page, PERSONAS.admin, {
    ...DATA_FIXTURES,
    '/api/schema-import/browse/e2e-conn-1': (url: URL) => {
      const body = BASE_BROWSE(url);
      if (url.searchParams.get('path') !== 'main.sales') return body;
      return {
        ...body,
        nodes: [...body.nodes, {
          name: LONG_NAME, node_type: 'table', path: `main.sales.${LONG_NAME}`, has_children: false,
          description: null, asset_type: 'Table', connector_type: 'databricks',
        }],
      };
    },
    '/api/schema-import/preview': PREVIEW,
    '/api/schema-import/import': RESULT,
    '/api/schema-import/import-async': { run_id: 'e2e-run-1', status: 'pending' },
    '/api/schema-import/runs/e2e-run-1': RUN,
    ...extra,
  });
}

/** A tree row of the schema browser: the innermost element with the label and a checkbox. */
const treeRow = (page: Page, name: string) =>
  page.locator('main div', { has: page.getByText(name, { exact: true }) }).filter({ has: page.getByRole('checkbox') }).last();

async function selectOrders(page: Page) {
  await page.locator('main').getByText('main', { exact: true }).click();
  await page.locator('main').getByText('sales', { exact: true }).click();
  await expect(page.locator('main').getByText('orders', { exact: true })).toBeVisible();
  await treeRow(page, 'orders').getByRole('checkbox').click();
  await expect(page.getByRole('button', { name: 'Preview (1 selected)' })).toBeEnabled();
}

async function capture(page: Page, name: string) {
  if (!CAPTURE) return;
  await page.mouse.move(0, 0);
  // Let the dialog transitions finish
  await page.waitForTimeout(400);
  await page.screenshot({ path: path.join(IMAGES, `${name}-${CAPTURE}.png`), animations: 'disabled', caret: 'hide' });
}

test.describe('wizard steps', () => {
  test('captures every step', async ({ page }) => {
    test.skip(!CAPTURE, 'only with CAPTURE=before|after');
    // A threshold of 1 offers Run in background for this small preview
    await setUp(page, { '/api/settings': SETTINGS_ASYNC });
    await page.goto('/schema-importer');
    await expect(page.locator('main').getByText('finance', { exact: true })).toBeVisible();
    await capture(page, 'step1-connection');

    await selectOrders(page);
    await capture(page, 'step2-selection');

    await page.getByRole('button', { name: 'Preview (1 selected)' }).click();
    const dialog = page.getByRole('dialog', { name: 'Import Preview' });
    await expect(dialog.getByText('orders', { exact: true })).toBeVisible();
    await capture(page, 'step3-preview');

    // Link an ancestor to an existing asset: the shared selector opens on top
    await dialog.locator('button:has(svg.lucide-link-2)').first().click();
    await expect(page.getByRole('dialog', { name: 'Link to existing asset' })).toBeVisible();
    await capture(page, 'step4-link-existing');
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog', { name: 'Link to existing asset' })).toHaveCount(0);
    await expect(dialog).toBeVisible();

    await dialog.getByRole('button', { name: 'Run in background' }).click();
    await expect(dialog.getByText('Running', { exact: true })).toBeVisible();
    await capture(page, 'step5-background');
    await dialog.getByRole('button', { name: 'Close (keep running)' }).click();
    await expect(dialog).toHaveCount(0);

    await page.getByRole('button', { name: 'Import', exact: true }).click();
    const again = page.getByRole('dialog', { name: 'Import Preview' });
    await again.getByRole('button', { name: /^Import \d+ assets?$/ }).click();
    await expect(page.getByRole('dialog', { name: 'Import Results' })).toBeVisible();
    await capture(page, 'step6-result');

    await page.goto('/concepts/import');
    await expect(page.locator('main').getByText('finance', { exact: true })).toBeVisible();
    await capture(page, 'concepts-import');
  });
});

test.describe('its own route', () => {
  test.beforeEach(async ({ page }) => {
    await setUp(page);
    await page.goto('/schema-importer');
    await expect(page.locator('main').getByText('finance', { exact: true })).toBeVisible();
  });

  test('full bleed: one breadcrumb (the shell\'s), the 16px navy title, and two panes sharing a border', async ({ page }) => {
    const main = page.locator('main');
    expect(await style(main, ['padding-top', 'padding-left'])).toEqual({ 'padding-top': '0px', 'padding-left': '0px' });
    await expect(main.getByRole('navigation', { name: 'Breadcrumb' })).toHaveCount(1);

    const title = main.getByRole('heading', { level: 1, name: 'Schema Importer' });
    expect(await style(title, ['font-size', 'font-weight', 'color'])).toEqual({
      'font-size': '16px', 'font-weight': '700', color: NAVY,
    });
    const intro = main.getByText(/^Browse remote systems and import their structure as /);
    expect(await style(intro, ['color', 'border-bottom-width', 'border-bottom-color'])).toEqual({
      color: TEXT_SECONDARY, 'border-bottom-width': '1px', 'border-bottom-color': BORDER,
    });

    const options = main.getByRole('region', { name: 'Import options' });
    const resources = main.getByRole('region', { name: 'Workspace catalog — Resources' });
    // Full bleed: no frame but the border between the panes
    expect(await style(options, ['border-top-width', 'border-left-width', 'border-right-width'])).toEqual({
      'border-top-width': '0px', 'border-left-width': '0px', 'border-right-width': '0px',
    });
    expect(await style(resources, ['border-left-width', 'border-left-color'])).toEqual({
      'border-left-width': '1px', 'border-left-color': BORDER,
    });
    const o = await box(options);
    const r = await box(resources);
    expect(o.width).toBe(300);
    expect(Math.abs(r.x - (o.x + o.width))).toBeLessThanOrEqual(1);
    // The panes fill the window: the tree scrolls inside its pane
    expect(r.y + r.height).toBeGreaterThan(800 - 2);
    const overflow = await page.evaluate(() => document.scrollingElement!.scrollHeight - document.scrollingElement!.clientHeight);
    expect(overflow).toBeLessThanOrEqual(0);
  });

  test('options: a 28px Mantine connection Select, the depth radios and the actions', async ({ page }) => {
    const options = page.locator('main').getByRole('region', { name: 'Import options' });
    const select = options.locator(SELECT_LIKE);
    await expect(select).toHaveCount(1);
    await expect(select).toHaveValue('Workspace catalog');
    expect((await box(select)).height).toBe(28);
    // The connector type sits in the pane head
    await expect(options.getByText('databricks', { exact: true })).toBeVisible();
    // Section labels and the radio hints in text-secondary (R11)
    expect((await style(options.getByText('Import Depth', { exact: true }), ['color'])).color).toBe(TEXT_SECONDARY);
    expect((await style(options.getByText('Everything nested below selected nodes'), ['color'])).color).toBe(TEXT_SECONDARY);
    await expect(options.getByRole('radio', { name: 'Full recursive Everything nested below selected nodes' })).toBeChecked();
    for (const name of ['Preview (0 selected)', 'Import']) {
      const b = options.getByRole('button', { name, exact: true });
      await expect(b).toBeDisabled();
      expect((await box(b)).height).toBe(28);
    }
  });

  test("the tree: the explorer's 24px rows, its hover, and the search target highlighted", async ({ page }) => {
    const resources = page.locator('main').getByRole('region', { name: 'Workspace catalog — Resources' });
    const search = resources.getByPlaceholder('Search: t:catalog.schema.table');
    expect((await box(search)).height).toBe(28);
    const row = treeRow(page, 'main');
    expect((await box(row)).height).toBe(24);
    expect(await style(row.getByText('main', { exact: true }), ['font-size'])).toEqual({ 'font-size': '12px' });
    await row.hover();
    expect((await style(row, ['background-color']))['background-color']).toBe('rgb(243, 239, 228)');

    // Expand, select: the selected count joins the pane head
    await selectOrders(page);
    await expect(resources.getByText('1 selected', { exact: true })).toBeVisible();

    // A long name stays one line with an ellipsis, and its title shows it in full
    const long = resources.getByText(LONG_NAME, { exact: true });
    expect(await long.getAttribute('title')).toBe(LONG_NAME);
    expect(await style(long, ['text-overflow', 'white-space'])).toEqual({ 'text-overflow': 'ellipsis', 'white-space': 'nowrap' });
    expect((await box(treeRow(page, LONG_NAME))).height).toBe(24);

    // The search target gets the explorer's selection highlight
    await page.mouse.move(0, 0);
    await search.fill('main.sales.ord');
    const target = treeRow(page, 'orders');
    await expect(target).toHaveAttribute('data-selected', /.*/);
    expect(await style(target, ['background-color', 'box-shadow'])).toEqual({
      'background-color': ACCENT_SUBTLE, 'box-shadow': `${ACCENT} 2px 0px 0px 0px inset`,
    });
  });

  test('the preview: a Mantine Modal with dense tree rows; the asset selector opens above it', async ({ page }) => {
    await selectOrders(page);
    await page.getByRole('button', { name: 'Preview (1 selected)' }).click();
    const dialog = page.getByRole('dialog', { name: 'Import Preview' });
    await expect(dialog.getByText('orders', { exact: true })).toBeVisible();
    expect(await dialog.evaluate((el) => el.closest('.mantine-Modal-root') !== null)).toBe(true);
    expect((await style(dialog.getByRole('heading', { name: 'Import Preview' }), ['font-size', 'color'])).color).toBe(NAVY);
    const row = dialog.locator('div', { has: page.getByText('orders', { exact: true }) }).filter({ hasText: 'new' }).last();
    expect((await box(row)).height).toBe(24);
    // A long name: ellipsis and a title
    const long = dialog.getByText(LONG_NAME, { exact: true });
    expect(await long.getAttribute('title')).toBe(LONG_NAME);
    expect(await style(long, ['text-overflow'])).toEqual({ 'text-overflow': 'ellipsis' });
    // Clicking outside leaves it open, as the Radix dialog did
    await page.mouse.click(10, 400);
    await expect(dialog).toBeVisible();

    // The shared asset selector (a kit Dialog since Task 11, R39) opens on top, kit on kit, and takes Escape alone
    await dialog.locator('button:has(svg.lucide-link-2)').first().click();
    const selector = page.getByRole('dialog', { name: 'Link to existing asset' });
    await expect(selector).toBeVisible();
    await expect(selector).toHaveClass(/mantine-Modal-content/);
    // Nothing covers its search field, and typing reaches it (the pointer stays
    // on the Link button, for its tooltip below)
    const search = selector.getByRole('textbox', { name: 'Search assets by name...' });
    const field = await box(search);
    expect(await page.evaluate(([x, y]) => document.elementFromPoint(x, y)?.closest('input')?.placeholder, [field.x + field.width / 2, field.y + field.height / 2])).toBe('Search assets by name...');
    await search.focus();
    await search.pressSequentially('ma');
    await expect(search).toHaveValue('ma');
    const s = await box(selector);
    const onTop = await page.evaluate(([x, y]) => {
      const el = document.elementFromPoint(x, y);
      return !!el?.closest('[role="dialog"]')?.textContent?.includes('Pick an existing asset');
    }, [s.x + s.width / 2, s.y + 20]);
    expect(onTop).toBe(true);
    await page.keyboard.press('Escape');
    await expect(selector).toHaveCount(0);
    await expect(dialog).toBeVisible();
    // The pointer is still on the Link button, so its tooltip is open: an
    // Escape closes that first (the kit Dialog's layered Escape), then the preview
    await expect(page.getByRole('tooltip')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.getByRole('tooltip')).toHaveCount(0);
    await expect(dialog).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(dialog).toHaveCount(0);
  });
});

test.describe('below the lg width (1024px)', () => {
  for (const route of ['/schema-importer', '/concepts/import']) {
    test(`${route}: the panes stack, options above the resources, as the old grid did`, async ({ page }) => {
      await setUp(page);
      await page.setViewportSize({ width: 900, height: 900 });
      await page.goto(route);
      const main = page.locator('main');
      await expect(main.getByText('finance', { exact: true })).toBeVisible();
      const options = await box(main.getByRole('region', { name: 'Import options' }));
      const resourcesPane = main.getByRole('region', { name: 'Workspace catalog — Resources' });
      const resources = await box(resourcesPane);
      // One column: the same width, the resources under the options
      expect(Math.abs(options.x - resources.x)).toBeLessThanOrEqual(1);
      expect(Math.abs(options.width - resources.width)).toBeLessThanOrEqual(1);
      expect(Math.abs(resources.y - (options.y + options.height))).toBeLessThanOrEqual(1);
      // One border between them: full bleed draws only that one, on the
      // resources' top; framed panes share the options' bottom border
      const fullBleed = route === '/schema-importer';
      expect(await style(resourcesPane, ['border-top-width', 'border-left-width'])).toEqual({
        'border-top-width': fullBleed ? '1px' : '0px', 'border-left-width': fullBleed ? '0px' : '1px',
      });
      // The tree still gets room
      expect(resources.height).toBeGreaterThanOrEqual(360);
      await expect(main.getByText('orders', { exact: true })).toHaveCount(0);
    });
  }

  test('a kit page that does not ask to stack keeps its row (the Data Catalog)', async ({ page }) => {
    await setUp(page);
    await page.setViewportSize({ width: 900, height: 900 });
    await page.goto('/data-catalog');
    const pane = page.locator('main').getByRole('region', { name: 'Catalog columns' });
    await expect(pane).toBeVisible();
    const content = pane.locator('xpath=..');
    expect(await content.evaluate((el) => [el.hasAttribute('data-stack-below'), getComputedStyle(el).flexDirection])).toEqual([
      false, 'row',
    ]);
  });
});

test.describe('linking to an existing asset', () => {
  test('after "Use selected", focus stays in the preview: on the row\'s Unlink, and Tab stays inside', async ({ page }) => {
    await setUp(page);
    await page.goto('/schema-importer');
    await expect(page.locator('main').getByText('finance', { exact: true })).toBeVisible();
    await selectOrders(page);
    await page.getByRole('button', { name: 'Preview (1 selected)' }).click();
    const dialog = page.getByRole('dialog', { name: 'Import Preview' });
    await expect(dialog.getByText('orders', { exact: true })).toBeVisible();

    // Open the selector from the keyboard, as a keyboard user would
    await dialog.locator('button:has(svg.lucide-link-2)').first().focus();
    await page.keyboard.press('Enter');
    const selector = page.getByRole('dialog', { name: 'Link to existing asset' });
    await selector.getByPlaceholder('Search assets by name...').fill('ma');
    await selector.getByRole('button', { name: /main\.sales\.orders/ }).first().click();
    await selector.getByRole('button', { name: 'Use selected' }).click();
    await expect(selector).toHaveCount(0);
    await expect(dialog.getByText('linked', { exact: true })).toBeVisible();

    const inModal = () => page.evaluate(() => !!document.activeElement?.closest('.mantine-Modal-content'));
    await expect.poll(inModal).toBe(true);
    // Focus is on the row's Unlink button, which replaced Link
    expect(await page.evaluate(() => !!document.activeElement?.querySelector('svg.lucide-unlink'))).toBe(true);
    await page.keyboard.press('Tab');
    expect(await inModal()).toBe(true);
    await page.keyboard.press('Shift+Tab');
    await page.keyboard.press('Shift+Tab');
    expect(await inModal()).toBe(true);
  });
});

test.describe('inside the Concepts layout', () => {
  test('keeps the layout padding, under the shell breadcrumb, with framed panes', async ({ page }) => {
    await setUp(page);
    await page.goto('/concepts/import');
    const main = page.locator('main');
    await expect(main.getByText('finance', { exact: true })).toBeVisible();
    // The layout keeps its padding; the one breadcrumb is the shell's.
    // (The Concepts layout's section tabs went in Task 16c.)
    const content = main.locator('[data-page-content]');
    const padding = parseFloat((await style(content, ['padding-left']))['padding-left']);
    expect(padding).toBeGreaterThan(0);
    await expect(main.getByRole('navigation', { name: 'Breadcrumb' })).toHaveCount(1);
    const title = main.getByRole('heading', { level: 1, name: 'Schema Importer' });
    expect((await style(title, ['font-size', 'color']))).toEqual({ 'font-size': '16px', color: NAVY });
    // The title lines up with the layout's padding: no padding of its own at the sides
    const left = (await box(content)).x + padding;
    expect(Math.abs((await box(title)).x - left)).toBeLessThanOrEqual(1);

    const options = main.getByRole('region', { name: 'Import options' });
    const resources = main.getByRole('region', { name: 'Workspace catalog — Resources' });
    // A frame of their own (the kit drops the corners of panes side by side)
    expect(await style(options, ['border-top-width', 'border-left-width', 'border-top-color'])).toEqual({
      'border-top-width': '1px', 'border-left-width': '1px', 'border-top-color': BORDER,
    });
    // The row's fixed height: the tree scrolls inside its pane
    expect((await box(options)).height).toBe(600);
    // Side by side, one shared border
    expect((await style(resources, ['border-left-width']))['border-left-width']).toBe('0px');
    const o = await box(options);
    expect(Math.abs((await box(resources)).x - (o.x + o.width))).toBeLessThanOrEqual(1);
    expect(Math.abs(o.x - left)).toBeLessThanOrEqual(1);
  });
});
