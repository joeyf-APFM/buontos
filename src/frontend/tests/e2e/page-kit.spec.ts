/**
 * Task 10: the page kit in a real browser (ruling R10: jsdom ignores the
 * cascade). Panes share 1px borders with no shadow and drop their corners when
 * adjacent; the header is one line with the 16px display-font title; the
 * details grid has the shared panels' 86px label column; the kit's Mantine
 * Tabs look like the Task 7 Radix tabs (components/ui/tabs.tsx).
 */
import { expect, test, type Locator } from '@playwright/test';
import { mockApi } from './fixtures/api';
import { DATA_FIXTURES } from './fixtures/data';
import { PERSONAS } from './fixtures/personas';

const BORDER = 'rgb(226, 221, 205)';
const NO_SHADOW = 'none';

const style = (loc: Locator, props: string[]) =>
  loc.evaluate((el, names) => {
    const cs = getComputedStyle(el);
    return Object.fromEntries(names.map((n) => [n, cs.getPropertyValue(n)]));
  }, props);

/** A box-shadow without Tailwind's transparent ring placeholders. */
const shadows = (value: string) =>
  value === 'none'
    ? []
    : value.split(/,(?![^(]*\))/).map((s) => s.trim()).filter((s) => !s.startsWith('rgba(0, 0, 0, 0)'));

/** Two rgb() colours within `tolerance` per channel (hsl tokens round differently). */
const near = (a: string, b: string, tolerance = 2) => {
  const ch = (c: string) => c.match(/\d+/g)!.slice(0, 3).map(Number);
  return ch(a).every((v, i) => Math.abs(v - ch(b)[i]) <= tolerance);
};

test.beforeEach(async ({ page }) => {
  await page.setViewportSize({ width: 1000, height: 1600 });
  await mockApi(page, PERSONAS.admin, DATA_FIXTURES);
  await page.goto('/assets');
  await expect(page.locator('main')).toBeVisible();
  await page.evaluate(async (path) => {
    const harness = await import(/* @vite-ignore */ path);
    harness.mountPageKit();
  }, '/tests/e2e/fixtures/page-kit-harness.tsx');
  await expect(page.getByTestId('padded')).toBeVisible();
});

test('panes: 1px borders, no shadow; neighbours share one border and lose their corners', async ({ page }) => {
  const panes = page.getByTestId('padded').locator('section');
  await expect(panes).toHaveCount(3);
  const props = ['border-top-width', 'border-right-width', 'border-bottom-width', 'border-left-width', 'border-top-left-radius', 'border-top-right-radius', 'box-shadow', 'border-top-color'];
  const [left, middle, right] = await Promise.all([0, 1, 2].map((i) => style(panes.nth(i), props)));
  for (const s of [left, middle, right]) {
    expect(s['box-shadow']).toBe(NO_SHADOW);
    expect(s['border-top-width']).toBe('1px');
    expect(s['border-top-color']).toBe(BORDER);
    expect(s['border-top-left-radius']).toBe('0px');
    expect(s['border-top-right-radius']).toBe('0px');
  }
  expect(left['border-left-width']).toBe('1px');
  expect(middle['border-left-width']).toBe('0px');
  expect(right['border-left-width']).toBe('0px');
  expect(right['border-right-width']).toBe('1px');
  // The shared border is one pixel wide: the neighbours touch
  const boxes = await Promise.all([0, 1, 2].map((i) => panes.nth(i).boundingBox()));
  expect(boxes[1]!.x).toBe(boxes[0]!.x + boxes[0]!.width);
  expect(boxes[2]!.x).toBe(boxes[1]!.x + boxes[1]!.width);

  // A lone pane keeps its 6px corners
  const lone = await style(page.getByTestId('lone').locator('section'), ['border-top-left-radius', 'border-left-width']);
  expect(lone).toEqual({ 'border-top-left-radius': '6px', 'border-left-width': '1px' });
});

test('full bleed: only the borders between panes', async ({ page }) => {
  const panes = page.getByTestId('full-bleed').locator('section');
  const props = ['border-top-width', 'border-left-width', 'border-right-width', 'border-bottom-width'];
  const [left, middle, right] = await Promise.all([0, 1, 2].map((i) => style(panes.nth(i), props)));
  expect(left).toEqual({ 'border-top-width': '0px', 'border-left-width': '0px', 'border-right-width': '0px', 'border-bottom-width': '0px' });
  expect(middle['border-left-width']).toBe('1px');
  expect(right['border-left-width']).toBe('1px');
  expect(middle['border-top-width']).toBe('0px');
});

test('header: one line with the 16px display-font title', async ({ page }) => {
  const layout = page.getByTestId('padded');
  const title = layout.getByRole('heading', { level: 1 });
  const s = await style(title, ['font-size', 'font-weight', 'font-family', 'white-space', 'color']);
  expect(s['font-size']).toBe('16px');
  expect(s['font-weight']).toBe('700');
  expect(s['font-family']).toMatch(/^Optima/);
  expect(s['white-space']).toBe('nowrap');
  expect(s.color).toBe('rgb(31, 48, 102)');
  // Title, badge and action on one line
  const header = title.locator('..');
  const tops = await Promise.all([title, header.getByText('Table'), header.getByRole('button', { name: 'New' })].map(async (l) => {
    const b = (await l.boundingBox())!;
    return b.y + b.height / 2;
  }));
  for (const y of tops) expect(Math.abs(y - tops[0])).toBeLessThanOrEqual(1);
  // The filter bar's rule and hint
  const bar = layout.getByRole('textbox', { name: 'Filter' }).locator('..');
  expect((await style(bar, ['border-bottom-width', 'border-bottom-color']))).toEqual({ 'border-bottom-width': '1px', 'border-bottom-color': BORDER });
  expect((await style(bar.getByText('2 assets'), ['color']))['color']).toBe('rgb(130, 141, 150)');
});

test('details grid: the 86px label column in text-secondary, at the explorer density', async ({ page }) => {
  const grid = page.getByTestId('details');
  const dt = grid.locator('dt').first();
  const dd = grid.locator('dd').first();
  const [t, d] = [(await dt.boundingBox())!, (await dd.boundingBox())!];
  expect(Math.round(d.x - t.x)).toBe(86);
  expect(Math.abs(d.y - t.y)).toBeLessThanOrEqual(0.5);
  expect((await style(dt, ['color']))['color']).toBe('rgb(86, 93, 101)');
  expect((await style(dt, ['font-size']))['font-size']).toBe('12px');
  // The explorer details panel's density (R12): rows about 23px apart, no rules
  const next = (await grid.locator('dt').nth(1).boundingBox())!;
  expect(Math.abs(next.y - t.y - 23)).toBeLessThanOrEqual(1);
  for (const cell of [dt, dd]) expect((await style(cell, ['border-bottom-width']))['border-bottom-width']).toBe('0px');
});

test('tabs: the Task 7 look, and arrow keys switch them', async ({ page }) => {
  const kit = page.getByTestId('kit-tabs');
  const radix = page.getByTestId('radix-tabs');
  const props = ['height', 'font-size', 'font-weight', 'padding-left', 'padding-right', 'color'];
  for (const name of ['Details', 'Lineage']) {
    const a = await style(kit.getByRole('tab', { name }), props);
    const b = await style(radix.getByRole('tab', { name }), props);
    expect({ ...a, color: undefined }, name).toEqual({ ...b, color: undefined });
    expect(near(a.color, b.color), `${name} ${a.color} vs ${b.color}`).toBe(true);
  }
  // The active tab's 2px accent bar, and the list's 1px underline
  const activeKit = shadows((await style(kit.getByRole('tab', { name: 'Details' }), ['box-shadow']))['box-shadow']);
  const activeRadix = shadows((await style(radix.getByRole('tab', { name: 'Details' }), ['box-shadow']))['box-shadow']);
  expect(activeKit).toEqual(activeRadix);
  expect(shadows((await style(kit.getByRole('tab', { name: 'Lineage' }), ['box-shadow']))['box-shadow'])).toEqual([]);
  const listKit = shadows((await style(kit.getByRole('tablist'), ['box-shadow']))['box-shadow']);
  const listRadix = shadows((await style(radix.getByRole('tablist'), ['box-shadow']))['box-shadow']);
  expect(listKit).toHaveLength(1);
  expect(listKit[0].replace(/rgb\([^)]*\)/, '')).toBe(listRadix[0].replace(/rgb\([^)]*\)/, ''));
  expect(near(listKit[0].match(/rgb\([^)]*\)/)![0], listRadix[0].match(/rgb\([^)]*\)/)![0])).toBe(true);
  const sizes = await Promise.all([kit, radix].map(async (l) => (await l.getByRole('tablist').boundingBox())!.height));
  expect(sizes[0]).toBe(sizes[1]);

  // Keyboard: arrows move and activate
  await kit.getByRole('tab', { name: 'Details' }).focus();
  await page.keyboard.press('ArrowRight');
  await expect(kit.getByRole('tab', { name: 'Lineage' })).toBeFocused();
  await expect(kit.getByRole('tab', { name: 'Lineage' })).toHaveAttribute('aria-selected', 'true');
  await expect(kit.getByRole('tabpanel')).toHaveText('B');
});
