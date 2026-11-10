/**
 * The Radix compound primitives at Aura density, measured in a real browser
 * with the app's CSS (ruling R10: jsdom ignores the cascade).
 *
 * Set COMPOUND_CAPTURE=<dir> to also save a picture of each open primitive.
 */
import { expect, test, type Page } from '@playwright/test';
import { mockApi } from './fixtures/api';
import { DATA_FIXTURES } from './fixtures/data';
import { PERSONAS } from './fixtures/personas';
import type { Scene } from './fixtures/compound-harness';

const HARNESS = '/tests/e2e/fixtures/compound-harness.tsx';
const NAVY = 'rgb(31, 48, 102)';
const ACCENT = 'rgb(79, 106, 197)';

async function mount(page: Page, scene: Scene) {
  await page.setViewportSize({ width: 800, height: 500 });
  await mockApi(page, PERSONAS.admin, DATA_FIXTURES);
  await page.goto('/assets');
  await expect(page.locator('main')).toBeVisible();
  await page.evaluate(async ([path, name]) => {
    const harness = await import(/* @vite-ignore */ path);
    harness.mountScene(name);
  }, [HARNESS, scene] as const);
  await expect(page.getByTestId('stage')).toBeVisible();
  // Measure after the open animations (zoom-in-95) have finished
  await page.waitForFunction(() => document.getAnimations().every((a) => a.playState === 'finished'));
  await capture(page, scene);
}

const box = async (page: Page, selector: string) => (await page.locator(`${selector} >> visible=true`).first().boundingBox())!;
const style = (page: Page, selector: string, props: string[]) =>
  page.locator(`${selector} >> visible=true`).first().evaluate((el, names) => {
    const cs = getComputedStyle(el);
    return Object.fromEntries(names.map((n) => [n, cs.getPropertyValue(n)]));
  }, props);

// Mantine's md shadow, which its own floating parts (Menu, Popover) use, as computed
const floatingShadow = (page: Page) =>
  page.evaluate(() => {
    const probe = document.createElement('div');
    probe.style.boxShadow = 'var(--mantine-shadow-md)';
    document.body.append(probe);
    const value = getComputedStyle(probe).boxShadow;
    probe.remove();
    return value;
  });

async function capture(page: Page, name: string) {
  const dir = process.env.COMPOUND_CAPTURE;
  if (!dir) return;
  await page.screenshot({ path: `${dir}/${name}.png`, clip: { x: 0, y: 0, width: 800, height: 500 } });
}

test('select: 28px trigger with 12px text and 4px corners; 26px items', async ({ page }) => {
  await mount(page, 'select');
  const trigger = '[role="combobox"]';
  expect((await box(page, trigger)).height).toBe(28);
  expect(await style(page, trigger, ['font-size', 'border-top-left-radius'])).toEqual({
    'font-size': '12px',
    'border-top-left-radius': '4px',
  });
  await expect(page.getByRole('option')).toHaveCount(3);
  expect((await box(page, '[role="option"]')).height).toBe(26);
  expect((await style(page, '[role="listbox"]', ['box-shadow']))['box-shadow']).toContain(await floatingShadow(page));
});

test('dropdown: 26px items and the floating shadow', async ({ page }) => {
  await mount(page, 'dropdown');
  await expect(page.getByRole('menuitem')).toHaveCount(3);
  expect((await box(page, '[role="menuitem"]')).height).toBe(26);
  expect(await style(page, '[role="menuitem"]', ['font-size'])).toEqual({ 'font-size': '12px' });
  expect((await style(page, '[role="menu"]', ['box-shadow']))['box-shadow']).toContain(await floatingShadow(page));
});

test('tabs: 30px list, underline and a 2px accent indicator', async ({ page }) => {
  await mount(page, 'tabs');
  expect((await box(page, '[role="tablist"]')).height).toBe(30);
  const list = await style(page, '[role="tablist"]', ['background-color', 'box-shadow']);
  expect(list['background-color']).toBe('rgba(0, 0, 0, 0)');
  expect(list['box-shadow']).toContain('0px -1px 0px 0px inset');
  const active = await style(page, '[role="tab"][data-state="active"]', ['box-shadow', 'font-size']);
  expect(active['box-shadow']).toContain(`${ACCENT} 0px -2px 0px 0px inset`);
  expect(active['font-size']).toBe('12px');
  const inactive = await style(page, '[role="tab"][data-state="inactive"]', ['box-shadow']);
  expect(inactive['box-shadow']).not.toContain('-2px');
});

test('dialog: 8px corners, floating shadow, 16px padding, 14px semibold navy title', async ({ page }) => {
  await mount(page, 'dialog');
  const dialog = await style(page, '[role="dialog"]', ['border-top-left-radius', 'box-shadow', 'padding-top', 'padding-left']);
  expect(dialog['border-top-left-radius']).toBe('8px');
  expect(dialog['box-shadow']).toContain(await floatingShadow(page));
  expect(dialog['padding-top']).toBe('16px');
  expect(dialog['padding-left']).toBe('16px');
  expect(await style(page, '[role="dialog"] h2', ['font-size', 'font-weight', 'color'])).toEqual({
    'font-size': '14px',
    'font-weight': '600',
    color: NAVY,
  });
});

test('tooltip: navy with 11px white text', async ({ page }) => {
  await mount(page, 'tooltip');
  const tip = '[data-radix-popper-content-wrapper] > [data-state]';
  await expect(page.locator(tip)).toBeVisible();
  expect(await style(page, tip, ['background-color', 'color', 'font-size'])).toEqual({
    'background-color': NAVY,
    color: 'rgb(255, 255, 255)',
    'font-size': '11px',
  });
});

test('tooltip: muted text inside it stays readable (4.5:1 or more on the tooltip)', async ({ page }) => {
  await mount(page, 'tooltip');
  const muted = page.locator('[data-radix-popper-content-wrapper] [data-testid="muted"] >> visible=true').first();
  await expect(muted).toBeVisible();
  const ratio = await muted.evaluate((el) => {
    // WCAG 2 contrast ratio from the computed rgb() colours
    const rgb = (value: string) => value.match(/[\d.]+/g)!.slice(0, 3).map(Number);
    const luminance = (value: string) => {
      const [r, g, b] = rgb(value).map((v) => {
        const c = v / 255;
        return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
      });
      return 0.2126 * r + 0.7152 * g + 0.0722 * b;
    };
    const tip = el.closest('[data-state]')!;
    const fg = luminance(getComputedStyle(el).color);
    const bg = luminance(getComputedStyle(tip).backgroundColor);
    return (Math.max(fg, bg) + 0.05) / (Math.min(fg, bg) + 0.05);
  });
  expect(ratio).toBeGreaterThanOrEqual(4.5);
});

test('popover: 8px corners, floating shadow and a 1px border', async ({ page }) => {
  await mount(page, 'popover');
  const pop = await style(page, '[role="dialog"]', ['border-top-left-radius', 'box-shadow', 'border-top-width']);
  expect(pop['border-top-left-radius']).toBe('8px');
  expect(pop['box-shadow']).toContain(await floatingShadow(page));
  expect(pop['border-top-width']).toBe('1px');
});
