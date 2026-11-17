/**
 * Wave 3 Task 3: a compliance policy (/compliance/policies/:policyId) and a run
 * (/compliance/runs/:runId) on the page kit, measured in a real browser
 * (ruling R10: jsdom ignores the cascade). Both pages draw their own margin
 * under the shell's breadcrumb, with panes stacked at their own height.
 *
 * CAPTURE=before|after also saves images of both pages and the edit dialog to
 * .superpowers/sdd/2026-11-13-mantine-restyle-wave-3/task-3-images/.
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test, type Locator, type Page } from '@playwright/test';
import { mockApi } from './fixtures/api';
import { DATA_FIXTURES } from './fixtures/data';
import { PERSONAS, type Persona } from './fixtures/personas';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const IMAGES = path.resolve(HERE, '../../../../.superpowers/sdd/2026-11-13-mantine-restyle-wave-3/task-3-images');
const CAPTURE = process.env.CAPTURE;

const NAVY = 'rgb(31, 48, 102)';

// Review Focus 1: Task 1's fixtures hold a 200-character policy name
// (e2e-policy-4, with spaces) and a 120-character unbroken object name (result
// r2); these have no break opportunity at all, so only overflow-wrap can wrap them
const UNBROKEN_NAME = 'x'.repeat(200);
const UNBROKEN_RULE = `MATCH (o:Object) ASSERT o.${'y'.repeat(300)} IS NOT NULL`;
const LONG_NAME_START = /^Every data product that holds personal data/;
const LONG_OBJECT = `main.sales.customer_lifetime_value_${'x'.repeat(120)}`.slice(0, 120);

type Rec = Record<string, unknown>;
const policies = (DATA_FIXTURES['/api/compliance/policies'] as { policies: Rec[] }).policies;
const POLICY_1 = DATA_FIXTURES['/api/compliance/policies/e2e-policy-1'] as Rec;
const RUNS = DATA_FIXTURES['/api/compliance/policies/e2e-policy-1/runs'] as Rec[];
const resultsOf = DATA_FIXTURES['/api/compliance/runs/e2e-run-1/results'] as (url: URL) => { run: Rec; results: Rec[] };

const style = (loc: Locator, props: string[]) =>
  loc.evaluate((el, names) => {
    const cs = getComputedStyle(el);
    return Object.fromEntries(names.map((n) => [n, cs.getPropertyValue(n)]));
  }, props);

const box = async (loc: Locator) => (await loc.boundingBox())!;

const noPageScroll = (page: Page) =>
  page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);

async function setUp(page: Page, route: string, heading: string | RegExp, data: Record<string, unknown> = {}, persona: Persona = PERSONAS.admin) {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.clock.setFixedTime(new Date('2026-11-09T12:00:00Z'));
  await mockApi(page, persona, { ...DATA_FIXTURES, ...data });
  await page.goto(route);
  await expect(page.getByRole('heading', { level: 1, name: heading })).toBeVisible();
}

async function capture(page: Page, name: string) {
  if (!CAPTURE) return;
  await page.mouse.move(0, 0);
  await page.waitForTimeout(500);
  await page.screenshot({ path: path.join(IMAGES, `${name}-${CAPTURE}.png`), animations: 'disabled', caret: 'hide' });
}

// A policy page for e2e-policy-4 (the 200-character name), with the first policy's runs
const LONG_POLICY = {
  '/api/compliance/policies/e2e-policy-4': { ...policies[3], examples: { pass: ['main.sales.orders'], fail: [UNBROKEN_NAME] } },
  '/api/compliance/policies/e2e-policy-4/runs': RUNS,
};
// A policy whose description, rule and an example have no break opportunity
const UNBROKEN_POLICY = {
  '/api/compliance/policies/e2e-policy-1': { ...POLICY_1, description: UNBROKEN_NAME, rule: UNBROKEN_RULE, examples: { pass: [UNBROKEN_NAME], fail: [] } },
};

test.describe('captures', () => {
  test('captures both pages and the edit dialog', async ({ page }) => {
    test.skip(!CAPTURE, 'only with CAPTURE=before|after');
    // Not through setUp: the page before the restyle has no h1
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.clock.setFixedTime(new Date('2026-11-09T12:00:00Z'));
    await mockApi(page, PERSONAS.admin, DATA_FIXTURES);
    await page.goto('/compliance/policies/e2e-policy-1');
    await expect(page.locator('main').getByText('main.sales.orders').first()).toBeVisible();
    await capture(page, 'policy');
    await page.getByRole('button', { name: 'Edit', exact: true }).click();
    await expect(page.getByRole('dialog')).toBeVisible();
    await capture(page, 'policy-edit');
    await page.keyboard.press('Escape');
    await page.goto('/compliance/runs/e2e-run-1');
    await expect(page.getByText('main.sales.orders').first()).toBeVisible();
    await capture(page, 'run');
  });
});

test.describe('policy details', () => {
  test('is full bleed under the shell breadcrumb, with the kit header and stacked panes', async ({ page }) => {
    await setUp(page, '/compliance/policies/e2e-policy-1', 'Owner assigned');
    const main = page.locator('main');
    expect(await style(main, ['padding-top', 'padding-left'])).toEqual({ 'padding-top': '0px', 'padding-left': '0px' });
    const mainBox = await box(main);
    const title = page.getByRole('heading', { level: 1, name: 'Owner assigned' });
    expect(await style(title, ['font-size', 'color'])).toEqual({ 'font-size': '16px', color: NAVY });
    expect(Math.round((await box(title)).x - mainBox.x)).toBe(14);

    // Panes in one column, sharing borders
    const panes = main.locator('section[class*="pane"]');
    await expect(main.getByRole('region', { name: 'Policy details' })).toBeVisible();
    for (const name of ['Rule', 'Run Summary', 'Runs', 'Results']) await expect(main.getByRole('region', { name })).toBeVisible();
    expect(await panes.count()).toBeGreaterThanOrEqual(6);
    // The header's buttons are 26px, and the table's rows 28px
    expect(Math.round((await box(page.getByRole('button', { name: 'Back to List' }))).height)).toBe(26);
    expect(Math.round((await box(main.locator('thead tr').first())).height)).toBe(28);
    // The figures: a 12px label over a 16px value
    const summary = main.getByRole('region', { name: 'Run Summary' });
    expect((await style(summary.getByText('Score', { exact: true }), ['font-size']))['font-size']).toBe('12px');
    expect((await style(summary.getByText('60%'), ['font-size']))['font-size']).toBe('16px');
    // The rule is code: the one mono block; prose is not
    const rule = main.getByRole('region', { name: 'Rule' }).locator('pre');
    expect((await style(rule, ['font-family']))['font-family']).toMatch(/mono|Menlo|Consolas|Courier/i);
    expect((await style(main.getByText('Owner assigned across every product'), ['font-family']))['font-family']).not.toMatch(/mono|Menlo|Consolas|Courier/i);
    expect(await noPageScroll(page)).toBe(true);
  });

  test('a 200-character policy name wraps or truncates with a title, with no horizontal page scroll', async ({ page }) => {
    await setUp(page, '/compliance/policies/e2e-policy-4', LONG_NAME_START, LONG_POLICY);
    const title = page.getByRole('heading', { level: 1, name: LONG_NAME_START });
    // The header keeps to one line and carries the whole name in its title
    expect((await title.getAttribute('title'))?.length).toBe(200);
    expect((await box(title)).height).toBeLessThan(30);
    // The description is the same 200 characters: it wraps in the details grid
    const description = page.locator('main').getByRole('region', { name: 'Policy details' }).getByText(LONG_NAME_START);
    await expect(description).toBeVisible();
    expect((await box(description)).height).toBeGreaterThan(30);
    expect(await description.evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(true);
    expect(await noPageScroll(page)).toBe(true);
    // The edit dialog's description names it, and the dialog stays on screen
    await page.getByRole('button', { name: 'Edit', exact: true }).click();
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();
    const dialogBox = await box(dialog);
    expect(dialogBox.x).toBeGreaterThanOrEqual(0);
    expect(dialogBox.x + dialogBox.width).toBeLessThanOrEqual(1280);
    await expect(dialog.getByRole('button', { name: 'Save' })).toBeInViewport();
    expect(await noPageScroll(page)).toBe(true);
  });

  test('a description, rule and example with no break opportunity wrap and cause no horizontal page scroll', async ({ page }) => {
    await setUp(page, '/compliance/policies/e2e-policy-1', 'Owner assigned', UNBROKEN_POLICY);
    const main = page.locator('main');
    const description = main.getByRole('region', { name: 'Policy details' }).getByText(UNBROKEN_NAME, { exact: true });
    await expect(description).toBeVisible();
    expect(await description.evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(true);
    expect((await box(description)).height).toBeGreaterThan(30);
    const rule = main.getByRole('region', { name: 'Rule' }).locator('pre');
    expect(await rule.evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(true);
    expect((await box(rule)).height).toBeGreaterThan(30);
    const example = main.getByRole('region', { name: 'Rule' }).locator('li code', { hasText: UNBROKEN_NAME });
    await expect(example).toBeVisible();
    expect(await example.evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(true);
    for (const pane of await main.locator('section[class*="pane"]').all()) {
      expect(await pane.evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(true);
    }
    expect(await noPageScroll(page)).toBe(true);
  });

  test('a long object name in the results wraps and carries a title', async ({ page }) => {
    await setUp(page, '/compliance/policies/e2e-policy-1', 'Owner assigned', {
      '/api/compliance/runs/e2e-run-1/results': (url: URL) => resultsOf(url),
    });
    const results = page.locator('main').getByRole('region', { name: 'Results' });
    const name = results.locator('tbody code', { hasText: LONG_OBJECT.slice(0, 30) }).first();
    await expect(name).toBeVisible();
    expect(await name.getAttribute('title')).toBe(LONG_OBJECT);
    expect(await name.evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(true);
    expect(await noPageScroll(page)).toBe(true);
  });

  test('Edit and Run Now: the admin sees both, the read-only consumer neither, and still reads everything', async ({ browser }) => {
    for (const [persona, canWrite] of [[PERSONAS.admin, true], [PERSONAS.consumer, false]] as const) {
      const context = await browser.newContext();
      const page = await context.newPage();
      await setUp(page, '/compliance/policies/e2e-policy-1', 'Owner assigned', {}, persona);
      const own = page.locator('main');
      await expect(own.getByRole('button', { name: 'Back to List' })).toBeVisible();
      await expect(own.getByRole('button', { name: 'Edit', exact: true })).toHaveCount(canWrite ? 1 : 0);
      await expect(own.getByRole('button', { name: 'Run', exact: true })).toHaveCount(canWrite ? 1 : 0);
      // Everything stays readable
      for (const name of ['Rule', 'Runs', 'Results']) await expect(own.getByRole('region', { name })).toBeVisible();
      await context.close();
    }
  });

  test('the edit dialog is the kit Dialog, with the rule in mono, and Escape in a Select closes only the Select', async ({ page }) => {
    await setUp(page, '/compliance/policies/e2e-policy-1', 'Owner assigned');
    await page.getByRole('button', { name: 'Edit', exact: true }).click();
    const dialog = page.getByRole('dialog', { name: 'Edit Compliance Rule' });
    await expect(dialog).toBeVisible();
    await expect(dialog).toHaveClass(/mantine-Modal-content/);
    expect(await style(dialog, ['border-top-left-radius'])).toEqual({ 'border-top-left-radius': '8px' });
    expect(Math.round((await box(dialog)).width)).toBe(720);
    const mono = async (loc: Locator) => (await style(loc, ['font-family']))['font-family'];
    const ruleFont = await mono(dialog.getByRole('textbox', { name: /^Rule Code/ }));
    expect(ruleFont).toMatch(/mono|Menlo|Consolas|Courier/i);
    for (const name of [/^Name/, /^Description/, /^Failure Message/]) {
      expect(await mono(dialog.getByRole('textbox', { name }))).not.toBe(ruleFont);
    }
    expect(Math.round((await box(dialog.getByRole('textbox', { name: /^Name/ }))).height)).toBe(28);

    const name = dialog.getByRole('textbox', { name: /^Name/ });
    await name.fill('Owner named');
    for (const field of ['Category', 'Severity']) {
      await dialog.getByRole('textbox', { name: field }).click();
      const list = page.getByRole('listbox');
      await expect(list).toBeVisible();
      await page.keyboard.press('Escape');
      await expect(list).toHaveCount(0);
      await expect(dialog).toBeVisible();
      await expect(name).toHaveValue('Owner named');
    }
    // The next Escape is the dialog's, and focus goes back to Edit
    await page.keyboard.press('Escape');
    await expect(dialog).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Edit', exact: true })).toBeFocused();
  });
});

test.describe('run details', () => {
  test('is full bleed under the shell breadcrumb, with the kit header and two panes', async ({ page }) => {
    await setUp(page, '/compliance/runs/e2e-run-1', 'Run e2e-run-1');
    const main = page.locator('main');
    expect(await style(main, ['padding-top', 'padding-left'])).toEqual({ 'padding-top': '0px', 'padding-left': '0px' });
    const mainBox = await box(main);
    const title = page.getByRole('heading', { level: 1, name: 'Run e2e-run-1' });
    expect(await style(title, ['font-size', 'color'])).toEqual({ 'font-size': '16px', color: NAVY });
    expect(Math.round((await box(title)).x - mainBox.x)).toBe(14);
    await expect(main.getByRole('region', { name: 'Run Summary' })).toBeVisible();
    await expect(main.getByRole('region', { name: 'Results' })).toBeVisible();
    expect(Math.round((await box(main.locator('thead tr').first())).height)).toBe(28);
    expect(Math.round((await box(page.getByRole('button', { name: 'Back', exact: true }))).height)).toBe(26);
    await expect(page.getByRole('link', { name: 'View Policy' })).toHaveAttribute('href', '/compliance/policies/e2e-policy-1');
    expect(await noPageScroll(page)).toBe(true);
  });

  test('a 120-character unbroken object name wraps with a title and causes no horizontal page scroll', async ({ page }) => {
    await setUp(page, '/compliance/runs/e2e-run-1', 'Run e2e-run-1');
    const name = page.locator('main tbody code', { hasText: LONG_OBJECT.slice(0, 30) });
    await expect(name).toBeVisible();
    expect(await name.getAttribute('title')).toBe(LONG_OBJECT);
    expect(await name.evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(true);
    expect(await noPageScroll(page)).toBe(true);
    // In a narrow window it wraps instead of widening the page or the pane
    await page.setViewportSize({ width: 640, height: 800 });
    await expect(name).toBeVisible();
    expect(await name.evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(true);
    expect((await box(name)).height).toBeGreaterThan(20);
    expect(await noPageScroll(page)).toBe(true);
    for (const pane of await page.locator('main section[class*="pane"]').all()) {
      expect(await pane.evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(true);
    }
  });

  test('a 5,000-result run pages, filters and stays responsive in a browser', async ({ page }) => {
    const big = Array.from({ length: 5000 }, (_, i) => ({
      id: `big-${i}`, run_id: 'e2e-run-1', object_type: 'table', object_id: `o-${i}`,
      object_name: `main.sales.table_${String(i).padStart(4, '0')}`, passed: false, message: `Missing owner ${i}`,
      details_json: null, created_at: '2026-11-08T08:00:10Z',
    }));
    await setUp(page, '/compliance/runs/e2e-run-1', 'Run e2e-run-1', {
      '/api/compliance/runs/e2e-run-1/results': () => ({ run: { ...resultsOf(new URL('http://x/?only_failed=true')).run, failure_count: 5000 }, results: big }),
    });
    const results = page.locator('main').getByRole('region', { name: 'Results' });
    await expect(results.locator('tbody tr')).toHaveCount(10);
    await expect(results.getByText('main.sales.table_0000')).toBeVisible();
    await expect(results.getByText('Page 1 of 500')).toBeVisible();

    // Paging: next, then last
    let started = Date.now();
    await results.getByRole('button', { name: 'Go to next page' }).click();
    await expect(results.getByText('main.sales.table_0010')).toBeVisible();
    expect(Date.now() - started).toBeLessThan(2000);
    await results.getByRole('button', { name: 'Go to last page' }).click();
    await expect(results.getByText('main.sales.table_4999')).toBeVisible();
    await expect(results.getByText('Page 500 of 500')).toBeVisible();

    // The filter searches all 5,000 rows, and the page answers within a couple of seconds
    started = Date.now();
    await results.getByPlaceholder('Filter object names...').fill('table_3141');
    await expect(results.locator('tbody tr')).toHaveCount(1);
    await expect(results.getByText('main.sales.table_3141')).toBeVisible();
    expect(Date.now() - started).toBeLessThan(2000);
    await results.getByPlaceholder('Filter object names...').fill('');
    await expect(results.locator('tbody tr')).toHaveCount(10);
    expect(await noPageScroll(page)).toBe(true);
  });

  test('a failed run keeps its error and back link', async ({ page }) => {
    const run = { ...resultsOf(new URL('http://x/?only_failed=true')).run, status: 'failed', score: 0, success_count: 0, failure_count: 0, error_message: 'Warehouse unreachable: connection timed out' };
    await setUp(page, '/compliance/runs/e2e-run-1', 'Run e2e-run-1', {
      '/api/compliance/runs/e2e-run-1/results': () => ({ run, results: [] }),
    });
    const summary = page.locator('main').getByRole('region', { name: 'Run Summary' });
    await expect(summary.getByText('Warehouse unreachable: connection timed out')).toBeVisible();
    await expect(summary.getByText('failed', { exact: true })).toBeVisible();
    expect(await style(summary.getByText(/Warehouse unreachable/), ['color'])).toEqual({ color: 'rgb(212, 28, 22)' });
    await expect(page.getByRole('button', { name: 'Back', exact: true })).toBeVisible();
    await expect(page.getByRole('link', { name: 'View Policy' })).toBeVisible();
    // Going back leads to the page before
    await page.goto('/compliance');
    await page.goto('/compliance/runs/e2e-run-1');
    await expect(page.getByRole('heading', { level: 1, name: 'Run e2e-run-1' })).toBeVisible();
    await page.getByRole('button', { name: 'Back', exact: true }).click();
    await expect(page).toHaveURL(/\/compliance$/);
  });
});
