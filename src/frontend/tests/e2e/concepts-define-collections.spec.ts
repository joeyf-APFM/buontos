/**
 * Wave 2 Task 12a: the Concepts layout, Define (/concepts/define) and
 * Collections (/concepts/collections) on the page kit, measured in a real
 * browser (ruling R10: jsdom ignores the cascade). The layout keeps the
 * shell's padding and draws the Simple/Advanced switch above each page;
 * Define and Collections draw the kit header and panes inside it. The scheme
 * editor (CollectionEditorDialog) is a kit Dialog, for both Define's Author
 * card and Collections' Create and Edit.
 *
 * CAPTURE=before|after also saves images of the pages and the editor to
 * .superpowers/sdd/2026-11-10-mantine-restyle-wave-2/task-12a-images/.
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test, type Locator, type Page } from '@playwright/test';
import { mockApi } from './fixtures/api';
import { DATA_FIXTURES } from './fixtures/data';
import { PERSONAS } from './fixtures/personas';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const IMAGES = path.resolve(HERE, '../../../../.superpowers/sdd/2026-11-10-mantine-restyle-wave-2/task-12a-images');
const CAPTURE = process.env.CAPTURE;

const NAVY = 'rgb(31, 48, 102)';

// Review Focus 1: a 200-character scheme name, and one with no break opportunity
const LONG_NAME = `Enterprise ${'finance-and-risk-glossary-terms-'.repeat(7)}`.slice(0, 200);
const UNBROKEN_NAME = 'x'.repeat(200);

const scheme = (iri: string, label: string, extra: Record<string, unknown> = {}) => ({
  iri,
  label,
  description: `About ${label.slice(0, 20)}`,
  collection_type: 'glossary',
  scope_level: 'enterprise',
  source_type: 'custom',
  is_editable: true,
  status: 'active',
  concept_count: 3,
  child_collections: [],
  created_by: 'urn:user:rita@example.com',
  ...extra,
});

const SCHEMES = [
  scheme('urn:e2e:finance', 'Finance Glossary'),
  scheme('urn:e2e:products', 'Product Taxonomy', { collection_type: 'taxonomy', scope_level: 'domain' }),
  scheme('urn:e2e:long', LONG_NAME),
  scheme('urn:e2e:unbroken', UNBROKEN_NAME, { collection_type: 'ontology' }),
];

const run = (id: string, status: string, message: string) => ({
  run_id: id,
  status,
  progress_message: message,
  created_at: '2026-11-09T11:00:00Z',
  step_count: 4,
});
const RUNS = [
  run('run-1', 'completed', '156 draft terms from gold.sales'),
  run('run-2', 'running', `Extracting classes from ${'gold.finance.ledger_entries_'.repeat(8)}`.slice(0, 200)),
];

const style = (loc: Locator, props: string[]) =>
  loc.evaluate((el, names) => {
    const cs = getComputedStyle(el);
    return Object.fromEntries(names.map((n) => [n, cs.getPropertyValue(n)]));
  }, props);

const box = async (loc: Locator) => (await loc.boundingBox())!;

const noPageScroll = (page: Page) =>
  page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);

async function setUp(page: Page, route: string, extra: Record<string, unknown> = {}) {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.clock.setFixedTime(new Date('2026-11-09T12:00:00Z'));
  await mockApi(page, PERSONAS.admin, {
    ...DATA_FIXTURES,
    '/api/knowledge/collections': { collections: SCHEMES },
    '/api/ontology/runs': { runs: RUNS },
    ...extra,
  });
  await page.goto(route);
}

async function setUpCollections(page: Page) {
  await setUp(page, '/concepts/collections');
  await expect(page.locator('main').getByText('Finance Glossary', { exact: true })).toBeVisible();
}

async function setUpDefine(page: Page) {
  await setUp(page, '/concepts/define');
  await expect(page.locator('main').getByText('156 draft terms from gold.sales')).toBeVisible();
}

async function capture(page: Page, name: string, target?: Locator) {
  if (!CAPTURE) return;
  await page.mouse.move(0, 0);
  await page.waitForTimeout(400);
  const file = path.join(IMAGES, `${name}-${CAPTURE}.png`);
  const options = { path: file, animations: 'disabled', caret: 'hide' } as const;
  if (target) await target.screenshot(options);
  else await page.screenshot(options);
}

test.describe('captures', () => {
  test('captures the pages and the scheme editor', async ({ page }) => {
    test.skip(!CAPTURE, 'only with CAPTURE=before|after');
    await setUpDefine(page);
    await capture(page, 'define');
    await page.getByRole('button', { name: 'New Concept Scheme' }).click();
    const author = page.getByRole('dialog', { name: 'Create Scheme' });
    await expect(author).toBeVisible();
    await capture(page, 'define-author-dialog');

    await setUpCollections(page);
    await capture(page, 'collections');
    await page.locator('main').getByText('Finance Glossary', { exact: true }).click();
    await capture(page, 'collections-selected');
    await page.locator('main').getByRole('button', { name: 'Create Scheme' }).click();
    const dialog = page.getByRole('dialog', { name: 'Create Scheme' });
    await expect(dialog).toBeVisible();
    await capture(page, 'collections-create-dialog');
  });
});

test.describe('the Concepts layout', () => {
  test('keeps the shell padding and puts the mode switch above the page, ruled off', async ({ page }) => {
    await setUpDefine(page);
    const main = page.locator('main');
    const content = main.locator('[data-page-content]');
    expect(parseFloat((await style(content, ['padding-left']))['padding-left'])).toBeGreaterThan(0);
    await expect(main.getByRole('navigation', { name: 'Breadcrumb' })).toHaveCount(1);
    const toggle = main.getByRole('group', { name: 'View mode' });
    const small = toggle.getByRole('button', { name: 'Small View' });
    expect(await style(small, ['height', 'font-size'])).toEqual({ height: '26px', 'font-size': '12px' });
    expect((await style(toggle, ['height'])).height).toBe('28px');
    await expect(small).toHaveAttribute('aria-pressed', 'true');
    const bar = toggle.locator('xpath=..');
    expect((await style(bar, ['border-bottom-style']))['border-bottom-style']).toBe('solid');
    // The page's header comes under the switch's row
    const title = main.getByRole('heading', { level: 1, name: 'Define' });
    expect((await box(title)).y).toBeGreaterThan((await box(toggle)).y + (await box(toggle)).height);
  });
});

test.describe('define', () => {
  test('the kit header, the build legend and the path cards in panes, the runs in their pane', async ({ page }) => {
    await setUpDefine(page);
    const main = page.locator('main');
    const title = main.getByRole('heading', { level: 1, name: 'Define' });
    expect(await style(title, ['font-size', 'color'])).toEqual({ 'font-size': '16px', color: NAVY });
    await expect(main.getByRole('region', { name: 'What you can build' })).toBeVisible();
    await expect(main.getByRole('region', { name: 'Start with…' })).toBeVisible();
    const runs = main.getByRole('region', { name: 'In progress' });
    await expect(runs.getByRole('button', { name: 'Review' })).toHaveCount(2);
    // A path card's button fills its card, at the kit's control height
    const cta = main.getByRole('button', { name: 'New Concept Scheme' });
    expect(Math.round((await box(cta)).height)).toBe(28);
    // An info mark opens its tip from the keyboard too
    await main.getByTestId('rung-vocab-glossary').focus();
    await expect(page.getByRole('tooltip')).toContainText('skos:Concept');
  });

  test('a 200-character run message is truncated with a title and causes no horizontal page scroll', async ({ page }) => {
    await setUpDefine(page);
    const message = page.locator('main').getByText(RUNS[1].progress_message, { exact: true });
    await expect(message).toBeVisible();
    await expect(message).toHaveAttribute('title', RUNS[1].progress_message);
    expect(await style(message, ['text-overflow', 'white-space'])).toEqual({ 'text-overflow': 'ellipsis', 'white-space': 'nowrap' });
    expect(await noPageScroll(page)).toBe(true);
  });
});

test.describe('collections', () => {
  test('the kit header with Create Scheme, the table in a flush pane, details beside it', async ({ page }) => {
    await setUpCollections(page);
    const main = page.locator('main');
    const title = main.getByRole('heading', { level: 1, name: 'Schemes' });
    expect(await style(title, ['font-size', 'color'])).toEqual({ 'font-size': '16px', color: NAVY });
    const list = main.getByRole('region', { name: 'Scheme list' });
    await expect(list).toBeVisible();
    await list.getByText('Finance Glossary', { exact: true }).click();
    const details = main.getByRole('region', { name: 'Finance Glossary' });
    await expect(details).toBeVisible();
    // Side by side, sharing a border
    expect(Math.round((await box(details)).x)).toBeGreaterThan(Math.round((await box(list)).x));
    expect(Math.round((await box(details)).y)).toBe(Math.round((await box(list)).y));
    await details.getByRole('button', { name: 'Close' }).click();
    await expect(details).toHaveCount(0);

    // A row's actions: a Mantine Menu; Edit opens the editor, and closing it
    // gives focus back to the row's actions button
    const actions = list.getByRole('button', { name: 'Actions for Product Taxonomy' });
    await actions.click();
    const menu = page.getByRole('menu');
    await expect(menu.getByRole('menuitem')).toHaveText(['Edit', 'Export as Turtle', 'Export as RDF/XML', 'Delete']);
    await menu.getByRole('menuitem', { name: 'Edit' }).click();
    const editor = page.getByRole('dialog', { name: 'Edit Scheme' });
    await expect(editor.getByRole('textbox', { name: 'Name' })).toHaveValue('Product Taxonomy');
    await expect(editor.getByRole('textbox', { name: 'Scope' })).toHaveValue('Domain');
    await editor.getByRole('button', { name: 'Cancel' }).click();
    await expect(editor).toHaveCount(0);
    await expect(actions).toBeFocused();
  });

  test('a 200-character scheme name wraps in the table, is truncated with a title in its details, and causes no horizontal page scroll', async ({ page }) => {
    await setUpCollections(page);
    const list = page.getByRole('region', { name: 'Scheme list' });
    for (const text of [LONG_NAME, UNBROKEN_NAME]) {
      const name = list.getByText(text, { exact: true });
      await expect(name).toBeVisible();
      expect((await style(name, ['white-space']))['white-space']).toBe('normal');
      expect(await noPageScroll(page)).toBe(true);
    }
    await list.getByText(UNBROKEN_NAME, { exact: true }).click();
    const heading = page.locator('main').getByRole('heading', { level: 2, name: UNBROKEN_NAME });
    await expect(heading).toHaveAttribute('title', UNBROKEN_NAME);
    expect(await style(heading, ['text-overflow', 'white-space'])).toEqual({ 'text-overflow': 'ellipsis', 'white-space': 'nowrap' });
    expect(await noPageScroll(page)).toBe(true);
  });

  test('Escape in a Select inside the scheme editor closes only the Select, and the typed name survives', async ({ page }) => {
    await setUpCollections(page);
    const create = page.locator('main').getByRole('button', { name: 'Create Scheme' });
    await create.click();
    const dialog = page.getByRole('dialog', { name: 'Create Scheme' });
    await expect(dialog).toBeVisible();
    await expect(dialog).toHaveClass(/mantine-Modal-content/);
    const name = dialog.getByRole('textbox', { name: 'Name' });
    await name.fill('Risk Glossary');
    for (const field of ['Type', 'Scope', 'Parent Scheme']) {
      await dialog.getByRole('textbox', { name: field }).click();
      await expect(page.getByRole('listbox')).toBeVisible();
      await page.keyboard.press('Escape');
      await expect(page.getByRole('listbox')).toHaveCount(0);
      await expect(dialog).toBeVisible();
      await expect(name).toHaveValue('Risk Glossary');
    }
    // The Parent list offers the editable schemes, grouped by type
    await dialog.getByRole('textbox', { name: 'Parent Scheme' }).click();
    const listbox = page.getByRole('listbox');
    await expect(listbox.getByRole('option', { name: 'Finance Glossary' })).toBeVisible();
    await expect(listbox.getByText('Taxonomies', { exact: true })).toBeVisible();
    await page.keyboard.press('Escape');
    // Escape again closes the editor, and focus goes back to Create Scheme
    await page.keyboard.press('Escape');
    await expect(dialog).toHaveCount(0);
    await expect(create).toBeFocused();
  });

  test('saving a new scheme posts it, closes the editor and reloads the list', async ({ page }) => {
    await setUpCollections(page);
    const posted: unknown[] = [];
    await page.route('**/api/knowledge/collections', async (route) => {
      if (route.request().method() !== 'POST') return route.fallback();
      posted.push(route.request().postDataJSON());
      return route.fulfill({ json: scheme('urn:e2e:risk', 'Risk Glossary') });
    });
    await page.locator('main').getByRole('button', { name: 'Create Scheme' }).click();
    const dialog = page.getByRole('dialog', { name: 'Create Scheme' });
    await dialog.getByRole('textbox', { name: 'Name' }).fill('Risk Glossary');
    await dialog.getByRole('textbox', { name: 'Type' }).click();
    await page.getByRole('option', { name: 'Taxonomy' }).click();
    await dialog.getByRole('button', { name: 'Create' }).click();
    await expect(dialog).toHaveCount(0);
    expect(posted).toEqual([
      expect.objectContaining({ label: 'Risk Glossary', collection_type: 'taxonomy', scope_level: 'enterprise', is_editable: true }),
    ]);
  });
});

test.describe('explore', () => {
  // Explore (Task 13) keeps its Radix Create menu for now. Closing, the menu
  // gives focus back to its Create button, after the editor has opened, as it
  // did with the Radix editor before (the same at BASE). Task 13's move to a
  // Mantine Menu leaves focus in the editor.
  test('New Concept Scheme from the Create menu opens the kit editor on top, and it takes typing', async ({ page }) => {
    await setUp(page, '/concepts/browser');
    await page.locator('main').getByRole('button', { name: 'Create' }).click();
    await page.getByRole('menuitem', { name: 'New Concept Scheme' }).click();
    const dialog = page.getByRole('dialog', { name: 'Create Scheme' });
    await expect(dialog).toBeVisible();
    await expect(dialog).toHaveClass(/mantine-Modal-content/);
    const name = dialog.getByRole('textbox', { name: 'Name' });
    // On top: the field is what a click at its centre hits
    const hit = await name.evaluate((el) => {
      const r = el.getBoundingClientRect();
      return document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2) === el;
    });
    expect(hit).toBe(true);
    await name.click();
    await name.pressSequentially('Ops');
    await expect(name).toHaveValue('Ops');
    await page.keyboard.press('Escape');
    await expect(dialog).toHaveCount(0);
  });

  test('the concept editor\'s New Concept Scheme swaps the Radix editor for the kit one, on top and taking typing', async ({ page }) => {
    // No schemes: the concept editor offers to create one
    await setUp(page, '/concepts/browser', { '/api/knowledge/collections': { collections: [] } });
    await page.locator('main').getByRole('button', { name: 'Create' }).click();
    await page.getByRole('menuitem').first().click();
    const notice = page.getByTestId('no-scheme-notice');
    await expect(notice).toBeVisible();
    await notice.getByRole('button', { name: 'New Concept Scheme' }).click();
    const dialog = page.getByRole('dialog', { name: 'Create Scheme' });
    await expect(dialog).toBeVisible();
    await expect(notice).toHaveCount(0);
    // Only the kit editor is left, and it takes clicks and typing
    await expect(page.getByRole('dialog')).toHaveCount(1);
    const name = dialog.getByRole('textbox', { name: 'Name' });
    await name.click();
    await name.pressSequentially('Ops');
    await expect(name).toHaveValue('Ops');
    await expect(dialog).toBeVisible();
  });
});
