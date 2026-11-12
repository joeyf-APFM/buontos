/**
 * Wave 2 Task 15: concept detail (/concepts/browser/*) on the page kit,
 * measured in a real browser (ruling R10). The kit header and the pane stack
 * at the kit sizes; a 200-character label and an unbroken IRI truncating with
 * a title or wrapping, with no horizontal page scroll (Review Focus 1); the
 * not-found and load-error states keeping their actions, the error with
 * Retry (Review Focus 2); a long relation list scrolling inside its pane
 * under a header that stays put (Review Focus 5); the List / Graph switch and
 * the graph's navigation; Simple and Advanced. The dialogs are in
 * concept-detail-dialogs.spec.ts.
 *
 * CAPTURE=before|after also saves images of the page to
 * .superpowers/sdd/2026-11-10-mantine-restyle-wave-2/task-15-images/.
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test, type Locator, type Page } from '@playwright/test';
import { mockApi } from './fixtures/api';
import { DATA_FIXTURES } from './fixtures/data';
import { LONG_IRI, LONG_LABEL, MANY_RELATIONS, conceptDetailFixtures, type ConceptDetailOptions } from './fixtures/concept-detail';
import { PERSONAS, type Persona } from './fixtures/personas';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const IMAGES = path.resolve(HERE, '../../../../.superpowers/sdd/2026-11-10-mantine-restyle-wave-2/task-15-images');
const CAPTURE = process.env.CAPTURE;

const NAVY = 'rgb(31, 48, 102)';
const IRI = 'urn:e2e:concept:Customer';
const route = (iri = IRI) => `/concepts/browser/${encodeURIComponent(iri)}`;

const style = (loc: Locator, props: string[]) =>
  loc.evaluate((el, names) => {
    const cs = getComputedStyle(el);
    return Object.fromEntries(names.map((n) => [n, cs.getPropertyValue(n)]));
  }, props);

const noPageScroll = (page: Page) =>
  page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);

/** Whether `inner` ends inside `outer`, to the pixel, across and down. */
async function inside(inner: Locator, outer: Locator) {
  const i = (await inner.boundingBox())!;
  const o = (await outer.boundingBox())!;
  return i.x >= o.x - 1 && i.x + i.width <= o.x + o.width + 1 && i.y >= o.y - 1 && i.y + i.height <= o.y + o.height + 1;
}

interface SetUp extends ConceptDetailOptions {
  persona?: Persona;
  width?: number;
  iri?: string;
  extra?: Record<string, unknown>;
}

async function setUp(page: Page, { persona = PERSONAS.admin, width = 1280, iri = IRI, extra = {}, ...options }: SetUp = {}) {
  await page.setViewportSize({ width, height: 800 });
  await page.clock.setFixedTime(new Date('2026-11-09T12:00:00Z'));
  await mockApi(page, persona, { ...DATA_FIXTURES, ...conceptDetailFixtures(options), ...extra });
  await page.goto(route(iri));
}

async function capture(page: Page, name: string) {
  if (!CAPTURE) return;
  await page.mouse.move(0, 0);
  await page.waitForTimeout(400);
  await page.screenshot({ path: path.join(IMAGES, `${name}-${CAPTURE}.png`), animations: 'disabled', caret: 'hide', fullPage: true });
}

const main = (page: Page) => page.locator('main');
const heading = (page: Page, name: string | RegExp = 'Customer') => main(page).getByRole('heading', { level: 1, name });
// The outer, the kit Pane: a shared panel inside it is a region of the same name
const region = (page: Page, name: string) => main(page).getByRole('region', { name, exact: true }).first();

async function advanced(page: Page) {
  await page.getByRole('button', { name: /^Large View/ }).click();
  await expect(page.locator('html')).toHaveAttribute('data-mode', 'advanced');
}

test.describe('captures', () => {
  test('captures the page, narrow, advanced and the graph', async ({ page }) => {
    test.skip(!CAPTURE, 'only with CAPTURE=before|after');
    await setUp(page);
    await expect(page.getByText('urn:e2e:concept:Account')).toBeVisible();
    await capture(page, 'concept-detail');
    await advanced(page);
    await capture(page, 'concept-detail-advanced');
    await page.getByRole('tab', { name: 'Graph' }).click();
    await page.waitForTimeout(800);
    await capture(page, 'concept-detail-graph');
    await setUp(page, { width: 900, concept: { label: LONG_LABEL }, iri: LONG_IRI });
    await expect(page.getByText('urn:e2e:concept:Account')).toBeVisible();
    await capture(page, 'concept-detail-long-narrow');
  });
});

test.describe('concept-detail', () => {
  test('the kit header and the pane stack, at the kit sizes', async ({ page }) => {
    await setUp(page);
    const title = heading(page);
    await expect(title).toBeVisible();
    expect(await style(title, ['font-size', 'color'])).toEqual({ 'font-size': '16px', color: NAVY });

    // The header carries the page's actions
    const header = title.locator('..');
    for (const name of ['Back to Concepts', 'Request', 'Edit', 'Delete', 'Comments']) {
      const button = header.getByRole('button', { name, exact: true });
      await expect(button).toBeVisible();
      expect((await button.boundingBox())!.height).toBeLessThanOrEqual(28);
    }

    // One column of panes sharing 1px borders, no shadow, Summary first and Metadata last
    const names = ['Summary', 'Definition', 'Owners', 'Details', 'Hierarchy', 'Linked Entities', 'Version history', 'Relations', 'Metadata'];
    let previous: { x: number; y: number; width: number; height: number } | null = null;
    for (const name of names) {
      const pane = region(page, name);
      await expect(pane).toBeVisible();
      expect(await style(pane, ['border-left-width', 'box-shadow'])).toEqual({ 'border-left-width': '1px', 'box-shadow': 'none' });
      const box = (await pane.boundingBox())!;
      if (previous) {
        expect(Math.round(box.x)).toBe(Math.round(previous.x));
        expect(Math.round(box.width)).toBe(Math.round(previous.width));
        // Stacked, sharing the seam
        expect(Math.abs(box.y - (previous.y + previous.height))).toBeLessThan(1.5);
      }
      previous = box;
    }
    // Body text at 12px, in the display font for prose
    const definition = region(page, 'Definition').getByText(/A party that buys goods/);
    expect((await style(definition, ['font-size']))['font-size']).toBe('12px');
    expect((await style(definition, ['font-family']))['font-family']).not.toMatch(/mono/i);
    // The Turtle pane is Advanced only
    await expect(region(page, 'RDF (Turtle)')).toBeHidden();
    expect(await noPageScroll(page)).toBe(true);
  });

  test('every section keeps its controls: hierarchy chips, linked entities, relations and versions', async ({ page }) => {
    await setUp(page);
    // The hierarchy chips are buttons now, and open the concept
    const hierarchy = region(page, 'Hierarchy');
    await hierarchy.getByRole('button', { name: 'urn:e2e:concept:Party', exact: true }).focus();
    await page.keyboard.press('Enter');
    await expect(page).toHaveURL(route('urn:e2e:concept:Party'));
    await page.goBack();
    await expect(heading(page)).toBeVisible();

    const linked = region(page, 'Linked Entities');
    await expect(linked.getByRole('button', { name: 'Add', exact: true })).toBeVisible();
    await expect(linked.getByRole('button', { name: 'Remove linked entity' })).toHaveCount(2);
    // The section folds and unfolds
    const fold = linked.getByRole('button', { name: /^Linked Entities/ });
    await expect(fold).toHaveAttribute('aria-expanded', 'true');
    await fold.click();
    await expect(fold).toHaveAttribute('aria-expanded', 'false');
    await expect(linked.getByRole('button', { name: 'Sales orders' })).toBeHidden();
    await fold.click();
    await expect(linked.getByRole('button', { name: 'Sales orders' })).toBeVisible();

    // A previous version shows its definition
    const versions = region(page, 'Version history');
    await versions.getByRole('button', { name: /on 10\/1\/2026/ }).click();
    await expect(versions.getByText('A party that buys goods.')).toBeVisible();

    // The relations fold too, and their rows open the target
    const relations = region(page, 'Relations');
    const relFold = relations.getByRole('button', { name: 'Relations', exact: true });
    await relFold.click();
    await expect(relations.getByRole('tab', { name: 'Graph' })).toBeHidden();
    await relFold.click();
    await relations.getByRole('button', { name: 'urn:e2e:concept:Account' }).click();
    await expect(page).toHaveURL(route('urn:e2e:concept:Account'));
  });

  test('the graph view draws the neighbourhood inside its pane, and a node opens its concept', async ({ page }) => {
    await setUp(page);
    const relations = region(page, 'Relations');
    await relations.getByRole('tab', { name: 'Graph' }).click();
    await expect(relations.getByRole('tab', { name: 'Graph' })).toHaveAttribute('aria-selected', 'true');
    const graph = page.getByTestId('concept-neighborhood-graph');
    await expect(graph).toBeVisible();
    expect(await inside(graph, relations)).toBe(true);
    const parent = graph.locator('.react-flow__node', { hasText: 'Party' });
    await expect(parent).toBeVisible();
    await parent.click();
    await expect(page).toHaveURL(route('urn:e2e:concept:Party'));
  });

  test('a 200-character label and an unbroken IRI truncate with a title or wrap, with no horizontal page scroll', async ({ page }) => {
    for (const width of [1280, 900]) {
      await setUp(page, { width, iri: LONG_IRI, concept: { label: LONG_LABEL } });
      const title = heading(page, LONG_LABEL);
      await expect(title).toHaveAttribute('title', LONG_LABEL);
      expect(await style(title, ['text-overflow', 'white-space'])).toEqual({ 'text-overflow': 'ellipsis', 'white-space': 'nowrap' });
      // The header keeps its actions in the window
      const back = main(page).getByRole('button', { name: 'Back to Concepts' });
      expect((await back.boundingBox())!.x + (await back.boundingBox())!.width).toBeLessThanOrEqual(width);
      expect(await noPageScroll(page)).toBe(true);

      await advanced(page);
      // The IRI in the summary: one line, ellipsed, with its title
      const chip = main(page).getByTestId('concept-summary-iri').getByText(LONG_IRI, { exact: true });
      await expect(chip).toHaveAttribute('title', LONG_IRI);
      expect(await inside(chip, region(page, 'Summary'))).toBe(true);
      // The IRI in Details, in the mono font
      const details = region(page, 'Details');
      const iri = details.getByText(LONG_IRI, { exact: true });
      await expect(iri).toHaveAttribute('title', LONG_IRI);
      expect(await style(iri, ['font-family'])).toEqual({ 'font-family': expect.stringMatching(/mono/i) });
      expect(await inside(iri, details)).toBe(true);
      expect(await noPageScroll(page)).toBe(true);
      await page.getByRole('button', { name: 'Small View' }).click();
    }
  });

  test('a long relation list scrolls inside its pane, and the page header stays in place', async ({ page }) => {
    await setUp(page, { relations: MANY_RELATIONS });
    const relations = region(page, 'Relations');
    const list = relations.getByTestId('concept-relations-list');
    await expect(list.getByRole('button', { name: 'urn:e2e:concept:Related00' })).toBeVisible();
    expect(await list.evaluate((el) => el.scrollHeight > el.clientHeight)).toBe(true);
    expect((await style(list, ['overflow-y']))['overflow-y']).toBe('auto');
    expect(await inside(list, relations)).toBe(true);

    await relations.scrollIntoViewIfNeeded();
    const pageTop = await page.evaluate(() => document.scrollingElement!.scrollTop);
    const head = relations.getByRole('button', { name: 'Relations', exact: true });
    const headY = (await head.boundingBox())!.y;
    const titleY = (await heading(page).boundingBox())!.y;
    await list.hover();
    await page.mouse.wheel(0, 400);
    await expect.poll(() => list.evaluate((el) => el.scrollTop)).toBeGreaterThan(0);
    expect(await page.evaluate(() => document.scrollingElement!.scrollTop)).toBe(pageTop);
    expect((await head.boundingBox())!.y).toBe(headY);
    expect((await heading(page).boundingBox())!.y).toBe(titleY);
    await list.evaluate((el) => { el.scrollTop = el.scrollHeight; });
    await expect(list.getByRole('button', { name: 'urn:e2e:concept:Related79' })).toBeInViewport();
  });

  test('a failed load shows an Alert with Retry and Back, and Retry loads the concept', async ({ page }) => {
    let failing = true;
    await setUp(page);
    await page.route((url) => url.pathname === '/api/semantic-models/concepts/by-iri', async (r) => {
      if (failing) return r.fulfill({ status: 500, json: { detail: 'The graph store is down' } });
      return r.fulfill({ json: { concept: { iri: IRI, label: 'Customer', concept_type: 'class', status: 'draft', parent_concepts: [], child_concepts: [], synonyms: [], examples: [] } } });
    });
    await page.goto(route());
    const alert = main(page).getByRole('alert');
    await expect(alert).toBeVisible();
    await expect(alert).toContainText('The graph store is down');
    await expect(main(page).getByRole('button', { name: 'Back to Concepts' })).toBeVisible();
    failing = false;
    await main(page).getByRole('button', { name: 'Retry' }).click();
    await expect(heading(page)).toBeVisible();
    await expect(main(page).getByRole('alert')).toHaveCount(0);
  });

  test('a concept that is not there shows a notice with Back, which goes to Explore', async ({ page }) => {
    await setUp(page, { extra: { '/api/semantic-models/concepts/by-iri': [] } });
    await expect(main(page).getByText('Concept not found')).toBeVisible();
    await expect(main(page).getByRole('button', { name: 'Retry' })).toHaveCount(0);
    await main(page).getByRole('button', { name: 'Back to Concepts' }).click();
    await expect(page).toHaveURL(/\/concepts\/browser$/);
  });

  test('empty sections keep their actions', async ({ page }) => {
    await setUp(page, {
      relations: [],
      concept: { parent_concepts: [], child_concepts: [] },
      extra: { '/api/semantic-links/by-iri': [] },
    });
    await expect(region(page, 'Hierarchy').getByText('No broader or narrower concepts.')).toBeVisible();
    const linked = region(page, 'Linked Entities');
    await expect(linked.getByText('No entities linked to this concept.')).toBeVisible();
    await expect(linked.getByRole('button', { name: 'Add', exact: true })).toBeVisible();
    await expect(region(page, 'Relations').getByText(/No concept-to-concept relations yet/)).toBeVisible();
    await expect(region(page, 'Relations').getByRole('tab', { name: 'Graph' })).toBeVisible();
  });

  test('a reader sees the page without its write controls', async ({ page }) => {
    await setUp(page, { persona: PERSONAS.consumer });
    await expect(heading(page)).toBeVisible();
    for (const name of ['Request', 'Edit', 'Delete', 'Add', 'Assign Owner']) {
      await expect(main(page).getByRole('button', { name, exact: true })).toHaveCount(0);
    }
    await expect(main(page).getByRole('button', { name: 'Remove linked entity' })).toHaveCount(0);
    await expect(main(page).getByRole('button', { name: 'Comments' })).toBeVisible();
  });

  test('Advanced shows the ontology layer: the IRI, the type and the Turtle pane', async ({ page }) => {
    await setUp(page, {
      extra: { '/api/semantic-models/query': [{ p: 'http://www.w3.org/2000/01/rdf-schema#label', o: 'Customer' }] },
    });
    await expect(main(page).getByTestId('concept-summary-iri')).toBeHidden();
    await advanced(page);
    await expect(main(page).getByTestId('concept-summary-iri')).toBeVisible();
    const turtle = region(page, 'RDF (Turtle)');
    await expect(turtle).toBeVisible();
    await expect(turtle.getByText(/rdf-schema#label> "Customer" \./)).toBeVisible();
    await expect(turtle.getByRole('button', { name: 'Copy' })).toBeVisible();
    // Turtle sits directly above Metadata
    const t = (await turtle.boundingBox())!;
    const m = (await region(page, 'Metadata').boundingBox())!;
    expect(Math.abs(m.y - (t.y + t.height))).toBeLessThan(1.5);
  });
});
