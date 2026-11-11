/**
 * Wave 2 Task 13a: Explore (/concepts/browser) on the page kit, measured in a
 * real browser (ruling R10: jsdom ignores the cascade). The kit header with
 * the SPARQL toggle and the Create menu (a Mantine Menu), the filters pane,
 * and the List / Tree / Graph views in one pane. The concept editor
 * (ConceptEditorDialog) is a kit Dialog; its parent picker
 * (ConceptSelectDialog) stays Radix under ruling R38 and opens on top of it.
 *
 * CAPTURE=before|after also saves images of the page, its views and the
 * editor to .superpowers/sdd/2026-11-10-mantine-restyle-wave-2/task-13a-images/.
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test, type Locator, type Page } from '@playwright/test';
import { mockApi } from './fixtures/api';
import { DATA_FIXTURES } from './fixtures/data';
import { PERSONAS, type Persona } from './fixtures/personas';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const IMAGES = path.resolve(HERE, '../../../../.superpowers/sdd/2026-11-10-mantine-restyle-wave-2/task-13a-images');
const CAPTURE = process.env.CAPTURE;

const NAVY = 'rgb(31, 48, 102)';

// Review Focus 1: a 200-character concept label, and one with no break opportunity
const LONG_LABEL = `Customer ${'lifetime-revenue-and-retention-measure-'.repeat(6)}`.slice(0, 200);
const UNBROKEN_LABEL = 'y'.repeat(200);

const scheme = (iri: string, label: string, type: string) => ({
  iri,
  label,
  description: `About ${label}`,
  collection_type: type,
  scope_level: 'enterprise',
  source_type: 'custom',
  is_editable: true,
  status: 'active',
  concept_count: 2,
  child_collections: [],
  created_by: 'urn:user:rita@example.com',
});

const SCHEMES = [
  scheme('urn:glossary:finance', 'Finance Glossary', 'glossary'),
  scheme('urn:taxonomy:products', 'Product Taxonomy', 'taxonomy'),
  scheme('urn:taxonomy:regions', 'Region Taxonomy', 'taxonomy'),
  scheme('urn:ontology:core', 'Core Ontology', 'ontology'),
];

const concept = (iri: string, label: string, type: string, source: string, extra: Record<string, unknown> = {}) => ({
  iri,
  label,
  comment: `The ${label.slice(0, 30)} definition`,
  concept_type: type,
  source_context: source,
  parent_concepts: [],
  child_concepts: [],
  properties: [],
  tagged_assets: [],
  synonyms: [],
  examples: [],
  status: 'draft',
  ...extra,
});

const GROUPED = {
  products: [
    concept('urn:e2e:widgets', 'Widgets', 'concept', 'products', { child_concepts: ['urn:e2e:gadgets'] }),
    concept('urn:e2e:gadgets', 'Gadgets', 'concept', 'products', { parent_concepts: ['urn:e2e:widgets'], status: 'approved' }),
    concept('urn:e2e:long', LONG_LABEL, 'concept', 'products'),
  ],
  regions: [concept('urn:e2e:emea', 'EMEA', 'concept', 'regions')],
  core: [
    concept('urn:e2e:customer', 'Customer', 'class', 'core'),
    concept('urn:e2e:unbroken', UNBROKEN_LABEL, 'class', 'core'),
  ],
};

const style = (loc: Locator, props: string[]) =>
  loc.evaluate((el, names) => {
    const cs = getComputedStyle(el);
    return Object.fromEntries(names.map((n) => [n, cs.getPropertyValue(n)]));
  }, props);

const noPageScroll = (page: Page) =>
  page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);

/** Whether a click at the element's centre lands on it (nothing covers it). */
const onTop = (loc: Locator) =>
  loc.evaluate((el) => {
    const r = el.getBoundingClientRect();
    const hit = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
    return !!hit && (hit === el || el.contains(hit));
  });

const focusInside = (loc: Locator) => loc.evaluate((el) => el.contains(document.activeElement));

async function setUp(page: Page, persona: Persona = PERSONAS.admin, route = '/concepts/browser', extra: Record<string, unknown> = {}) {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.clock.setFixedTime(new Date('2026-11-09T12:00:00Z'));
  await mockApi(page, persona, {
    ...DATA_FIXTURES,
    '/api/knowledge/collections': { collections: SCHEMES },
    '/api/semantic-models/concepts-grouped': { grouped_concepts: GROUPED, system_sources: [] },
    '/api/semantic-models/stats': { stats: null },
    '/api/semantic-links/mapping-status': { statuses: {} },
    '/api/semantic-models/concepts': [
      { value: 'urn:e2e:widgets', label: 'Widgets', type: 'concept', source_context: 'products' },
      { value: 'urn:e2e:gadgets', label: 'Gadgets', type: 'concept', source_context: 'products' },
    ],
    ...extra,
  });
  await page.goto(route);
  await expect(page.locator('main').getByText('Widgets', { exact: true }).first()).toBeVisible();
}

async function capture(page: Page, name: string) {
  if (!CAPTURE) return;
  await page.mouse.move(0, 0);
  await page.waitForTimeout(400);
  await page.screenshot({ path: path.join(IMAGES, `${name}-${CAPTURE}.png`), animations: 'disabled', caret: 'hide' });
}

async function openCreate(page: Page, item: string) {
  await page.locator('main').getByRole('button', { name: 'Create' }).click();
  await page.getByRole('menuitem', { name: item, exact: true }).click();
}

test.describe('captures', () => {
  test('captures the views and the concept editor', async ({ page }) => {
    test.skip(!CAPTURE, 'only with CAPTURE=before|after');
    await setUp(page);
    await capture(page, 'explore-list');
    await page.getByText('Filter by Source').click();
    await capture(page, 'explore-filters');
    await page.getByRole('tab', { name: 'Tree' }).click();
    await capture(page, 'explore-tree');
    await page.getByRole('tab', { name: 'Graph' }).click();
    await page.waitForTimeout(800);
    await capture(page, 'explore-graph');
    await page.getByRole('tab', { name: 'List' }).click();
    await openCreate(page, 'New Concept');
    await expect(page.getByRole('dialog', { name: 'Create Entry' })).toBeVisible();
    await capture(page, 'explore-concept-editor');
  });
});

test.describe('explore', () => {
  test('the kit header with Create, the filters pane and the views pane', async ({ page }) => {
    await setUp(page);
    const main = page.locator('main');
    const title = main.getByRole('heading', { level: 1, name: 'Explore' });
    expect(await style(title, ['font-size', 'color'])).toEqual({ 'font-size': '16px', color: NAVY });
    const create = main.getByRole('button', { name: 'Create' });
    expect(Math.round((await create.boundingBox())!.height)).toBe(28);
    await expect(main.getByRole('region', { name: 'Filters' })).toBeVisible();
    const views = main.getByRole('region', { name: 'Concepts' });
    await expect(views.getByRole('tablist', { name: 'Explore views' })).toBeVisible();
    // The list's rows are 28px or more, at body size
    const row = views.getByTestId('concept-row-urn:e2e:widgets');
    expect((await style(row, ['font-size']))['font-size']).toBe('12px');
  });

  test('a 200-character concept label is truncated with a title in the list and tree, and causes no horizontal page scroll', async ({ page }) => {
    await setUp(page);
    const views = page.locator('main').getByRole('region', { name: 'Concepts' });
    for (const view of ['List', 'Tree']) {
      await page.getByRole('tab', { name: view }).click();
      for (const text of [LONG_LABEL, UNBROKEN_LABEL]) {
        const label = views.getByText(text, { exact: true });
        await expect(label).toBeVisible();
        await expect(label).toHaveAttribute('title', text);
        expect(await style(label, ['text-overflow', 'white-space'])).toEqual({ 'text-overflow': 'ellipsis', 'white-space': 'nowrap' });
        expect(await noPageScroll(page)).toBe(true);
      }
    }
    // The graph's chrome too
    await page.getByRole('tab', { name: 'Graph' }).click();
    await expect(views.getByRole('button', { name: 'Open Fullscreen' })).toBeVisible();
    expect(await noPageScroll(page)).toBe(true);
  });

  test('the Create menu is a Mantine Menu: the editor opens on top and keeps focus', async ({ page }) => {
    await setUp(page);
    await openCreate(page, 'New Concept');
    const dialog = page.getByRole('dialog', { name: 'Create Entry' });
    await expect(dialog).toBeVisible();
    await expect(dialog).toHaveClass(/mantine-Modal-content/);
    // Focus starts in the editor and stays there once the menu has gone
    await expect.poll(() => focusInside(dialog)).toBe(true);
    await page.waitForTimeout(400);
    expect(await focusInside(dialog)).toBe(true);
    // Tab stays inside the editor
    for (let i = 0; i < 12; i += 1) {
      await page.keyboard.press('Tab');
      expect(await focusInside(dialog)).toBe(true);
    }
    const label = dialog.getByRole('textbox', { name: 'Label' });
    expect(await onTop(label)).toBe(true);
    await label.fill('Doohickeys');
    await expect(label).toHaveValue('Doohickeys');
    await page.keyboard.press('Escape');
    await expect(dialog).toHaveCount(0);
    await expect(page.locator('main').getByRole('button', { name: 'Create' })).toBeFocused();
  });

  test('Escape in the editor\'s Scheme Select closes only the Select, and the typed label survives', async ({ page }) => {
    await setUp(page);
    await openCreate(page, 'New Concept');
    const dialog = page.getByRole('dialog', { name: 'Create Entry' });
    const label = dialog.getByRole('textbox', { name: 'Label' });
    await label.fill('Doohickeys');
    const schemeField = dialog.getByRole('textbox', { name: 'Scheme' });
    await schemeField.click();
    const listbox = page.getByRole('listbox');
    await expect(listbox.getByRole('option', { name: 'Region Taxonomy' })).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(listbox).toHaveCount(0);
    await expect(dialog).toBeVisible();
    await expect(label).toHaveValue('Doohickeys');
    // A second Escape closes the editor
    await page.keyboard.press('Escape');
    await expect(dialog).toHaveCount(0);
  });

  test('the Radix parent picker opens on top of the kit editor, takes clicks and typing, and Escape closes only it', async ({ page }) => {
    await setUp(page);
    await openCreate(page, 'New Concept');
    const dialog = page.getByRole('dialog', { name: 'Create Entry' });
    await dialog.getByRole('textbox', { name: 'Label' }).fill('Doohickeys');
    const addParent = dialog.getByRole('button', { name: 'Add Parent' });
    await addParent.click();
    const picker = page.getByRole('dialog', { name: 'Select Parent Concept' });
    await expect(picker).toBeVisible();
    const search = picker.getByPlaceholder('Search concepts in this scheme...');
    expect(await onTop(search)).toBe(true);
    await expect.poll(() => focusInside(picker)).toBe(true);
    await page.waitForTimeout(300);
    expect(await focusInside(picker)).toBe(true);
    await search.click();
    await search.pressSequentially('Wid');
    await expect(search).toHaveValue('Wid');
    // Escape closes only the picker; focus goes back to Add Parent
    await page.keyboard.press('Escape');
    await expect(picker).toHaveCount(0);
    await expect(dialog).toBeVisible();
    await expect(dialog.getByRole('textbox', { name: 'Label' })).toHaveValue('Doohickeys');
    await expect(addParent).toBeFocused();
    // Picking a concept (its row's Select; Widgets is listed first) adds it as a parent
    await addParent.click();
    await expect(picker).toBeVisible();
    await expect(picker.getByText('Widgets', { exact: true })).toBeVisible();
    const select = picker.getByRole('button', { name: 'Select' }).first();
    expect(await onTop(select)).toBe(true);
    await select.click();
    await expect(picker).toHaveCount(0);
    // The chip shows the IRI's local name (this IRI has no / or #, so all of it)
    await expect(dialog.getByTestId('parent-field').getByText('urn:e2e:widgets', { exact: true })).toBeVisible();
  });

  test('a scheme\'s actions in the filters: Rename opens the scheme editor, Delete asks in an alertdialog', async ({ page }) => {
    await setUp(page);
    const filters = page.locator('main').getByRole('region', { name: 'Filters' });
    // Open by default; the toggle folds the filters away and back
    const toggle = filters.getByRole('button', { name: /Filter by Source/ });
    await expect(toggle).toHaveAttribute('aria-expanded', 'true');
    await toggle.click();
    await expect(toggle).toHaveAttribute('aria-expanded', 'false');
    await expect(filters.getByRole('textbox', { name: 'Search schemes...' })).toBeHidden();
    await toggle.click();
    await expect(toggle).toHaveAttribute('aria-expanded', 'true');
    const actions = filters.getByRole('button', { name: 'Actions for Product Taxonomy' });
    await actions.click();
    await page.getByRole('menuitem', { name: 'Delete' }).click();
    const confirm = page.getByRole('alertdialog', { name: 'Delete Scheme' });
    await expect(confirm).toBeVisible();
    await confirm.getByRole('button', { name: 'Cancel' }).click();
    await expect(confirm).toHaveCount(0);
    await actions.click();
    await page.getByRole('menuitem', { name: 'Rename' }).click();
    const editor = page.getByRole('dialog', { name: 'Edit Scheme' });
    await expect(editor.getByRole('textbox', { name: 'Name' })).toHaveValue('Product Taxonomy');
  });

  test('the graph\'s fullscreen view is a kit Dialog; Escape closes it and focus goes back', async ({ page }) => {
    await setUp(page);
    await page.getByRole('tab', { name: 'Graph' }).click();
    const open = page.locator('main').getByRole('button', { name: 'Open Fullscreen' });
    await open.click();
    const dialog = page.getByRole('dialog', { name: 'View Graph' });
    await expect(dialog).toBeVisible();
    await expect(dialog).toHaveClass(/mantine-Modal-content/);
    // It takes most of the window (1280px wide here)
    expect((await dialog.boundingBox())!.width).toBeGreaterThan(1100);
    await dialog.getByRole('textbox', { name: 'Layout' }).click();
    await expect(page.getByRole('listbox')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.getByRole('listbox')).toHaveCount(0);
    await expect(dialog).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(dialog).toHaveCount(0);
    await expect(open).toBeFocused();
  });

  test('a reader sees no write controls', async ({ page }) => {
    await setUp(page, PERSONAS.consumer);
    const main = page.locator('main');
    await expect(main.getByRole('button', { name: 'Create' })).toHaveCount(0);
    await expect(main.getByRole('button', { name: 'Edit' })).toHaveCount(0);
    await expect(main.getByRole('checkbox', { name: 'Select' })).toHaveCount(0);
    // The filters are open, with their checkboxes but no scheme actions
    await expect(main.getByRole('checkbox', { name: /^Product Taxonomy/ })).toBeVisible();
    await expect(main.getByRole('button', { name: /^Actions for / })).toHaveCount(0);
  });
});
