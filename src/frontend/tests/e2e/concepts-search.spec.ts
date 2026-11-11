/**
 * Wave 2 Task 13b: Search (/concepts/search) on the page kit, measured in a
 * real browser (ruling R10). The kit header and tabs; the Concepts tab's
 * search, concept and relations panes; the Knowledge Graph tab's three panes;
 * the Assign dialog and the UC asset lookup over it, both kit Dialogs.
 *
 * CAPTURE=before|after also saves images of the tabs and the dialogs to
 * .superpowers/sdd/2026-11-10-mantine-restyle-wave-2/task-13b-images/.
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test, type Locator, type Page } from '@playwright/test';
import { mockApi } from './fixtures/api';
import { DATA_FIXTURES } from './fixtures/data';
import { PERSONAS, type Persona } from './fixtures/personas';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const IMAGES = path.resolve(HERE, '../../../../.superpowers/sdd/2026-11-10-mantine-restyle-wave-2/task-13b-images');
const CAPTURE = process.env.CAPTURE;

const NAVY = 'rgb(31, 48, 102)';

// Review Focus 1: a 200-character concept label, and one with no break opportunity
const LONG_LABEL = `Customer ${'lifetime-revenue-and-retention-measure-'.repeat(6)}`.slice(0, 200);
const UNBROKEN = `urn:e2e:${'y'.repeat(192)}`;
// A SPARQL row much wider than the pane
const WIDE_VALUE = `urn:e2e:${'z'.repeat(600)}`;

const CONCEPTS = [
  { value: 'urn:e2e:widgets', label: 'Widgets', type: 'class' },
  { value: 'urn:e2e:long', label: LONG_LABEL, type: 'class' },
  { value: UNBROKEN, label: UNBROKEN, type: 'class' },
];

const SUBCLASS = 'http://www.w3.org/2000/01/rdf-schema#subClassOf';
const NEIGHBORS = [
  { direction: 'outgoing', predicate: SUBCLASS, display: 'urn:e2e:products', displayType: 'resource', stepIri: 'urn:e2e:products', stepIsResource: true },
  { direction: 'incoming', predicate: SUBCLASS, display: UNBROKEN, displayType: 'resource', stepIri: UNBROKEN, stepIsResource: true },
  { direction: 'outgoing', predicate: 'http://www.w3.org/2000/01/rdf-schema#comment', display: LONG_LABEL, displayType: 'literal', stepIri: null, stepIsResource: false },
];

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

async function setUp(page: Page, persona: Persona = PERSONAS.admin, route = '/concepts/search') {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.clock.setFixedTime(new Date('2026-11-09T12:00:00Z'));
  await mockApi(page, persona, {
    ...DATA_FIXTURES,
    '/api/semantic-models/concepts': (url: URL) => {
      const q = (url.searchParams.get('q') ?? '').toLowerCase();
      return CONCEPTS.filter((c) => c.label.toLowerCase().includes(q));
    },
    '/api/semantic-models/concepts/by-iri': (url: URL) => {
      const iri = url.searchParams.get('iri');
      return { concept: { iri, label: CONCEPTS.find((c) => c.value === iri)?.label ?? iri } };
    },
    '/api/semantic-models/neighbors': NEIGHBORS,
    '/api/semantic-links/by-iri': [{ id: 'l1', entity_id: 'p1', entity_type: 'data_product', iri: 'urn:e2e:widgets' }],
    '/api/data-products/p1': { id: 'p1', name: LONG_LABEL },
    '/api/semantic-models/prefix': (url: URL) => (url.searchParams.get('q') ? [{ value: UNBROKEN, type: 'resource' }] : []),
    [`/api/semantic-models/resources/${encodeURIComponent(UNBROKEN)}/description`]: {
      iri: UNBROKEN,
      triples: [{ predicate: 'http://www.w3.org/2000/01/rdf-schema#label', object: LONG_LABEL, objectType: 'literal' }],
    },
    '/api/semantic-models/query': [{ s: WIDE_VALUE }],
    '/api/catalogs': [{ id: 'main', name: 'main', hasChildren: true, children: [] }],
    '/api/catalogs/main/schemas': [{ id: 'main.sales', name: 'sales', hasChildren: true, children: [] }],
    '/api/catalogs/main/schemas/sales/objects': [
      { id: 'main.sales.orders', name: 'orders', type: 'table' },
      { id: `main.sales.${'q'.repeat(200)}`, name: 'q'.repeat(200), type: 'table' },
    ],
  });
  await page.goto(route);
  await expect(page.locator('main').getByRole('heading', { level: 1, name: 'Search Concepts' })).toBeVisible();
}

async function capture(page: Page, name: string) {
  if (!CAPTURE) return;
  await page.mouse.move(0, 0);
  await page.waitForTimeout(400);
  await page.screenshot({ path: path.join(IMAGES, `${name}-${CAPTURE}.png`), animations: 'disabled', caret: 'hide' });
}

const searchField = (page: Page) => page.locator('main').getByRole('textbox', { name: 'Type to search by name, label, or IRI...' });

async function selectConcept(page: Page, text: string, result: string) {
  await searchField(page).fill(text);
  await page.locator('main').getByText(result, { exact: true }).click();
  // The selection's text is searched (debounced) and written to ?query=; let
  // the URL settle, as the kit Dialog gives focus back only on the page it opened on
  await expect(page).toHaveURL(new RegExp(`query=${encodeURIComponent(result).replace(/%20/g, '\\+')}`));
}

test.describe('captures', () => {
  test('captures the tabs and the dialogs', async ({ page }) => {
    test.skip(!CAPTURE, 'only with CAPTURE=before|after');
    await setUp(page);
    await searchField(page).fill('e');
    await page.waitForTimeout(600);
    await capture(page, 'search-concepts-results');
    await selectConcept(page, 'Widg', 'Widgets - urn:e2e:widgets');
    await page.waitForTimeout(600);
    await capture(page, 'search-concept');
    await page.getByRole('button', { name: 'Assign to Concept' }).click();
    await page.waitForTimeout(400);
    await capture(page, 'search-assign-dialog');
    await page.keyboard.press('Escape');
    await page.goto(`/concepts/search?tab=kg&path=${encodeURIComponent(UNBROKEN)}`);
    await page.waitForTimeout(800);
    await capture(page, 'search-knowledge-graph');
  });
});

test.describe('concepts-search', () => {
  test('the kit header and tabs, at the kit sizes', async ({ page }) => {
    await setUp(page);
    const main = page.locator('main');
    const title = main.getByRole('heading', { level: 1, name: 'Search Concepts' });
    expect(await style(title, ['font-size', 'color'])).toEqual({ 'font-size': '16px', color: NAVY });
    const tab = main.getByRole('tab', { name: 'Concepts' });
    expect((await style(tab, ['font-size']))['font-size']).toBe('12px');
    await expect(main.getByRole('region', { name: 'Concept search' })).toBeVisible();
    const field = searchField(page);
    expect(Math.round((await field.boundingBox())!.height)).toBeLessThanOrEqual(28);
  });

  test('long result labels and concept names truncate with a title, and cause no horizontal page scroll', async ({ page }) => {
    await setUp(page);
    const main = page.locator('main');
    await searchField(page).fill('e');
    for (const c of CONCEPTS) {
      const result = main.getByRole('button', { name: `${c.label} - ${c.value}` });
      await expect(result).toBeVisible();
      await expect(result).toHaveAttribute('title', c.value);
    }
    const label = main.getByText(`${UNBROKEN} - ${UNBROKEN}`, { exact: true });
    expect(await style(label, ['text-overflow', 'white-space'])).toEqual({ 'text-overflow': 'ellipsis', 'white-space': 'nowrap' });
    expect(await noPageScroll(page)).toBe(true);

    // The selected concept: its pane title, its IRI, its attributes and chips
    await main.getByRole('button', { name: `${UNBROKEN} - ${UNBROKEN}` }).click();
    const concept = main.getByRole('region', { name: UNBROKEN });
    await expect(concept).toBeVisible();
    await expect(concept.getByRole('heading', { name: UNBROKEN })).toHaveAttribute('title', UNBROKEN);
    const relations = main.getByRole('region', { name: 'Concept relations' });
    const chip = relations.getByRole('button', { name: UNBROKEN });
    await expect(chip).toHaveAttribute('title', UNBROKEN);
    const linked = relations.getByRole('button', { name: new RegExp(`Data Product: ${LONG_LABEL.slice(0, 40)}`) });
    await expect(linked).toBeVisible();
    // Each chip stays inside its column
    const column = await relations.locator('h3').first().locator('..').boundingBox();
    expect((await chip.boundingBox())!.width).toBeLessThanOrEqual(column!.width);
    expect(await noPageScroll(page)).toBe(true);
  });

  test('the Knowledge Graph tab: a long path step truncates; a wide SPARQL row scrolls inside its pane', async ({ page }) => {
    await setUp(page, PERSONAS.admin, `/concepts/search?tab=kg&path=${encodeURIComponent(UNBROKEN)}`);
    const main = page.locator('main');
    const pathPane = main.getByRole('region', { name: 'Path Explorer' });
    const step = pathPane.getByRole('button', { name: UNBROKEN });
    await expect(step).toHaveAttribute('title', UNBROKEN);
    await expect(main.getByRole('region', { name: 'Prefix Search' }).getByRole('button', { name: 'Start path' })).toBeVisible();
    // The links: a long value truncates with its title, inside the pane
    const paneRight = async (loc: Locator) => { const b = (await loc.boundingBox())!; return b.x + b.width; };
    for (const text of [UNBROKEN, LONG_LABEL]) {
      const value = pathPane.locator(`span[title="${text}"]`).first();
      await expect(value).toBeVisible();
      expect(await style(value, ['text-overflow', 'white-space'])).toEqual({ 'text-overflow': 'ellipsis', 'white-space': 'nowrap' });
      expect(await paneRight(value)).toBeLessThanOrEqual(await paneRight(pathPane));
    }
    const prefixValue = main.getByRole('region', { name: 'Prefix Search' }).locator(`span[title="${UNBROKEN}"]`);
    expect(await paneRight(prefixValue)).toBeLessThanOrEqual(await paneRight(main.getByRole('region', { name: 'Prefix Search' })));
    expect(await noPageScroll(page)).toBe(true);

    const sparql = main.getByRole('region', { name: 'SPARQL' });
    await sparql.getByRole('button', { name: 'Run SPARQL' }).click();
    const row = sparql.locator('pre').first();
    await expect(row).toContainText('zzzz');
    // The row scrolls inside itself; the pane and the page keep their width
    expect(await row.evaluate((el) => el.scrollWidth > el.clientWidth)).toBe(true);
    const paneBox = (await sparql.boundingBox())!;
    expect((await row.boundingBox())!.width).toBeLessThanOrEqual(paneBox.width);
    expect(await noPageScroll(page)).toBe(true);

    // Examples is a Mantine Menu; its item fills the query
    await sparql.getByRole('button', { name: 'Examples' }).click();
    await page.getByRole('menuitem', { name: 'Top predicates by frequency' }).click();
    await expect(sparql.getByRole('textbox', { name: 'SPARQL' })).toHaveValue(/COUNT\(\*\)/);
  });

  test('Escape in the Assign dialog\'s Select closes only the Select', async ({ page }) => {
    await setUp(page);
    await selectConcept(page, 'Widg', 'Widgets - urn:e2e:widgets');
    const assign = page.getByRole('button', { name: 'Assign to Concept' });
    await assign.click();
    const dialog = page.getByRole('dialog', { name: 'Assign Object to Concept' });
    await expect(dialog).toBeVisible();
    await expect(dialog).toHaveClass(/mantine-Modal-content/);
    await expect.poll(() => focusInside(dialog)).toBe(true);
    await dialog.getByRole('textbox', { name: 'Entity Type' }).click();
    const listbox = page.getByRole('listbox');
    await expect(listbox.getByRole('option', { name: 'UC Table' })).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(listbox).toHaveCount(0);
    await expect(dialog).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(dialog).toHaveCount(0);
    await expect(assign).toBeFocused();
  });

  test('a reader sees no Assign', async ({ page }) => {
    await setUp(page, PERSONAS.consumer);
    await selectConcept(page, 'Widg', 'Widgets - urn:e2e:widgets');
    await expect(page.locator('main').getByRole('region', { name: 'Concept relations' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Assign to Concept' })).toHaveCount(0);
  });
});
