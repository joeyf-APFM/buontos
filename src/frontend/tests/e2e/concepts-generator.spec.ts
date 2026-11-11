/**
 * Wave 2 Task 12b: the Ontology Generator (/concepts/generator) on the page
 * kit, and Define's Guided Generate and Import Concepts dialogs on the kit
 * Dialog, measured in a real browser (ruling R10: jsdom ignores the cascade).
 *
 * CAPTURE=before|after also saves images of the page, its result tabs, the
 * save dialog and the two Define dialogs to
 * .superpowers/sdd/2026-11-10-mantine-restyle-wave-2/task-12b-images/.
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test, type Locator, type Page } from '@playwright/test';
import { mockApi } from './fixtures/api';
import { DATA_FIXTURES } from './fixtures/data';
import { PERSONAS } from './fixtures/personas';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const IMAGES = path.resolve(HERE, '../../../../.superpowers/sdd/2026-11-10-mantine-restyle-wave-2/task-12b-images');
const CAPTURE = process.env.CAPTURE;

const NAVY = 'rgb(31, 48, 102)';

// Review Focus 1: a 200-character name, and one with no break opportunity
const LONG_NAME = `Enterprise ${'customer-order-fulfilment-ontology-'.repeat(7)}`.slice(0, 200);
const UNBROKEN_NAME = 'x'.repeat(200);

const params = (connection_name: string) => ({
  connection_id: 'e2e-conn-1', connection_name, path_count: 2, guidelines: 'Model the sales domain', base_uri: 'http://e2e.example.org/ontology#', options: {},
});
const RUNS = [
  { run_id: 'run-done', status: 'completed', params: params('Workspace catalog'), step_count: 3, created_at: '2026-11-09T11:00:00Z', completed_at: '2026-11-09T11:04:00Z' },
  { run_id: 'run-partial', status: 'completed', params: params('Partial catalog'), step_count: 1, created_at: '2026-11-09T10:00:00Z', completed_at: '2026-11-09T10:01:00Z' },
  { run_id: 'run-failed', status: 'failed', error: 'The model timed out', params: params(LONG_NAME), step_count: 0, created_at: '2026-11-09T09:00:00Z' },
];

const cls = (name: string, extra: Record<string, unknown> = {}) => ({
  uri: `urn:e2e:${name.slice(0, 20)}`, name, label: name, comment: `About ${name.slice(0, 30)}`, emoji: '', parent: '', dataProperties: [], ...extra,
});
const RESULT = {
  success: true,
  owl_content: '@prefix : <http://e2e.example.org/ontology#> .\n:Customer a owl:Class .',
  classes: [
    cls('Customer', { dataProperties: [{ name: 'customer_id', label: 'id', uri: 'urn:p1' }, { name: 'email', label: 'email', uri: 'urn:p2' }] }),
    cls(LONG_NAME, { parent: 'Customer', comment: `A long comment ${'about the class '.repeat(20)}` }),
    cls(UNBROKEN_NAME, { parent: UNBROKEN_NAME }),
  ],
  properties: [
    { uri: 'urn:op1', name: 'placedBy', label: 'placed by', comment: '', type: 'ObjectProperty', domain: 'Order', range: 'Customer' },
    { uri: 'urn:dp1', name: 'email', label: 'email', comment: '', type: 'DatatypeProperty', domain: 'Customer', range: 'xsd:string' },
  ],
  ontology_info: { uri: 'http://e2e.example.org/ontology', label: 'Sales', comment: '', namespace: 'http://e2e.example.org/ontology#' },
  constraints: [],
  axioms: [],
  steps: [{ step_type: 'tool_call', content: 'list_tables(gold.sales)', tool_name: 'list_tables', duration_ms: 120 }],
  iterations: 2,
  error: '',
  usage: { prompt_tokens: 100, completion_tokens: 50 },
};
const detail = (run: (typeof RUNS)[number], result: unknown) => ({ ...run, steps: RESULT.steps, result });

const style = (loc: Locator, props: string[]) =>
  loc.evaluate((el, names) => {
    const cs = getComputedStyle(el);
    return Object.fromEntries(names.map((n) => [n, cs.getPropertyValue(n)]));
  }, props);

const box = async (loc: Locator) => (await loc.boundingBox())!;

const noPageScroll = (page: Page) =>
  page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);

async function setUp(page: Page, extra: Record<string, unknown> = {}, width = 1280) {
  await page.setViewportSize({ width, height: 800 });
  await page.clock.setFixedTime(new Date('2026-11-09T12:00:00Z'));
  await mockApi(page, PERSONAS.admin, {
    ...DATA_FIXTURES,
    '/api/ontology/runs': { runs: RUNS },
    '/api/ontology/runs/run-done': detail(RUNS[0], RESULT),
    '/api/ontology/runs/run-partial': detail(RUNS[1], { ...RESULT, success: false, classes: [], properties: [], error: 'The agent stopped before it finished' }),
    ...extra,
  });
  await page.goto('/concepts/generator');
  await expect(page.locator('main').getByRole('heading', { name: 'Ontology Generator' })).toBeVisible();
}

const recentRuns = (page: Page) => page.locator('main').getByRole('region', { name: 'Recent Runs' });

/** Opens Recent Runs and loads a completed run's result. */
async function loadRun(page: Page, connection: string) {
  const runs = recentRuns(page);
  await runs.getByRole('button', { name: 'Recent Runs' }).click();
  await runs.getByRole('button', { name: new RegExp(`^${connection}`) }).click();
}

async function capture(page: Page, name: string, target?: Locator) {
  if (!CAPTURE) return;
  await page.mouse.move(0, 0);
  await page.waitForTimeout(400);
  const file = path.join(IMAGES, `${name}-${CAPTURE}.png`);
  const options = { path: file, animations: 'disabled', caret: 'hide' } as const;
  if (target) await target.screenshot(options);
  else await page.screenshot({ ...options, fullPage: true });
}

test.describe('captures', () => {
  test('captures the generator, its results, the save dialog and the Define dialogs', async ({ page }) => {
    test.skip(!CAPTURE, 'only with CAPTURE=before|after');
    await setUp(page);
    await expect(page.locator('main').getByText('main', { exact: true })).toBeVisible();
    await capture(page, 'generator');
    await page.locator('main').getByText('Recent Runs').first().click();
    await page.locator('main').getByText('Workspace catalog', { exact: true }).last().click();
    await expect(page.locator('main').getByRole('tab', { name: 'Classes (3)' })).toBeVisible();
    await capture(page, 'generator-result');
    await page.locator('main').getByRole('tab', { name: /Properties/ }).click();
    await capture(page, 'generator-properties');
    await page.locator('main').getByRole('button', { name: /Save to scheme/ }).click();
    await expect(page.getByRole('dialog')).toBeVisible();
    await capture(page, 'generator-save-dialog');

    await page.goto('/concepts/define?open=generate');
    await expect(page.getByRole('dialog')).toBeVisible();
    await page.getByRole('dialog').getByLabel('What domain are you working in?').fill('Finance');
    await capture(page, 'guided-generate-dialog');
    await page.goto('/concepts/define?open=import');
    await expect(page.getByRole('dialog')).toBeVisible();
    await capture(page, 'import-concepts-dialog');
  });
});

test.describe('the generator', () => {
  test('the kit header, the settings and runs in panes on the left, the resources on the right', async ({ page }) => {
    await setUp(page);
    const main = page.locator('main');
    const title = main.getByRole('heading', { level: 1, name: 'Ontology Generator' });
    expect(await style(title, ['font-size', 'color'])).toEqual({ 'font-size': '16px', color: NAVY });
    const connection = main.getByRole('region', { name: 'Connection' });
    const options = main.getByRole('region', { name: 'Generation Options' });
    const resources = main.getByRole('region', { name: 'Workspace catalog — Resources' });
    for (const pane of [connection, options, recentRuns(page), resources]) await expect(pane).toBeVisible();
    // The settings column is 300px, beside the resources
    expect(Math.round((await box(connection)).width)).toBe(300);
    expect((await box(resources)).x).toBeGreaterThan((await box(connection)).x + 300);
    expect(Math.round((await box(resources)).y)).toBe(Math.round((await box(connection)).y));
    // The connection field is a 28px Mantine Select, named
    const select = connection.getByRole('textbox', { name: 'Connection' });
    await expect(select).toHaveValue('Workspace catalog');
    expect(Math.round((await box(select)).height)).toBe(28);
    // The Base URI is an identifier, in mono; the guidelines are prose
    const mono = (await style(options.getByRole('textbox', { name: 'Base URI' }), ['font-family']))['font-family'];
    expect(mono).toMatch(/mono|Menlo|Consolas/i);
    const prose = (await style(options.getByRole('textbox', { name: 'Guidelines' }), ['font-family']))['font-family'];
    expect(prose).toMatch(/Optima/);
    await expect(main.getByRole('button', { name: 'Generate Ontology (0 selected)' })).toBeDisabled();
  });

  test('the run list opens from the keyboard, and a run\'s card opens on focus', async ({ page }) => {
    await setUp(page);
    const runs = recentRuns(page);
    const toggle = runs.getByRole('button', { name: 'Recent Runs' });
    await expect(toggle).toHaveAttribute('aria-expanded', 'false');
    await toggle.focus();
    await page.keyboard.press('Enter');
    await expect(toggle).toHaveAttribute('aria-expanded', 'true');
    const row = runs.getByRole('button', { name: /^Workspace catalog/ });
    await page.keyboard.press('Tab');
    await expect(row).toBeFocused();
    await expect(page.getByText('Model the sales domain')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.getByText('Model the sales domain')).toHaveCount(0);
    await expect(runs.getByRole('button', { name: 'Delete run' })).toHaveCount(3);
    // A 200-character connection name is truncated with a title
    const long = runs.getByText(LONG_NAME, { exact: true });
    await expect(long).toHaveAttribute('title', LONG_NAME);
    expect(await style(long, ['text-overflow', 'white-space'])).toEqual({ 'text-overflow': 'ellipsis', 'white-space': 'nowrap' });
    expect(await noPageScroll(page)).toBe(true);
  });

  test('a run\'s result: the save banner, the kit tabs, 200-character class names wrap, and no page scroll', async ({ page }) => {
    await setUp(page);
    await loadRun(page, 'Workspace catalog');
    const results = page.locator('main').getByRole('region', { name: 'Results' });
    await expect(results.getByRole('button', { name: 'Save to scheme' })).toBeVisible();
    const tabs = results.getByRole('tab');
    await expect(tabs).toHaveText(['Classes (3)', 'Properties (2)', 'Turtle', 'Agent Log']);
    expect(Math.round((await box(tabs.first())).height)).toBe(30);
    for (const text of [LONG_NAME, UNBROKEN_NAME]) {
      const name = results.getByRole('cell', { name: text, exact: true }).first();
      await expect(name).toBeVisible();
      expect((await style(name, ['white-space']))['white-space']).toBe('normal');
    }
    // A table row is 28px
    const row = results.getByRole('row', { name: /^Customer/ });
    expect(Math.round((await box(row)).height)).toBe(28);
    expect(await noPageScroll(page)).toBe(true);
    await tabs.nth(2).click();
    await expect(results.getByText(':Customer a owl:Class .', { exact: false })).toBeVisible();
    await expect(results.getByRole('button', { name: 'Copy' })).toBeVisible();
    await expect(results.getByRole('button', { name: 'Download' })).toBeVisible();
  });

  test('a wide generated table scrolls inside its pane, not the page', async ({ page }) => {
    await setUp(page, {}, 1024);
    await loadRun(page, 'Workspace catalog');
    const results = page.locator('main').getByRole('region', { name: 'Results' });
    const scroller = results.getByTestId('generator-classes-scroll');
    await expect(scroller).toBeVisible();
    const { scrollWidth, clientWidth } = await scroller.evaluate((el) => ({ scrollWidth: el.scrollWidth, clientWidth: el.clientWidth }));
    expect(scrollWidth).toBeGreaterThan(clientWidth);
    expect((await style(scroller, ['overflow-x']))['overflow-x']).toBe('auto');
    expect(await noPageScroll(page)).toBe(true);
  });

  test('a 200-character connection name is truncated in the pane title, with no page scroll', async ({ page }) => {
    await setUp(page, { '/api/connections': [{ ...(DATA_FIXTURES['/api/connections'] as Record<string, unknown>[])[0], name: UNBROKEN_NAME }] });
    const heading = page.locator('main').getByRole('heading', { level: 2, name: `${UNBROKEN_NAME} — Resources` });
    await expect(heading).toHaveAttribute('title', `${UNBROKEN_NAME} — Resources`);
    expect(await style(heading, ['text-overflow', 'white-space'])).toEqual({ 'text-overflow': 'ellipsis', 'white-space': 'nowrap' });
    expect(await noPageScroll(page)).toBe(true);
  });

  test('empty and error states keep their actions', async ({ page }) => {
    // No connections: say so; the options and Generate stay
    await setUp(page, { '/api/connections': [] });
    const main = page.locator('main');
    await expect(main.getByText('No connections configured. Add one in Settings > Connectors.')).toBeVisible();
    await expect(main.getByRole('textbox', { name: 'Guidelines' })).toBeEditable();
    await expect(main.getByRole('button', { name: /Generate Ontology/ })).toBeVisible();
    await expect(recentRuns(page).getByRole('button', { name: 'Recent Runs' })).toBeEnabled();

    // A failed connections load: an error with Retry, which loads them again
    let fail = true;
    await page.route((url) => url.pathname === '/api/connections', (route) =>
      fail
        ? route.fulfill({ status: 500, json: { detail: 'Connections exploded' } })
        : route.fulfill({ json: DATA_FIXTURES['/api/connections'] }));
    await page.reload();
    const alert = main.getByRole('alert');
    await expect(alert).toContainText('Could not load the connections.');
    await expect(main.getByRole('textbox', { name: 'Guidelines' })).toBeEditable();
    fail = false;
    await main.getByRole('button', { name: 'Retry' }).click();
    await expect(main.getByRole('textbox', { name: 'Connection' })).toHaveValue('Workspace catalog');

    // A result with an error: shown as an error, and the page stays usable
    await loadRun(page, 'Partial catalog');
    await expect(main.getByText('The agent stopped before it finished')).toBeVisible();
    await expect(main.getByRole('tab', { name: 'Classes (0)' })).toBeVisible();
    await expect(main.getByText('No classes generated')).toBeVisible();
    await expect(main.getByRole('button', { name: /Generate Ontology/ })).toBeVisible();
  });

  test('Save to scheme opens the kit dialog; Escape closes it and gives focus back; Save posts and closes', async ({ page }) => {
    await setUp(page);
    await loadRun(page, 'Workspace catalog');
    const opener = page.locator('main').getByRole('button', { name: 'Save to scheme' });
    await opener.click();
    const dialog = page.getByRole('dialog', { name: 'Save to concept scheme' });
    await expect(dialog).toBeVisible();
    await expect(dialog).toHaveClass(/mantine-Modal-content/);
    const name = dialog.getByRole('textbox', { name: 'Scheme name' });
    await expect(name).toBeFocused();
    await name.fill('Sales Ontology');
    await page.keyboard.press('Escape');
    await expect(dialog).toHaveCount(0);
    await expect(opener).toBeFocused();

    const posted: unknown[] = [];
    await page.route((url) => url.pathname === '/api/ontology/save-to-collection', (route) => {
      posted.push(route.request().postDataJSON());
      return route.fulfill({ json: { success: true, collection_iri: 'urn:e2e:sales', triples_imported: 12, error: '' } });
    });
    await opener.click();
    await dialog.getByRole('textbox', { name: 'Scheme name' }).fill('Sales Ontology');
    await dialog.getByRole('button', { name: 'Save' }).click();
    await expect(dialog).toHaveCount(0);
    await expect(page.getByText('12 triples imported into "Sales Ontology".')).toBeVisible();
    expect(posted).toEqual([{ owl_content: RESULT.owl_content, collection_name: 'Sales Ontology', collection_description: '' }]);
  });
});

test.describe('the Define dialogs', () => {
  async function openDefine(page: Page, open: 'generate' | 'import') {
    await page.setViewportSize({ width: 1280, height: 800 });
    await mockApi(page, PERSONAS.admin, {
      ...DATA_FIXTURES,
      '/api/data-domains': [
        { id: 'e2e-domain-fin', name: 'Finance', description: null },
        { id: 'e2e-domain-ops', name: 'Operations', description: null },
      ],
      '/api/knowledge/collections': {
        collections: [
          { iri: 'urn:e2e:finance', label: 'Finance Glossary', collection_type: 'glossary', scope_level: 'enterprise', source_type: 'custom', is_editable: true, status: 'active', concept_count: 0, child_collections: [] },
        ],
      },
    });
    await page.goto(`/concepts/define?open=${open}`);
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();
    return dialog;
  }

  test('Guided build is a kit Dialog: Escape in its domain list closes only the list, and Continue hands the prompt to the generator', async ({ page }) => {
    const dialog = await openDefine(page, 'generate');
    await expect(dialog).toHaveClass(/mantine-Modal-content/);
    await expect(dialog).toHaveAccessibleName('Guided build');
    const domain = dialog.getByRole('textbox', { name: 'What domain are you working in?' });
    await expect(domain).toBeFocused();
    await domain.fill('Finance');
    const select = dialog.getByRole('textbox', { name: 'Data domain' });
    await select.click();
    await expect(page.getByRole('listbox')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.getByRole('listbox')).toHaveCount(0);
    await expect(dialog).toBeVisible();
    await expect(domain).toHaveValue('Finance');
    await dialog.getByRole('textbox', { name: 'Question 1' }).fill('Which invoices are overdue?');
    await expect(dialog.getByTestId('guided-prompt-preview')).toContainText('1. Which invoices are overdue?');
    await dialog.getByRole('button', { name: 'Continue to generator' }).click();
    await expect(page).toHaveURL(/\/concepts\/generator\?guidelines=/);
    await expect(page.locator('main').getByRole('textbox', { name: 'Guidelines' })).toHaveValue(
      'Build a domain ontology for: Finance.\nIt should help answer these questions:\n1. Which invoices are overdue?',
    );
  });

  test('opened from their cards, both dialogs give focus back to the card\'s button when Escape closes them', async ({ page }) => {
    const first = await openDefine(page, 'import');
    await page.keyboard.press('Escape');
    await expect(first).toHaveCount(0);
    await expect(page).toHaveURL(/\/concepts\/define$/);
    for (const [button, title] of [['Start guided build', 'Guided build'], ['Upload files', 'Import files']]) {
      const opener = page.locator('main').getByRole('button', { name: button });
      await opener.click();
      const dialog = page.getByRole('dialog', { name: title });
      await expect(dialog).toBeVisible();
      await page.keyboard.press('Escape');
      await expect(dialog).toHaveCount(0);
      await expect(opener).toBeFocused();
    }
  });

  test('Import files is a kit Dialog: Escape in its scheme list closes only the list, and the footer Import submits the form', async ({ page }) => {
    const dialog = await openDefine(page, 'import');
    await expect(dialog).toHaveClass(/mantine-Modal-content/);
    await expect(dialog).toHaveAccessibleName('Import files');
    const imported: string[] = [];
    await page.route((url) => url.pathname.endsWith('/import') || url.pathname.endsWith('/import/conflicts'), (route) => {
      imported.push(new URL(route.request().url()).pathname);
      if (route.request().url().includes('/conflicts')) return route.fulfill({ json: { conflicts: [] } });
      return route.fulfill({ json: { mode: 'imported', triples_imported: 7 } });
    });
    await dialog.locator('input[type="file"]').setInputFiles({ name: 'sales.ttl', mimeType: 'text/turtle', buffer: Buffer.from('@prefix : <urn:x#> .') });
    await expect(dialog.getByText('sales.ttl')).toBeVisible();
    const target = dialog.getByRole('textbox', { name: 'Target concept scheme' });
    expect(Math.round((await box(target)).height)).toBe(28);
    await target.click();
    await expect(page.getByRole('listbox')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.getByRole('listbox')).toHaveCount(0);
    await expect(dialog).toBeVisible();
    await target.click();
    await page.getByRole('option', { name: 'Finance Glossary' }).click();
    await expect(target).toHaveValue('Finance Glossary');
    // The strategy choices are radios named by their titles
    await expect(dialog.getByRole('radio', { name: /One scheme per file/ })).not.toBeChecked();
    await expect(dialog.getByRole('radio', { name: /^One scheme Merge/ })).toBeChecked();
    await dialog.getByRole('button', { name: 'Import 1 file(s)' }).click();
    await expect(dialog).toHaveCount(0);
    await expect(page.getByText('Imported 1 file(s).')).toBeVisible();
    expect(imported).toContain('/api/knowledge/collections/urn%3Ae2e%3Afinance/import');
    await expect(page).toHaveURL(/\/concepts\/define$/);
  });
});
