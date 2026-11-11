/**
 * Task 10: the page kit in a real browser (ruling R10: jsdom ignores the
 * cascade). Panes share 1px borders with no shadow and drop their corners when
 * adjacent; the header is one line with the 16px display-font title; the
 * details grid has the shared panels' 86px label column; the kit's Mantine
 * Tabs look like the Task 7 Radix tabs (components/ui/tabs.tsx).
 */
import { expect, test, type Locator, type Page } from '@playwright/test';
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

  // As the page's first child (the shell draws the breadcrumb above the
  // page, Task 16d) the header's top padding is 10px
  expect((await style(header, ['padding-top']))['padding-top']).toBe('10px');
  const lone = page.getByTestId('lone').getByRole('heading', { level: 1 }).locator('..');
  expect(await lone.evaluate((el) => el.previousElementSibling)).toBeNull();
  expect((await style(lone, ['padding-top', 'padding-bottom']))).toEqual({ 'padding-top': '10px', 'padding-bottom': '8px' });
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

test.describe('kit Dialog', () => {
  const harness = '/tests/e2e/fixtures/page-kit-harness.tsx';
  const closes = (page: Page) =>
    page.evaluate(async (path) => (await import(/* @vite-ignore */ path)).dialogEvents.closes, harness);
  const zIndex = (loc: Locator) => loc.evaluate((el) => Number(getComputedStyle(el).zIndex));

  test.beforeEach(async ({ page }) => {
    await page.evaluate(async (path) => (await import(/* @vite-ignore */ path)).mountDialog(), harness);
    await expect(page.getByRole('dialog', { name: 'Rename data product' })).toBeVisible();
  });

  test('Dialog: the kit look, at the md width', async ({ page }) => {
    const dialog = page.getByRole('dialog', { name: 'Rename data product' });
    expect(Math.round((await dialog.boundingBox())!.width)).toBe(560);
    expect(await style(dialog, ['border-top-width', 'border-top-color', 'border-top-left-radius'])).toEqual({
      'border-top-width': '1px', 'border-top-color': BORDER, 'border-top-left-radius': '8px',
    });
    expect(await style(dialog.getByRole('heading', { name: 'Rename data product' }), ['font-size', 'color'])).toEqual({
      'font-size': '14px', color: 'rgb(31, 48, 102)',
    });
    const footer = dialog.getByRole('button', { name: 'Save' }).locator('..');
    expect(await style(footer, ['border-top-width', 'justify-content'])).toEqual({
      'border-top-width': '1px', 'justify-content': 'flex-end',
    });
    // Focus starts in the content, not on the corner close
    await expect(dialog.getByRole('textbox', { name: 'Name' })).toBeFocused();
    // The look is the content's alone: the full-window layer that centres it
    // stays fixed and unframed, and the dialog is on screen, on top
    expect(await style(page.locator('.mantine-Modal-inner'), ['position', 'border-top-width', 'border-top-left-radius'])).toEqual({
      position: 'fixed', 'border-top-width': '0px', 'border-top-left-radius': '0px',
    });
    const b = (await dialog.boundingBox())!;
    expect(b.y + b.height).toBeLessThanOrEqual(page.viewportSize()!.height);
    expect(await page.evaluate(([x, y]) => !!document.elementFromPoint(x, y)?.closest('[role="dialog"]'), [b.x + b.width / 2, b.y + 20])).toBe(true);
    // The corner close, last in the content, shows at the top right, on top
    const close = (await dialog.getByRole('button', { name: 'Close' }).boundingBox())!;
    expect(close.x + close.width).toBeGreaterThan(b.x + b.width - 24);
    expect(close.y).toBeLessThan(b.y + 24);
    expect(await page.evaluate(([x, y]) => document.elementFromPoint(x, y)?.closest('button')?.getAttribute('aria-label'), [close.x + close.width / 2, close.y + close.height / 2])).toBe('Close');
  });

  test('Dialog: Escape in an open Select closes only the Select', async ({ page }) => {
    const dialog = page.getByRole('dialog', { name: 'Rename data product' });
    const name = dialog.getByRole('textbox', { name: 'Name' });
    await name.fill('Customer 361');
    const status = dialog.getByLabel('Status', { exact: true });
    await status.click();
    await expect(page.getByRole('option', { name: 'Deprecated' })).toBeVisible();
    await expect(status).toHaveAttribute('data-expanded', 'true');
    await page.keyboard.press('Escape');
    // Only the list closed: the Select keeps its value and focus
    await expect(page.getByRole('option', { name: 'Deprecated' })).toHaveCount(0);
    await expect(status).not.toHaveAttribute('data-expanded');
    await expect(status).toHaveValue('Active');
    await expect(status).toBeFocused();
    // Past the Modal's 200ms exit transition: still open, the typed input kept
    await page.waitForTimeout(400);
    await expect(dialog).toBeVisible();
    await expect(name).toHaveValue('Customer 361');
    expect(await closes(page)).toBe(0);
    // With the list closed, Escape closes the dialog
    await page.keyboard.press('Escape');
    await expect(dialog).toHaveCount(0);
    expect(await closes(page)).toBe(1);
  });

  test('Dialog: Escape in an open Mantine Popover closes only the popover', async ({ page }) => {
    const dialog = page.getByRole('dialog', { name: 'Rename data product' });
    await dialog.getByRole('button', { name: 'Filters' }).click();
    const filter = page.getByRole('textbox', { name: 'Filter text' });
    await expect(filter).toBeFocused();
    await filter.fill('orders');
    await page.keyboard.press('Escape');
    await expect(filter).toHaveCount(0);
    await page.waitForTimeout(400);
    await expect(dialog).toBeVisible();
    expect(await closes(page)).toBe(0);
    await page.keyboard.press('Escape');
    await expect(dialog).toHaveCount(0);
    expect(await closes(page)).toBe(1);
  });

  test('Dialog: Escape in an open Mantine Menu closes only the menu', async ({ page }) => {
    const dialog = page.getByRole('dialog', { name: 'Rename data product' });
    await dialog.getByRole('button', { name: 'Actions' }).click();
    const item = page.getByRole('menuitem', { name: 'Duplicate' });
    await expect(item).toBeVisible();
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('Escape');
    await expect(item).toHaveCount(0);
    await page.waitForTimeout(400);
    await expect(dialog).toBeVisible();
    expect(await closes(page)).toBe(0);
    await page.keyboard.press('Escape');
    await expect(dialog).toHaveCount(0);
    expect(await closes(page)).toBe(1);
  });

  test('Dialog: Escape in a Dialog opened from a Dialog closes only the top one', async ({ page }) => {
    const nestedCloses = () =>
      page.evaluate(async (path) => (await import(/* @vite-ignore */ path)).dialogEvents.nestedCloses, harness);
    const dialog = page.getByRole('dialog', { name: 'Rename data product' });
    await dialog.getByRole('textbox', { name: 'Name' }).fill('Customer 361');
    await dialog.getByRole('button', { name: 'Discard' }).click();
    const confirm = page.getByRole('alertdialog', { name: 'Discard changes?' });
    await expect(confirm.getByRole('button', { name: 'Keep editing' })).toBeFocused();
    await page.keyboard.press('Escape');
    await expect(confirm).toHaveCount(0);
    await page.waitForTimeout(400);
    await expect(dialog).toBeVisible();
    await expect(dialog.getByRole('textbox', { name: 'Name' })).toHaveValue('Customer 361');
    expect([await closes(page), await nestedCloses()]).toEqual([0, 1]);
    // Then Escape closes the dialog under it
    await page.keyboard.press('Escape');
    await expect(dialog).toHaveCount(0);
    expect([await closes(page), await nestedCloses()]).toEqual([1, 1]);
  });

  test('Dialog: long content scrolls in the body; the title and footer stay in view', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 600 });
    await page.evaluate(async (path) => (await import(/* @vite-ignore */ path)).mountDialog({ long: true }), harness);
    const dialog = page.getByRole('dialog', { name: 'Rename data product' });
    await expect(dialog.getByText('Paragraph 60', { exact: false })).toBeAttached();
    // At most the window less 2rem above and below
    const b = (await dialog.boundingBox())!;
    expect(b.y).toBeGreaterThanOrEqual(0);
    expect(b.height).toBeLessThanOrEqual(600 - 64 + 1);
    // The title and the footer's actions are on screen, on top, without scrolling
    const onTop = async (loc: Locator) => {
      const r = (await loc.boundingBox())!;
      expect(r.y).toBeGreaterThanOrEqual(b.y);
      expect(r.y + r.height).toBeLessThanOrEqual(b.y + b.height);
      return page.evaluate(([x, y]) => document.elementFromPoint(x, y)?.textContent, [r.x + r.width / 2, r.y + r.height / 2]);
    };
    expect(await onTop(dialog.getByRole('button', { name: 'Save' }))).toBe('Save');
    expect(await onTop(dialog.getByRole('heading', { name: 'Rename data product' }))).toBe('Rename data product');
    // The body scrolls; the dialog itself doesn't
    const body = dialog.getByRole('textbox', { name: 'Name' }).locator('..');
    const scroll = (loc: Locator) => loc.evaluate((el) => ({
      overflowY: getComputedStyle(el).overflowY, scrolls: el.scrollHeight > el.clientHeight,
    }));
    expect(await scroll(body)).toEqual({ overflowY: 'auto', scrolls: true });
    expect((await scroll(dialog)).scrolls).toBe(false);
  });

  test('Dialog: a fixed height holds while the content loads', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.evaluate(async (path) => (await import(/* @vite-ignore */ path)).mountDialog({ late: true, height: '80vh' }), harness);
    const dialog = page.getByRole('dialog', { name: 'Rename data product' });
    await expect(dialog).toBeVisible();
    await page.waitForFunction(() => document.getAnimations().every((a) => a.playState === 'finished'));
    const before = (await dialog.boundingBox())!.height;
    await expect(dialog.getByText('Paragraph 60', { exact: false })).toBeAttached();
    const after = (await dialog.boundingBox())!.height;
    expect([before, after]).toEqual([720, 720]);
    await expect(dialog.getByRole('button', { name: 'Save' })).toBeInViewport();
  });

  test('Dialog sizes: sm 420, lg 720, xl 960', async ({ page }) => {
    // Wide enough for xl beside Mantine's gutter
    await page.setViewportSize({ width: 1280, height: 900 });
    for (const [size, px] of [['sm', 420], ['lg', 720], ['xl', 960]] as const) {
      await page.evaluate(async ([path, s]) => (await import(/* @vite-ignore */ path)).mountDialog({ size: s }), [harness, size] as const);
      const dialog = page.getByRole('dialog', { name: 'Rename data product' });
      await expect(dialog).toBeVisible();
      expect(Math.round((await dialog.boundingBox())!.width), size).toBe(px);
    }
  });

  test('Dialog covers an open assistant window', async ({ page }) => {
    await page.evaluate(async (path) => (await import(/* @vite-ignore */ path)).mountDialog({ assistant: true }), harness);
    const assistant = page.locator('[role="dialog"][aria-modal="false"]', { hasText: 'Assistant body' });
    await expect(assistant).toBeVisible();
    await expect(page.getByRole('dialog', { name: 'Rename data product' })).toBeVisible();
    const level = await zIndex(assistant);
    // Above the shell's top bar (40), under the Dialog's overlay
    expect(level).toBeGreaterThan(40);
    expect(level).toBeLessThan(await zIndex(page.locator('.mantine-Modal-overlay')));
    const b = (await assistant.boundingBox())!;
    expect(await page.evaluate(([x, y]) => {
      const el = document.elementFromPoint(x, y);
      return el?.classList.contains('mantine-Modal-overlay') ?? false;
    }, [b.x + 20, b.y + b.height / 2])).toBe(true);
  });

  test('Dialog: Escape in an open Radix popover closes only the popover', async ({ page }) => {
    const dialog = page.getByRole('dialog', { name: 'Rename data product' });
    await dialog.getByRole('button', { name: 'More' }).click();
    await expect(page.getByText('Popover body')).toBeVisible();
    // The popover opens above the dialog
    const body = (await page.getByText('Popover body').boundingBox())!;
    expect(await page.evaluate(([x, y]) => document.elementFromPoint(x, y)?.textContent, [body.x + 4, body.y + body.height / 2])).toBe('Popover body');
    await page.keyboard.press('Escape');
    await expect(page.getByText('Popover body')).toHaveCount(0);
    await page.waitForTimeout(400);
    await expect(dialog).toBeVisible();
    expect(await closes(page)).toBe(0);
    await page.keyboard.press('Escape');
    await expect(dialog).toHaveCount(0);
    expect(await closes(page)).toBe(1);
  });

  test('Dialog sits above the shell and below toasts', async ({ page }) => {
    await page.evaluate(async () => {
      const { toast } = await import('/src/hooks/use-toast.ts');
      toast({ title: 'Saved over a dialog', duration: Infinity });
    });
    const toasts = page.locator('.mantine-Notifications-root', { hasText: 'Saved over a dialog' });
    await expect(toasts).toBeVisible();

    const modal = await zIndex(page.locator('.mantine-Modal-inner'));
    expect(await zIndex(page.locator('.mantine-Modal-overlay'))).toBe(modal);
    const shell = await page.locator('.apfm-surface').evaluateAll((els) => els.map((el) => Number(getComputedStyle(el).zIndex) || 0));
    expect(shell.length).toBeGreaterThanOrEqual(2);
    for (const level of shell) expect(modal).toBeGreaterThan(level);
    expect(await zIndex(toasts)).toBeGreaterThan(modal);

    // The pickers a dialog holds open above it: a Mantine Select's list and
    // a Radix layer (the shadcn z-50)
    const dialog = page.getByRole('dialog', { name: 'Rename data product' });
    await dialog.getByLabel('Status', { exact: true }).click();
    const list = page.locator('.mantine-Select-dropdown', { has: page.getByRole('option', { name: 'Deprecated' }) });
    await expect(list).toBeVisible();
    expect(await zIndex(list)).toBeGreaterThan(modal);
    await page.keyboard.press('Escape');
    await dialog.getByRole('button', { name: 'More' }).click();
    await expect(page.getByText('Popover body')).toBeVisible();
    expect(await zIndex(page.locator('[data-radix-popper-content-wrapper]'))).toBeGreaterThan(modal);
  });
});
