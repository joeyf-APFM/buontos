/**
 * Task 8: the shared panels and badges in a real browser (ruling R10: jsdom
 * ignores the cascade). The ownership, metadata and comments panels follow the
 * explorer's details panel: an 86px label column, 12px text, rows divided by
 * border-subtle and no cards inside; the badges use the Aura status palette.
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

test('ownership panel: owners in an 86px label column, 12px rows divided by border-subtle', async ({ page }) => {
  await openAsset(page);
  await capture(page, 'detail-page');
  const panel = page.getByRole('region', { name: 'Owners' });
  await capture(page, 'ownership-panel', panel);

  const grid = panel.locator('dl').first();
  expect((await style(grid, ['grid-template-columns']))['grid-template-columns']).toMatch(/^86px /);
  const term = grid.locator('dt').first();
  expect(await term.textContent()).toBe('Data Owner');
  expect((await term.boundingBox())!.width).toBe(86);
  expect(await style(term, ['font-size', 'border-bottom-color', 'border-bottom-width'])).toEqual({
    'font-size': '12px', 'border-bottom-color': BORDER_SUBTLE, 'border-bottom-width': '1px',
  });
  // The last row has no rule under it
  expect((await style(grid.locator('dd').last(), ['border-bottom-width']))['border-bottom-width']).toBe('0px');
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
  // The avatar is 20px round
  const avatar = comment.locator('.mantine-Avatar-root');
  expect(await avatar.evaluate((el) => [el.getBoundingClientRect().width, el.getBoundingClientRect().height])).toEqual([20, 20]);
});

test('badges: the Aura status colours, with text at least 4.5:1 on the fill', async ({ page }) => {
  await page.setViewportSize({ width: 800, height: 300 });
  await mockApi(page, PERSONAS.admin, DATA_FIXTURES);
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
    Gold: ['rgb(39, 113, 83)', 'rgb(221, 235, 228)'],
    Bronze: ['rgb(44, 47, 52)', 'rgb(255, 246, 233)'],
    Revoked: ['rgb(212, 28, 22)', 'rgb(255, 245, 243)'],
    Managed: ['rgb(30, 124, 161)', 'rgb(255, 255, 255)'],
  };
  for (const [name, [color, bg]] of Object.entries(expected)) {
    const s = await style(badge(name), ['color', 'background-color']);
    expect(s, name).toEqual({ color, 'background-color': bg });
    expect(contrast(s.color, s['background-color']), name).toBeGreaterThanOrEqual(4.5);
  }
  // The warning's amber is on its border and icon
  expect((await style(badge('Bronze'), ['border-top-color']))['border-top-color']).toBe('rgb(182, 127, 20)');
  expect((await style(badge('Bronze').locator('svg'), ['color']))['color']).toBe('rgb(182, 127, 20)');
  // External scope: the accent tone
  const external = await style(badge('External'), ['color', 'background-color']);
  expect(contrast(external.color, external['background-color'])).toBeGreaterThanOrEqual(4.5);
});
