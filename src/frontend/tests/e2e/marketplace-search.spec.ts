/**
 * Wave 2 Task 16: Marketplace (/marketplace) and Search (/search/llm,
 * /search/index) on the page kit, measured in a real browser (ruling R10).
 *
 * - Marketplace: the kit header and filter bar; long product names and
 *   descriptions in every view mode (domain list or graph, 1 to 4 tiles per
 *   row); each mode keeps its actions and persists across a reload; the
 *   empty list and a failed load with Retry.
 * - Ask Ontos: the disabled state, a long message and session title, and the
 *   chat scroll (about 40 messages scroll inside the pane, the composer stays
 *   in view and the page header stays in place).
 * - Index search: results, no results, and a failed search with Retry.
 *
 * CAPTURE=before|after also saves images to
 * .superpowers/sdd/2026-11-10-mantine-restyle-wave-2/task-16-images/.
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test, type Locator, type Page } from '@playwright/test';
import { mockApi } from './fixtures/api';
import { DATA_FIXTURES } from './fixtures/data';
import { PERSONAS, type Persona } from './fixtures/personas';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const IMAGES = path.resolve(HERE, '../../../../.superpowers/sdd/2026-11-10-mantine-restyle-wave-2/task-16-images');
const CAPTURE = process.env.CAPTURE;

const NAVY = 'rgb(31, 48, 102)';
const UPDATED = '2026-11-02T15:30:00Z';

// Review Focus 1: a 200-character name and description, and one with no break opportunity
const LONG_NAME = `Customer ${'lifetime-revenue-and-retention-measure '.repeat(6)}`.slice(0, 200);
const UNBROKEN = `orders_${'y'.repeat(193)}`;
const LONG_DESCRIPTION = `${'Every order line with its customer, channel and fulfilment status '.repeat(4)}`.slice(0, 200);

const product = (id: string, name: string, purpose: string, domain = 'e2e-domain-sales') => ({
  id, name, status: 'active', domain, domain_ids: [domain], publication_scope: 'organization',
  description: { purpose }, team: { name: 'Sales Analytics', members: [] }, version: '1.0.0', updated_at: UPDATED,
});

const PRODUCTS = [
  product('e2e-mp-1', 'Sales orders', 'Orders for reporting'),
  product('e2e-mp-2', LONG_NAME, LONG_DESCRIPTION),
  product('e2e-mp-3', UNBROKEN, 'x'.repeat(200)),
];

// Each card's rating and quality badges (the router's default [] has no average to show)
const BADGES = Object.fromEntries(PRODUCTS.flatMap((p) => [
  [`/api/entities/data_product/${p.id}/ratings`, {
    entity_type: 'data_product', entity_id: p.id, average_rating: 4, total_ratings: 2,
    distribution: { 1: 0, 2: 0, 3: 0, 4: 2, 5: 0 }, user_current_rating: null,
  }],
  [`/api/data-products/${p.id}/quality-summary`, { overall_score_percent: 92, items_count: 3, by_dimension: {} }],
]));

const DOMAINS = [
  { id: 'e2e-domain-sales', name: 'Sales', description: 'Everything we sell', parent_id: null, children_count: 1 },
  { id: 'e2e-domain-orders', name: 'Orders', description: 'Order lines', parent_id: 'e2e-domain-sales', children_count: 0 },
];

const DOMAIN_DETAIL = {
  ...DOMAINS[0],
  parent_info: null,
  children_info: [{ id: 'e2e-domain-orders', name: 'Orders' }],
};

const msg = (i: number, content: string) => ({
  id: `m${i}`, role: i % 2 === 0 ? 'user' : 'assistant', content, timestamp: '2026-11-09T11:00:00Z',
});
// About 40 messages, the first a 200-character question with no break opportunity
const LONG_MESSAGE = `${'q'.repeat(200)}`;
const MESSAGES = Array.from({ length: 40 }, (_, i) =>
  msg(i, i === 0 ? LONG_MESSAGE : i % 2 === 0 ? `Question ${i}: which products hold order data?` : `Answer ${i}: **Sales orders** holds them.\n\n- one\n- two`));
const LONG_TITLE = `Which data products hold ${'customer-order-history '.repeat(8)}`.slice(0, 200);
const SESSIONS = [
  { id: 'e2e-session-1', title: LONG_TITLE, message_count: 40, created_at: UPDATED, updated_at: UPDATED },
  { id: 'e2e-session-2', title: 'Costs', message_count: 2, created_at: UPDATED, updated_at: UPDATED },
];

const INDEX_RESULTS = [
  { id: 'r1', type: 'data-product', title: 'Sales orders', description: 'Orders for reporting', link: '/data-products/e2e-product-1', feature_id: 'data-products' },
  { id: 'r2', type: 'glossary-term', title: LONG_NAME, description: LONG_DESCRIPTION, link: '/concepts/browser/e2e-concept-1' },
];

const style = (loc: Locator, props: string[]) =>
  loc.evaluate((el, names) => {
    const cs = getComputedStyle(el);
    return Object.fromEntries(names.map((n) => [n, cs.getPropertyValue(n)]));
  }, props);

const noPageScroll = (page: Page) =>
  page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);

/** The element's content fits its box: nothing spills out sideways. */
const fitsWidth = (loc: Locator) => loc.evaluate((el) => el.scrollWidth <= el.clientWidth + 1);

const llmEnabled = {
  '/api/llm-search/status': { enabled: true, endpoint: 'e2e-endpoint', model_name: 'e2e-model', disclaimer: 'AI may be wrong.' },
  '/api/llm-search/sessions': SESSIONS,
  '/api/llm-search/sessions/e2e-session-1': { id: 'e2e-session-1', user_id: 'u', title: LONG_TITLE, messages: MESSAGES, created_at: UPDATED, updated_at: UPDATED },
};

/** Registered after the fixtures, so it answers first (Playwright tries the latest route first). */
let failing: { pathname: string; healed: boolean } | null = null;

async function setUp(page: Page, route: string, extra: Record<string, unknown> = {}, persona: Persona = PERSONAS.admin) {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.clock.setFixedTime(new Date('2026-11-09T12:00:00Z'));
  await mockApi(page, persona, {
    ...DATA_FIXTURES,
    ...BADGES,
    '/api/data-products/published': PRODUCTS,
    '/api/data-domains': DOMAINS,
    '/api/data-domains/e2e-domain-sales': DOMAIN_DETAIL,
    '/api/data-products/my-subscriptions': [PRODUCTS[0]],
    '/api/search': (url: URL) => {
      const q = (url.searchParams.get('search_term') ?? '').toLowerCase();
      return q === 'nothing' ? [] : INDEX_RESULTS;
    },
    ...extra,
  });
  if (failing) {
    const f = failing;
    await page.route((url) => url.pathname === f.pathname, (r) =>
      f.healed ? r.fallback() : r.fulfill({ status: 500, json: { detail: 'The backend is down' } }));
  }
  await page.goto(route);
}

/** Answers `pathname` with a 500 until `heal()` is called (from the next setUp, or now if a page is given). */
async function failUntilHealed(pathname: string, page?: Page) {
  const f = { pathname, healed: false };
  failing = f;
  if (page) {
    await page.route((url) => url.pathname === pathname, (r) =>
      f.healed ? r.fallback() : r.fulfill({ status: 500, json: { detail: 'The backend is down' } }));
  }
  return () => { f.healed = true; };
}

test.afterEach(() => { failing = null; });

async function capture(page: Page, name: string) {
  if (!CAPTURE) return;
  await page.mouse.move(0, 0);
  await page.waitForTimeout(500);
  await page.screenshot({ path: path.join(IMAGES, `${name}-${CAPTURE}.png`), animations: 'disabled', caret: 'hide' });
}

const consent = (page: Page) =>
  page.addInitScript(() => {
    localStorage.setItem('llm_consent_state', JSON.stringify({ accepted: true, timestamp: '2026-11-09T11:00:00Z', config_version: 'e2e-endpoint' }));
  });

test.describe('captures', () => {
  test('captures the pages', async ({ page }) => {
    test.skip(!CAPTURE, 'only with CAPTURE=before|after');
    await setUp(page, '/marketplace');
    await expect(page.locator('main').getByText('Sales orders', { exact: true })).toBeVisible();
    await capture(page, 'marketplace-list');
    await page.locator('main').getByRole('button', { name: 'Graph' }).click();
    await page.waitForTimeout(800);
    await capture(page, 'marketplace-graph');
    await page.locator('main').getByRole('button', { name: 'List' }).click();

    await setUp(page, '/search/llm');
    await page.waitForTimeout(500);
    await capture(page, 'search-llm-disabled');

    await consent(page);
    await setUp(page, '/search/llm', llmEnabled);
    await page.waitForTimeout(500);
    await capture(page, 'search-llm-welcome');
    await page.locator('main').getByRole('button', { name: 'History' }).click();
    await page.waitForTimeout(300);
    await capture(page, 'search-llm-history');
    await page.getByText(LONG_TITLE, { exact: true }).click();
    await page.waitForTimeout(1200);
    await capture(page, 'search-llm-session');

    await setUp(page, '/search/index?query=sales');
    await page.waitForTimeout(1000);
    await capture(page, 'search-index');
  });
});

test.describe('marketplace', () => {
  test('the kit header and filter bar, at the kit sizes', async ({ page }) => {
    await setUp(page, '/marketplace');
    const main = page.locator('main');
    const title = main.getByRole('heading', { level: 1, name: 'Hello, E2E' });
    expect(await style(title, ['font-size', 'color'])).toEqual({ 'font-size': '16px', color: NAVY });
    for (const field of [
      main.getByRole('searchbox', { name: 'What can we help you find today?' }),
      main.getByRole('textbox', { name: 'Publication scope' }),
      main.getByRole('textbox', { name: 'Tiles per row' }),
    ]) {
      await expect(field).toBeVisible();
      expect(Math.round((await field.boundingBox())!.height)).toBeLessThanOrEqual(28);
    }
    await expect(main.getByRole('region', { name: 'Browse Data Domains' })).toBeVisible();
    await expect(main.getByRole('region', { name: 'Data Products' })).toBeVisible();
    // The domain chip's preview opens on hover, as a Mantine HoverCard
    await main.getByRole('region', { name: 'Browse Data Domains' }).getByRole('button', { name: 'Orders', exact: true }).hover();
    const card = page.locator('.mantine-HoverCard-dropdown');
    await expect(card).toBeVisible();
    await expect(card).toContainText('Parent: Sales');
  });

  test('long names and descriptions truncate with a title in every view mode, with no page scroll', async ({ page }) => {
    await setUp(page, '/marketplace');
    const main = page.locator('main');
    const products = main.getByRole('region', { name: 'Data Products' });
    await expect(products.getByRole('button', { name: 'Sales orders', exact: true })).toBeVisible();
    for (const mode of ['List', 'Graph']) {
      await main.getByRole('button', { name: mode }).click();
      for (const tiles of ['1 per row', '2 per row', '3 per row', '4 per row']) {
        await main.getByRole('textbox', { name: 'Tiles per row' }).click();
        await page.getByRole('option', { name: tiles }).click();
        for (const name of [LONG_NAME, UNBROKEN]) {
          const title = products.getByRole('button', { name, exact: true });
          await expect(title).toHaveAttribute('title', name);
          const card = products.getByRole('article', { name });
          expect(await fitsWidth(card), `${mode}, ${tiles}: ${name.slice(0, 20)}`).toBe(true);
          expect((await title.boundingBox())!.width).toBeLessThanOrEqual((await card.boundingBox())!.width);
        }
        const description = products.getByText('x'.repeat(200), { exact: true });
        await expect(description).toHaveAttribute('title', 'x'.repeat(200));
        expect(await fitsWidth(description)).toBe(true);
        expect(await noPageScroll(page), `${mode}, ${tiles}`).toBe(true);
      }
    }
  });

  test('each view mode keeps its actions, and the chosen mode persists across a reload', async ({ page }) => {
    await setUp(page, '/marketplace');
    const main = page.locator('main');
    const domains = main.getByRole('region', { name: 'Browse Data Domains' });
    const products = main.getByRole('region', { name: 'Data Products' });

    // List: the domain chips filter, and the exact-match switch appears with a selection
    await expect(domains.getByRole('button', { name: 'List' })).toHaveAttribute('aria-pressed', 'true');
    await domains.getByRole('button', { name: 'Orders', exact: true }).click();
    await expect(domains.getByRole('button', { name: 'Orders', exact: true })).toHaveAttribute('aria-pressed', 'true');
    await expect(products.getByRole('article')).toHaveCount(0);
    await expect(products).toContainText('No data products found.');
    await domains.getByRole('switch', { name: 'Exact match only' }).check();
    await domains.getByRole('button', { name: 'All Domains' }).click();
    await expect(products.getByRole('article')).toHaveCount(3);

    // Graph, at 2 tiles a row
    await domains.getByRole('button', { name: 'Graph' }).click();
    await main.getByRole('textbox', { name: 'Tiles per row' }).click();
    await page.getByRole('option', { name: '2 per row' }).click();
    await expect(domains.locator('.react-flow')).toBeVisible();

    // Both persist across a reload
    await page.reload();
    await expect(main.getByRole('button', { name: 'Graph' })).toHaveAttribute('aria-pressed', 'true');
    await expect(main.getByRole('textbox', { name: 'Tiles per row' })).toHaveValue('2 per row');
    await expect(main.getByRole('region', { name: 'Browse Data Domains' }).locator('.react-flow')).toBeVisible();
    const grid = products.locator('[data-tiles]');
    await expect(grid).toHaveAttribute('data-tiles', '2');
    expect(await grid.evaluate((el) => getComputedStyle(el).gridTemplateColumns.split(' ').length)).toBe(2);

    // In this mode the products keep their actions: a card opens its info, and Open in details navigates
    await products.getByRole('button', { name: 'Sales orders', exact: true }).click();
    const info = page.getByRole('dialog');
    await expect(info).toBeVisible();
    await expect(info.getByRole('button', { name: /Subscribe|Already subscribed|Subscribed/ }).first()).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(info).toHaveCount(0);
    await products.getByRole('article', { name: 'Sales orders' }).getByRole('button', { name: 'Open in details view' }).click();
    await expect(page).toHaveURL(/\/my-products\/e2e-mp-1$/);
  });

  test('marketplace empty and error states keep their actions', async ({ page }) => {
    // A failed load: the Alert and Retry, which loads the list again
    const heal = await failUntilHealed('/api/data-products/published');
    await setUp(page, '/marketplace');
    const products = page.locator('main').getByRole('region', { name: 'Data Products' });
    const alert = products.getByRole('alert');
    await expect(alert).toContainText('Failed to load products');
    await expect(alert).toContainText('HTTP error! status: 500');
    heal();
    await products.getByRole('button', { name: 'Retry' }).click();
    await expect(products.getByRole('article')).toHaveCount(3);
    await expect(products.getByRole('alert')).toHaveCount(0);

    // The empty list: its message, and the filters still work
    failing = null;
    await setUp(page, '/marketplace', { '/api/data-products/published': [] });
    await expect(products).toContainText('No data products found.');
    const search = page.locator('main').getByRole('searchbox', { name: 'What can we help you find today?' });
    await search.fill('sales');
    await expect(products).toContainText('Try adjusting your search or filter.');
    await page.locator('main').getByRole('button', { name: 'Clear' }).click();
    await expect(search).toHaveValue('');
  });
});

test.describe('search', () => {
  test('/search opens Ask Ontos; the kit header and tabs keep their slugs', async ({ page }) => {
    await setUp(page, '/search');
    await expect(page).toHaveURL(/\/search\/llm$/);
    const main = page.locator('main');
    const title = main.getByRole('heading', { level: 1, name: 'Search' });
    expect(await style(title, ['font-size', 'color'])).toEqual({ 'font-size': '16px', color: NAVY });
    const tab = main.getByRole('tab', { name: 'Ask Ontos' });
    await expect(tab).toHaveAttribute('aria-selected', 'true');
    expect((await style(tab, ['font-size']))['font-size']).toBe('12px');
    await main.getByRole('tab', { name: 'Index Search' }).click();
    await expect(page).toHaveURL(/\/search\/index$/);
    await expect(main.getByRole('tabpanel', { name: 'Index Search' }).getByRole('region', { name: 'Index Search' })).toBeVisible();
  });

  test('Ask Ontos with the LLM off shows its disabled state', async ({ page }) => {
    await setUp(page, '/search/llm', { '/api/llm-search/status': { enabled: false, disclaimer: '' } });
    const pane = page.locator('main').getByRole('region', { name: 'AI-Powered Search' });
    await expect(pane).toBeVisible();
    await expect(pane).toContainText('LLM search requires configuration.');
    await expect(page.locator('main').getByRole('textbox', { name: 'Ask a question about your data...' })).toHaveCount(0);
  });

  test('the chat scrolls inside its pane: the composer stays in view and the header stays in place', async ({ page }) => {
    await consent(page);
    await setUp(page, '/search/llm', llmEnabled);
    const main = page.locator('main');
    const header = main.getByRole('heading', { level: 1, name: 'Search' });
    await expect(header).toBeVisible();
    const headerTop = (await header.boundingBox())!.y;

    // The history: a long session title wraps inside the list
    await main.getByRole('button', { name: 'History' }).click();
    const longSession = page.getByRole('button', { name: LONG_TITLE, exact: true });
    await expect(longSession).toBeVisible();
    expect(await fitsWidth(longSession)).toBe(true);
    expect((await longSession.boundingBox())!.height).toBeGreaterThan(30);
    await expect(page.getByRole('button', { name: `Delete conversation: ${LONG_TITLE}` })).toBeVisible();
    await longSession.click();

    const log = main.getByRole('log', { name: 'Messages' });
    await expect(log.getByText('Answer 39:', { exact: false })).toBeVisible();
    // The list scrolls inside itself, at the bottom, and the page does not scroll
    expect(await log.evaluate((el) => el.scrollHeight > el.clientHeight + 100)).toBe(true);
    await expect.poll(() => log.evaluate((el) => Math.abs(el.scrollHeight - el.clientHeight - el.scrollTop) < 4)).toBe(true);
    expect(await page.evaluate(() => document.documentElement.scrollHeight <= window.innerHeight + 1)).toBe(true);
    const composer = main.getByRole('textbox', { name: 'Ask a question about your data...' });
    const inView = async () => {
      const b = (await composer.boundingBox())!;
      return b.y >= 0 && b.y + b.height <= 800;
    };
    expect(await inView()).toBe(true);
    // Scrolled to the top, the composer and the header stay where they were
    await log.evaluate((el) => { el.scrollTop = 0; });
    await expect(log.getByText(LONG_MESSAGE)).toBeInViewport();
    expect(await inView()).toBe(true);
    expect((await header.boundingBox())!.y).toBe(headerTop);

    // A 200-character message with no break opportunity wraps inside its bubble
    const bubble = log.getByText(LONG_MESSAGE);
    expect(await fitsWidth(bubble)).toBe(true);
    expect((await bubble.boundingBox())!.height).toBeGreaterThan(30);
    expect(await noPageScroll(page)).toBe(true);
    // Edit & resend puts the question in the composer
    await bubble.hover();
    await log.getByRole('button', { name: 'Edit & resend' }).first().click();
    await expect(composer).toHaveValue(LONG_MESSAGE);
  });

  test('Ask Ontos status and session load failures show an Alert with Retry', async ({ page }) => {
    await consent(page);
    const heal = await failUntilHealed('/api/llm-search/status');
    await setUp(page, '/search/llm', llmEnabled);
    const main = page.locator('main');
    await expect(main.getByRole('alert')).toContainText('Failed to load LLM search.');
    heal();
    await main.getByRole('button', { name: 'Retry' }).click();
    await expect(main.getByRole('alert')).toHaveCount(0);
    await expect(main.getByText('How can I help you today?')).toBeVisible();

    const healSession = await failUntilHealed('/api/llm-search/sessions/e2e-session-1', page);
    await main.getByRole('button', { name: 'History' }).click();
    await page.getByRole('button', { name: LONG_TITLE, exact: true }).click();
    const log = main.getByRole('log', { name: 'Messages' });
    await expect(log.getByRole('alert')).toContainText('Failed to load session');
    healSession();
    await log.getByRole('button', { name: 'Retry' }).click();
    await expect(log.getByText('Answer 39:', { exact: false })).toBeVisible();
  });

  test('index search: results, no results, and a failed search with Retry', async ({ page }) => {
    await setUp(page, '/search/index?query=sales');
    const pane = page.locator('main').getByRole('region', { name: 'Index Search' });
    const field = pane.getByRole('textbox', { name: 'Search for data products, terms, contracts...' });
    await expect(field).toHaveValue('sales');
    expect(Math.round((await field.boundingBox())!.height)).toBeLessThanOrEqual(28);
    const link = pane.getByRole('link', { name: /Sales orders/ });
    await expect(link).toHaveAttribute('href', '/data-products/e2e-product-1');
    const long = pane.getByRole('link', { name: new RegExp(LONG_NAME.slice(0, 30)) });
    expect(await fitsWidth(long)).toBe(true);
    expect(await noPageScroll(page)).toBe(true);

    await field.fill('nothing');
    await expect(pane).toContainText('No results found');
    await expect(page).toHaveURL(/query=nothing/);

    const heal = await failUntilHealed('/api/search', page);
    await field.fill('broken');
    await expect(pane.getByRole('alert')).toContainText('The search failed.');
    heal();
    await pane.getByRole('button', { name: 'Retry' }).click();
    await expect(pane.getByRole('link', { name: /Sales orders/ })).toBeVisible();
  });
});
