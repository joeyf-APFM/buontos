/**
 * Task 8: the shared panels and badges in a real browser (ruling R10: jsdom
 * ignores the cascade). The ownership, metadata and comments panels follow the
 * explorer's details panel: an 86px label column, 12px text, rows about 23px
 * apart with no rules between them (R12) and no cards inside; the badges use
 * the Aura status palette.
 *
 * Set SHARED_CAPTURE=<dir> to also save pictures of the panels.
 */
import { expect, test, type Locator, type Page } from '@playwright/test';
import { mockApi } from './fixtures/api';
import { DATA_FIXTURES } from './fixtures/data';
import { PERSONAS } from './fixtures/personas';

const BORDER_SUBTLE = 'rgb(243, 239, 228)';
const INFO = 'rgb(30, 124, 161)';
const STAMP = '2026-11-01T00:00:00Z';

const owner = (id: string, name: string, role: string) => ({
  id, object_type: 'asset', object_id: 'e2e-asset-1', user_email: `${id}@example.com`, user_name: name,
  role_id: role, role_name: role, is_active: true, assigned_at: STAMP, created_at: STAMP, updated_at: STAMP,
});

const PANEL_FIXTURES = {
  ...DATA_FIXTURES,
  '/api/business-owners/by-object/asset': [
    owner('o1', 'Alice Doe', 'Data Owner'),
    owner('o2', 'Bob Roe', 'Data Steward'),
  ],
  '/api/entities/asset/rich-texts': [
    { id: 'n1', title: 'Read me', short_description: 'How the table is loaded', content_markdown: '# Loads', level: 10, inheritable: true, created_at: STAMP },
  ],
  '/api/entities/asset/links': [
    { id: 'l1', title: 'Runbook', url: 'https://example.com/runbook', level: 20, is_shared: true, created_at: STAMP },
  ],
  '/api/entities/asset/e2e-asset-1/timeline': {
    timeline: [
      { id: 'c1', type: 'comment', entity_type: 'asset', entity_id: 'e2e-asset-1', title: 'Row counts', content: 'Counts match the source.', username: 'alice', timestamp: STAMP, audience: [] },
      { id: 'h1', type: 'change', entity_type: 'asset', entity_id: 'e2e-asset-1', content: 'Status set to active', username: 'bob', timestamp: STAMP },
    ],
    total_count: 2,
    filter_type: 'all',
  },
  '/api/entities/asset/e2e-asset-1/timeline/count': { total_count: 2 },
  // For the flush panels' harness
  '/api/entities/asset/e2e-asset-1/tags': [
    { tag_id: 't1', tag_name: 'pii', namespace_name: 'governance', fully_qualified_name: 'governance/pii', assigned_value: null },
  ],
  '/api/entities/asset/e2e-asset-1/ratings': { average_rating: 4, total_ratings: 2, distribution: { 4: 2 } },
  '/api/entities/asset/e2e-asset-1/quality-items': [
    { id: 'q1', title: 'Null keys', dimension: 'completeness', source: 'manual', score_percent: 80, measured_at: STAMP },
  ],
  '/api/entities/asset/e2e-asset-1/quality-items/summary': {
    overall_score_percent: 80, items_count: 1, by_dimension: { completeness: 80 }, measured_at: STAMP,
  },
};

const style = (loc: Locator, props: string[]) =>
  loc.evaluate((el, names) => {
    const cs = getComputedStyle(el);
    return Object.fromEntries(names.map((n) => [n, cs.getPropertyValue(n)]));
  }, props);

async function capture(page: Page, name: string, target?: Locator) {
  const dir = process.env.SHARED_CAPTURE;
  if (!dir) return;
  if (target) await target.screenshot({ path: `${dir}/${name}.png` });
  else await page.screenshot({ path: `${dir}/${name}.png`, fullPage: true });
}

async function openAsset(page: Page) {
  await page.setViewportSize({ width: 1280, height: 1600 });
  await mockApi(page, PERSONAS.admin, PANEL_FIXTURES);
  await page.goto('/assets/e2e-asset-1');
  await expect(page.getByText('Alice Doe')).toBeVisible();
  await expect(page.getByText('Read me')).toBeVisible();
  await page.waitForLoadState('networkidle');
}

const luminance = ([r, g, b]: number[]) => {
  const c = [r, g, b].map((v) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
};
const rgb = (css: string) => css.match(/\d+(\.\d+)?/g)!.slice(0, 3).map(Number);
const contrast = (a: string, b: string) => {
  const [lo, hi] = [luminance(rgb(a)), luminance(rgb(b))].sort((x, y) => x - y);
  return (hi + 0.05) / (lo + 0.05);
};

test('ownership panel: owners in an 86px label column, 12px rows 5px apart with no rules (R12)', async ({ page }) => {
  await openAsset(page);
  await capture(page, 'detail-page');
  const panel = page.getByRole('region', { name: 'Owners' });
  await capture(page, 'ownership-panel', panel);

  const grid = panel.locator('dl').first();
  // Task 13d: pairs in two columns; the 86px label column is inside each pair
  expect((await style(grid, ['display', 'flex-wrap']))).toEqual({ display: 'flex', 'flex-wrap': 'wrap' });
  expect((await style(grid.locator(':scope > div').first(), ['grid-template-columns']))['grid-template-columns']).toMatch(/^86px /);
  const term = grid.locator('dt').first();
  expect(await term.textContent()).toBe('Data Owner');
  expect((await term.boundingBox())!.width).toBe(86);
  expect(await style(term, ['font-size', 'border-bottom-width'])).toEqual({ 'font-size': '12px', 'border-bottom-width': '0px' });
  expect((await style(grid.locator('dd').first(), ['border-bottom-width']))['border-bottom-width']).toBe('0px');
  // The explorer details panel's density (R12): a 5px gap between rows and no
  // padding, so a text row is about 23px from the next (page-kit.spec.ts). An
  // owner row is as tall as its 24px remove button.
  const [first, second] = [(await term.boundingBox())!, (await grid.locator('dt').nth(1).boundingBox())!];
  expect(await style(term, ['padding-top', 'padding-bottom'])).toEqual({ 'padding-top': '0px', 'padding-bottom': '0px' });
  expect((await style(grid, ['row-gap']))['row-gap']).toBe('5px');
  const remove = (await grid.locator('dd').first().getByRole('button').boundingBox())!;
  expect(first.height).toBe(remove.height);
  // Two owners share the first row (Task 13d), side by side
  expect(Math.abs(second.y - first.y)).toBeLessThanOrEqual(0.5);
  expect(second.x).toBeGreaterThan(first.x + first.width);
  // A pane: one 1px border, no shadow, no card inside
  expect(await style(panel, ['box-shadow', 'border-top-width'])).toEqual({ 'box-shadow': 'none', 'border-top-width': '1px' });
  await expect(panel.locator('.mantine-Paper-root')).toHaveCount(0);
});

test('metadata panel: sections divided by border-subtle, 12px text, no nested cards', async ({ page }) => {
  await openAsset(page);
  const panel = page.getByRole('region', { name: 'Metadata' });
  await capture(page, 'metadata-panel', panel);
  expect((await style(panel, ['font-size']))['font-size']).toBe('12px');
  await expect(panel.locator('.mantine-Paper-root')).toHaveCount(0);
  await expect(panel.getByRole('separator')).toHaveCount(0);
  const links = panel.getByRole('region', { name: 'Related Links' });
  expect(await style(links, ['border-top-color', 'border-top-width'])).toEqual({
    'border-top-color': BORDER_SUBTLE, 'border-top-width': '1px',
  });
  // The delete buttons are critical red over Mantine's subtle button colour
  const del = panel.getByRole('region', { name: 'Additional Notes' }).getByRole('row').nth(1).getByRole('button').last();
  expect((await style(del, ['color']))['color']).toBe('rgb(212, 28, 22)');
});

test('comments sheet: entries are rows divided by border-subtle, changes ruled in info blue', async ({ page }) => {
  await openAsset(page);
  await page.getByRole('main').getByRole('button', { name: /^Comments/ }).click();
  const sheet = page.getByRole('dialog');
  await expect(sheet.getByText('Counts match the source.')).toBeVisible();
  await page.waitForFunction(() => document.getAnimations().every((a) => a.playState === 'finished'));
  await capture(page, 'comments-sheet', sheet);

  expect(await style(sheet, ['padding-top', 'width'])).toEqual({ 'padding-top': '0px', width: '512px' });
  const thread = sheet.getByRole('list', { name: 'Activity Timeline' });
  const [comment, change] = [thread.getByRole('listitem').nth(0), thread.getByRole('listitem').nth(1)];
  expect(await style(comment, ['border-bottom-color', 'border-top-left-radius', 'font-size'])).toEqual({
    'border-bottom-color': BORDER_SUBTLE, 'border-top-left-radius': '0px', 'font-size': '12px',
  });
  expect((await style(change, ['border-left-color']))['border-left-color']).toBe(INFO);
  // Edit and delete on the comment, 24px each; the scroll viewport is Radix's
  const buttons = comment.getByRole('button');
  await expect(buttons).toHaveCount(2);
  expect((await buttons.first().boundingBox())!.height).toBe(24);
  await expect(sheet.locator('[data-radix-scroll-area-viewport]')).toHaveCount(1);
  // The delete button is critical red over Mantine's subtle button colour
  expect((await style(buttons.last(), ['color']))['color']).toBe('rgb(212, 28, 22)');
  // The avatar is 20px round
  const avatar = comment.locator('.mantine-Avatar-root');
  expect(await avatar.evaluate((el) => [el.getBoundingClientRect().width, el.getBoundingClientRect().height])).toEqual([20, 20]);
});

test('badges: the Aura status colours, with text at least 4.5:1 on the fill', async ({ page }) => {
  await page.setViewportSize({ width: 1000, height: 300 });
  await mockApi(page, PERSONAS.admin, {
    ...DATA_FIXTURES,
    '/api/entities/data_product/e2e-rated/ratings': { average_rating: 4.2, total_ratings: 3 },
  });
  await page.goto('/assets');
  await expect(page.locator('main')).toBeVisible();
  await page.evaluate(async (path) => {
    const harness = await import(/* @vite-ignore */ path);
    harness.mountBadges();
  }, '/tests/e2e/fixtures/badge-harness.tsx');
  const stage = page.getByTestId('stage');
  await expect(stage).toBeVisible();
  await capture(page, 'badges', stage);

  const badge = (name: string) => stage.locator('.mantine-Badge-root', { hasText: name });
  const expected: Record<string, [string, string]> = {
    Bronze: ['rgb(44, 47, 52)', 'rgb(255, 246, 233)'],
    Silver: ['rgb(86, 93, 101)', 'rgb(243, 239, 228)'],
    Gold: ['rgb(122, 84, 0)', 'rgb(255, 236, 194)'],
    Revoked: ['rgb(212, 28, 22)', 'rgb(255, 245, 243)'],
    Managed: ['rgb(30, 124, 161)', 'rgb(255, 255, 255)'],
    Defined: ['rgb(12, 86, 110)', 'rgb(220, 242, 249)'],
  };
  for (const [name, [color, bg]] of Object.entries(expected)) {
    const s = await style(badge(name), ['color', 'background-color']);
    expect(s, name).toEqual({ color, 'background-color': bg });
    expect(contrast(s.color, s['background-color']), name).toBeGreaterThanOrEqual(4.5);
  }
  // The warning's amber is on its border and icon
  expect((await style(badge('Bronze'), ['border-top-color']))['border-top-color']).toBe('rgb(182, 127, 20)');
  expect((await style(badge('Bronze').locator('svg'), ['color']))['color']).toBe('rgb(182, 127, 20)');
  // Each seeded level looks different from its neighbours
  const looks = await Promise.all(['Bronze', 'Silver', 'Gold'].map((n) => style(badge(n), ['background-color', 'border-top-color'])));
  expect(new Set(looks.map((l) => JSON.stringify(l))).size).toBe(3);
  // External scope: the accent tone
  const external = await style(badge('External'), ['color', 'background-color']);
  expect(contrast(external.color, external['background-color'])).toBeGreaterThanOrEqual(4.5);

  // A clickable rating chip tints on hover, and its value stays readable
  const chip = stage.locator('[title*="out of 5 stars"]');
  await expect(chip).toBeVisible();
  const rest = (await style(chip, ['background-color']))['background-color'];
  await chip.hover();
  await expect.poll(async () => (await style(chip, ['background-color']))['background-color']).not.toBe(rest);
  const hovered = (await style(chip, ['background-color']))['background-color'];
  const value = (await style(chip.getByText('4.2'), ['color']))['color'];
  expect(contrast(value, hovered)).toBeGreaterThanOrEqual(4.5);
});

test('entity metadata panel rows are 28px inside a Pane', async ({ page }) => {
  // The panels in flush mode (wave 2 Task 3), each in a kit Pane: the Pane
  // has the frame and padding, the panel none of its own
  await page.setViewportSize({ width: 1000, height: 900 });
  await mockApi(page, PERSONAS.admin, PANEL_FIXTURES);
  await page.goto('/assets');
  await expect(page.locator('main')).toBeVisible();
  await page.evaluate(async (path) => {
    const harness = await import(/* @vite-ignore */ path);
    harness.mountFlushPanels();
  }, '/tests/e2e/fixtures/panels-harness.tsx');
  const stage = page.getByTestId('stage');
  await expect(stage.getByText('Read me')).toBeVisible();
  await expect(stage.getByText('Alice Doe')).toBeVisible();
  await capture(page, 'flush-panels', stage);

  const host = stage.getByRole('region', { name: 'Metadata pane' });
  const panel = host.getByRole('region', { name: 'Metadata' });
  // No frame or padding of the panel's own, inside the Pane's 1px border
  expect(await style(host, ['border-left-width'])).toEqual({ 'border-left-width': '1px' });
  expect(await style(panel, ['border-top-width', 'padding-left', 'background-color', 'font-size'])).toEqual({
    'border-top-width': '0px', 'padding-left': '0px', 'background-color': 'rgba(0, 0, 0, 0)', 'font-size': '12px',
  });
  const [hostBox, panelBox] = [(await host.boundingBox())!, (await panel.boundingBox())!];
  // The Pane's 12px body padding is the only inset
  expect(panelBox.x - hostBox.x).toBe(1 + 12);
  const body = panel.locator(':scope > div').last();
  expect(await style(body, ['padding-left', 'padding-top'])).toEqual({ 'padding-left': '0px', 'padding-top': '0px' });

  // The table rows, with their icon buttons, are 28px; labels and headings 12px
  for (const name of ['Additional Notes', 'Related Links']) {
    const rows = panel.getByRole('region', { name }).getByRole('row');
    await expect(rows).toHaveCount(2);
    // Measured on the cells, as the explorer grid's (data-catalog.spec.ts)
    for (const i of [0, 1]) {
      expect((await rows.nth(i).locator('th, td').first().boundingBox())!.height, `${name} row ${i}`).toBe(28);
    }
    expect((await style(rows.nth(0).getByRole('columnheader').first(), ['font-size']))['font-size']).toBe('12px');
    expect((await style(panel.getByRole('heading', { name }), ['font-size']))['font-size']).toBe('12px');
  }
  expect((await style(panel.getByRole('heading', { name: 'Metadata' }), ['font-size']))['font-size']).toBe('12px');

  // The ownership panel's labels: the DetailsGrid's 86px column, 12px, text-secondary
  const owners = stage.getByRole('region', { name: 'Owners pane' }).getByRole('region', { name: 'Owners' });
  expect(await style(owners, ['border-top-width', 'padding-left'])).toEqual({ 'border-top-width': '0px', 'padding-left': '0px' });
  const term = owners.locator('dl dt').first();
  expect((await term.boundingBox())!.width).toBe(86);
  expect(await style(term, ['font-size', 'color'])).toEqual({ 'font-size': '12px', color: 'rgb(86, 93, 101)' });
});

test('entity info dialog: Subscribe and Close stay in view; the height holds as the notes load', async ({ page }) => {
  // The Marketplace's info dialog (and five other callers): a fixed 80vh, the
  // footer always on screen, and the notes scrolling inside the body
  await page.setViewportSize({ width: 1280, height: 800 });
  await mockApi(page, PERSONAS.admin, {
    ...DATA_FIXTURES,
    '/api/entities/data_product/e2e-product-1/ratings': { average_rating: 4, total_ratings: 2, distribution: { 4: 2 } },
  });
  const notes = Array.from({ length: 3 }, (_, i) => ({
    id: `n${i}`, title: `Note ${i + 1}`, level: i,
    content_markdown: Array.from({ length: 30 }, (_, j) => `Line ${j + 1} of note ${i + 1}.`).join('\n\n'),
  }));
  // The notes answer late, so the dialog is measured loading and loaded
  await page.route((url) => url.pathname === '/api/entities/data_product/rich-texts', async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 600));
    await route.fulfill({ json: notes });
  });
  await page.goto('/assets');
  await expect(page.locator('main')).toBeVisible();
  await page.evaluate(async (path) => (await import(/* @vite-ignore */ path)).mountInfoDialog(), '/tests/e2e/fixtures/panels-harness.tsx');
  const dialog = page.getByRole('dialog', { name: 'Customer 360' });
  await expect(dialog).toBeVisible();
  // Past the Modal's transition (the loading spinner never stops animating)
  await page.waitForTimeout(400);
  await expect(dialog.getByText('Loading...')).toBeVisible();
  const loading = (await dialog.boundingBox())!;
  await expect(dialog.getByText('Line 30 of note 3.')).toBeAttached();
  const loaded = (await dialog.boundingBox())!;
  expect([loading.height, loaded.height]).toEqual([640, 640]);
  expect([Math.round(loaded.width), loaded.y]).toEqual([960, loading.y]);

  for (const name of ['Close', 'Subscribe', 'Go to Details']) {
    // (the footer's Close comes before the corner close)
    await expect(dialog.getByRole('button', { name, exact: true }).first()).toBeInViewport({ ratio: 1 });
  }
  // The body is what scrolls
  const scrolls = await dialog.evaluate((el) =>
    [...el.querySelectorAll('*')].some((d) => getComputedStyle(d).overflowY === 'auto' && d.scrollHeight > d.clientHeight && d.contains(el.querySelector('h1'))),
  );
  expect(scrolls).toBe(true);
  expect(await dialog.evaluate((el) => el.scrollHeight > el.clientHeight)).toBe(false);
});

test('tags, ratings and quality panels sit flush in their Panes: 12px titles, 28px quality rows', async ({ page }) => {
  await page.setViewportSize({ width: 1000, height: 1400 });
  await mockApi(page, PERSONAS.admin, PANEL_FIXTURES);
  await page.goto('/assets');
  await expect(page.locator('main')).toBeVisible();
  await page.evaluate(async (path) => (await import(/* @vite-ignore */ path)).mountFlushPanels(), '/tests/e2e/fixtures/panels-harness.tsx');
  const stage = page.getByTestId('stage');
  await expect(stage.getByText('Null keys')).toBeVisible();

  for (const [pane, name] of [['Tags pane', 'Tags'], ['Ratings pane', 'Ratings'], ['Quality pane', 'Data Quality']]) {
    const host = stage.getByRole('region', { name: pane });
    const panel = host.getByRole('region', { name });
    expect(await style(panel, ['border-top-width', 'padding-left', 'background-color']), name).toEqual({
      'border-top-width': '0px', 'padding-left': '0px', 'background-color': 'rgba(0, 0, 0, 0)',
    });
    expect((await panel.boundingBox())!.x - (await host.boundingBox())!.x, name).toBe(1 + 12);
    expect((await style(panel.getByRole('heading', { name }), ['font-size']))['font-size'], name).toBe('12px');
  }
  const quality = stage.getByRole('region', { name: 'Quality pane' }).getByRole('region', { name: 'Data Quality' });
  const rows = quality.getByRole('row');
  await expect(rows).toHaveCount(2);
  for (const i of [0, 1]) {
    expect((await rows.nth(i).locator('th, td').first().boundingBox())!.height, `quality row ${i}`).toBe(28);
  }
  // The gauge shrinks to 40px in a pane
  const gauge = quality.getByLabel('Quality score', { exact: true });
  expect((await gauge.boundingBox())!.height).toBe(40);
});

test('copy from team: Assign hands focus to the Assign Owner dialog it opens', async ({ page }) => {
  await page.setViewportSize({ width: 1000, height: 900 });
  await mockApi(page, PERSONAS.admin, {
    ...PANEL_FIXTURES,
    '/api/teams/e2e-team-1/members': [{ id: 'm1', member_identifier: 'bea@example.com', member_type: 'user', member_name: 'Bea Poe' }],
    '/api/business-roles': [{ id: 'r1', name: 'Business Owner', status: 'active' }],
  });
  await page.goto('/assets');
  await expect(page.locator('main')).toBeVisible();
  await page.evaluate(async (path) => (await import(/* @vite-ignore */ path)).mountFlushPanels(), '/tests/e2e/fixtures/panels-harness.tsx');
  await page.getByRole('button', { name: 'Copy from Team' }).click();
  const copy = page.getByRole('dialog', { name: /Copy from Team/ });
  await copy.getByRole('button', { name: 'Assign', exact: true }).click();
  const assign = page.getByRole('dialog', { name: 'Assign Owner' });
  await expect(assign).toBeVisible();
  await expect(copy).toHaveCount(0);
  // Past both transitions and Mantine's 10ms focus-return timer: focus is in
  // the Assign dialog, not back on Copy from Team behind it
  await page.waitForTimeout(500);
  expect(await assign.evaluate((el) => el.contains(document.activeElement))).toBe(true);
});

test('copy from team: closing the Assign Owner it opened returns focus to Assign Owner', async ({ page }) => {
  await page.setViewportSize({ width: 1000, height: 900 });
  await mockApi(page, PERSONAS.admin, {
    ...PANEL_FIXTURES,
    '/api/teams/e2e-team-1/members': [{ id: 'm1', member_identifier: 'bea@example.com', member_type: 'user', member_name: 'Bea Poe' }],
    '/api/business-roles': [{ id: 'r1', name: 'Business Owner', status: 'active' }],
  });
  await page.goto('/assets');
  await expect(page.locator('main')).toBeVisible();
  await page.evaluate(async (path) => (await import(/* @vite-ignore */ path)).mountFlushPanels(), '/tests/e2e/fixtures/panels-harness.tsx');
  const owners = page.getByRole('region', { name: 'Owners' });
  await owners.getByRole('button', { name: 'Copy from Team' }).click();
  await page.getByRole('dialog', { name: /Copy from Team/ }).getByRole('button', { name: 'Assign', exact: true }).click();
  const assign = page.getByRole('dialog', { name: 'Assign Owner' });
  await expect(assign).toBeVisible();
  await page.waitForTimeout(500);
  await assign.getByRole('button', { name: 'Cancel' }).click();
  await expect(assign).toHaveCount(0);
  // Past the exit transition and Mantine's focus-return timer: on the header's
  // Assign Owner button, never the body
  await page.waitForTimeout(500);
  await expect(owners.getByRole('button', { name: 'Assign Owner' })).toBeFocused();
});
