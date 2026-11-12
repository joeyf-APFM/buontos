/**
 * Task 15: Data Asset Reviews (/data-asset-reviews and
 * /data-asset-reviews/:requestId) on the page kit, measured in a real browser
 * (ruling R10: jsdom ignores the cascade). The list is full bleed: the shell's
 * breadcrumb and header, then one pane holding the shared DataTable. The
 * detail page stacks the request's panes. The create dialog and the asset
 * review editor are Mantine Modals; the editor keeps its syntax highlighter
 * and markdown renderer.
 *
 * CAPTURE=before|after also saves images of the pages and their dialogs to
 * .superpowers/sdd/2026-11-09-mantine-restyle-waves-0-1/task-15-images/.
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test, type Locator, type Page } from '@playwright/test';
import { mockApi } from './fixtures/api';
import { DATA_FIXTURES } from './fixtures/data';
import { PERSONAS } from './fixtures/personas';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const IMAGES = path.resolve(HERE, '../../../../.superpowers/sdd/2026-11-09-mantine-restyle-waves-0-1/task-15-images');
const CAPTURE = process.env.CAPTURE;

const NAVY = 'rgb(31, 48, 102)';
const TEXT_SECONDARY = 'rgb(86, 93, 101)';
const CRITICAL = 'rgb(212, 28, 22)';

const LONG_TITLE =
  'A review request with a very long title that goes on and on so that it can never fit on one line of the list at this width';
const LONG_NOTES =
  'Notes that run for a long while: check the order tables, the order lines and the returns before the release, and say which columns still need descriptions, owners and tags before the data product goes out, and that the contract, the quality rules and the lineage agree with what the consumers were promised.';
const LONG_SQL = `SELECT ${Array.from({ length: 40 }, (_, i) => `o.column_number_${i}`).join(', ')} FROM main.sales.orders o`;

const style = (loc: Locator, props: string[]) =>
  loc.evaluate((el, names) => {
    const cs = getComputedStyle(el);
    return Object.fromEntries(names.map((n) => [n, cs.getPropertyValue(n)]));
  }, props);

const box = async (loc: Locator) => (await loc.boundingBox())!;

const REVIEW = DATA_FIXTURES['/api/data-asset-reviews/e2e-review-1'] as { updated_at: string; assets: Record<string, unknown>[] } & Record<string, unknown>;
const LONG_REVIEW = {
  ...REVIEW, id: 'e2e-review-long', title: LONG_TITLE, status: 'queued', notes: LONG_NOTES,
};
const VIEW_ASSET = {
  id: 'e2e-reviewed-3', asset_fqn: 'main.sales.v_orders', asset_type: 'view', status: 'pending', comments: null,
  updated_at: REVIEW.updated_at,
};
const DETAIL = { ...REVIEW, notes: LONG_NOTES, assets: [...REVIEW.assets, VIEW_ASSET] };
const ASSETS_BASE = '/api/data-asset-reviews/e2e-review-1/assets';

const CATALOGS = [{ id: 'main', name: 'main', type: 'catalog', hasChildren: true }];
const SCHEMAS = [{ id: 'main.sales', name: 'sales', type: 'schema', hasChildren: true }];
const TABLES = [{ id: 'main.sales.orders', name: 'orders', type: 'table', hasChildren: false }];

const ANALYSIS = {
  request_id: 'e2e-review-1',
  asset_id: 'e2e-reviewed-3',
  analysis_summary: `## Findings\n\nThe view reads **every** column.\n\n\`\`\`sql\n${LONG_SQL}\n\`\`\``,
  model_used: 'e2e-model',
  timestamp: '2026-11-09T11:00:00Z',
  phase1_passed: true,
  render_as_markdown: true,
};

const FIXTURES = {
  ...DATA_FIXTURES,
  '/api/data-asset-reviews': [REVIEW, LONG_REVIEW],
  '/api/data-asset-reviews/e2e-review-1': DETAIL,
  '/api/catalogs': CATALOGS,
  '/api/catalogs/main/schemas': SCHEMAS,
  '/api/catalogs/main/schemas/sales/tables': TABLES,
  [`${ASSETS_BASE}/e2e-reviewed-1/preview`]: {
    schema: [{ name: 'order_id', type: 'int', nullable: false }, { name: 'customer', type: 'string', nullable: true }],
    data: [{ order_id: 1, customer: 'Ada' }, { order_id: 2, customer: 'Grace' }],
    total_rows: 2,
  },
  '/api/settings/llm': { enabled: true, endpoint: 'e2e-endpoint', system_prompt: null, disclaimer_text: 'AI may be wrong.' },
  [`${ASSETS_BASE}/e2e-reviewed-3/analyze`]: ANALYSIS,
};

async function setUp(page: Page, route: string, extra: Record<string, unknown> = {}) {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.clock.setFixedTime(new Date('2026-11-09T12:00:00Z'));
  await page.addInitScript(() => {
    // The LLM consent was given before, so the AI analysis runs at once
    localStorage.setItem('llm_consent_state', JSON.stringify({ accepted: true, timestamp: '2026-11-01T00:00:00Z', config_version: 'e2e-endpoint' }));
  });
  await mockApi(page, PERSONAS.admin, { ...FIXTURES, ...extra });
  // The view's definition comes back as plain text
  await page.route((url) => url.pathname === `${ASSETS_BASE}/e2e-reviewed-3/definition`, (r) =>
    r.fulfill({ contentType: 'text/plain', body: LONG_SQL }));
  await page.goto(route);
}

async function setUpList(page: Page, extra: Record<string, unknown> = {}) {
  await setUp(page, '/data-asset-reviews', extra);
  await expect(page.getByRole('heading', { level: 1, name: 'Data Asset Reviews' })).toBeVisible();
  await expect(page.locator('main').getByText('Review sales tables', { exact: true })).toBeVisible();
}

async function setUpDetail(page: Page, extra: Record<string, unknown> = {}) {
  await setUp(page, '/data-asset-reviews/e2e-review-1', extra);
  await expect(page.getByRole('heading', { level: 1, name: 'Review sales tables' })).toBeVisible();
  await expect(page.locator('main').getByText('main.sales.v_orders', { exact: true })).toBeVisible();
}

async function capture(page: Page, name: string) {
  if (!CAPTURE) return;
  await page.mouse.move(0, 0);
  // Let the dialog and list transitions finish
  await page.waitForTimeout(400);
  await page.screenshot({ path: path.join(IMAGES, `${name}-${CAPTURE}.png`), animations: 'disabled', caret: 'hide' });
}

const rowOf = (page: Page, text: string) => page.locator('main tbody tr', { has: page.getByText(text, { exact: true }) });
const focusInDialog = (page: Page) =>
  page.evaluate(() => !!document.activeElement?.closest('[role="dialog"], [role="alertdialog"]'));
const openCreate = async (page: Page) => {
  await page.getByRole('button', { name: 'Create New Data Asset Review Request' }).click();
  const dialog = page.getByRole('dialog', { name: 'Create New Data Asset Review Request' });
  await expect(dialog.getByText('main', { exact: true })).toBeVisible();
  return dialog;
};
/** Expands main → sales in the dialog's tree and picks the orders table. */
const pickOrders = async (page: Page, dialog: Locator) => {
  await dialog.locator('[data-node-id="main"] button').click();
  await dialog.locator('[data-node-id="main.sales"] button').click();
  await dialog.locator('[data-node-id="main.sales.orders"]').click();
};
const reviewButton = (page: Page, fqn: string) => rowOf(page, fqn).getByRole('button', { name: 'Review' });
const editorOf = (page: Page, fqn: string) => page.getByRole('dialog', { name: `Reviewing: ${fqn}` });

test.describe('captures', () => {
  test('captures the pages and their dialogs', async ({ page }) => {
    test.skip(!CAPTURE, 'only with CAPTURE=before|after');
    await setUpList(page);
    await capture(page, 'list');

    const dialog = await openCreate(page);
    await pickOrders(page, dialog);
    await capture(page, 'dialog-create');
    await page.getByRole('button', { name: 'Submit Request' }).click();
    await expect(page.getByText('Reviewer email is required.')).toBeVisible();
    await capture(page, 'dialog-create-invalid');

    await setUpDetail(page);
    await capture(page, 'detail');
    await page.getByLabel('Overall Status:').click();
    await expect(page.getByRole('option', { name: 'Approved' })).toBeVisible();
    await capture(page, 'detail-status');
    await page.keyboard.press('Escape');

    await reviewButton(page, 'main.sales.orders').click();
    await expect(page.getByText('Ada', { exact: true })).toBeVisible();
    await capture(page, 'editor-table');

    await setUpDetail(page);
    await reviewButton(page, 'main.sales.v_orders').click();
    await expect(page.getByRole('button', { name: 'Run AI Analysis' })).toBeEnabled();
    await page.getByRole('button', { name: 'Run AI Analysis' }).click();
    await expect(page.getByRole('heading', { name: 'Findings' })).toBeVisible();
    await capture(page, 'editor-view');
  });
});

test.describe('the list', () => {
  test('is full bleed, under the shell breadcrumb, with the kit header and one pane', async ({ page }) => {
    await setUpList(page);
    const main = page.locator('main');
    expect(await style(main, ['padding-top', 'padding-left'])).toEqual({ 'padding-top': '0px', 'padding-left': '0px' });
    const kitPage = main.locator('[data-full-bleed]');
    await expect(kitPage).toHaveCount(1);
    // It fills the main area under the shell's breadcrumb: no page scroll
    const mainBox = await box(main);
    const crumbBar = await box(main.getByRole('navigation', { name: 'Breadcrumb' }).locator('..'));
    expect(Math.round(crumbBar.height + (await box(kitPage)).height)).toBe(Math.round(mainBox.height));
    expect(await main.evaluate((el) => el.scrollHeight - el.clientHeight)).toBe(0);

    const crumb = page.getByRole('navigation', { name: 'Breadcrumb' });
    await expect(crumb.getByRole('listitem')).toHaveText(['Home', '>Settings', '>Asset Reviews']);
    await expect(crumb.getByRole('link')).toHaveCount(1);

    const title = page.getByRole('heading', { level: 1, name: 'Data Asset Reviews' });
    expect(await style(title, ['font-size', 'color'])).toEqual({ 'font-size': '16px', color: NAVY });
    expect(Math.round((await box(title)).x - mainBox.x)).toBe(14);

    const pane = page.getByRole('region', { name: 'Review request list' });
    await expect(pane.getByRole('table')).toHaveCount(1);
    const filter = pane.getByRole('textbox', { name: 'Filter titles...' });
    expect(Math.round((await box(filter)).x - mainBox.x)).toBe(14);
  });

  test('keeps the grid density, wraps a long title, and the delete button is critical', async ({ page }) => {
    await setUpList(page);
    expect(Math.round((await box(page.locator('main thead tr').first())).height)).toBe(28);
    expect(Math.round((await box(rowOf(page, 'Review sales tables'))).height)).toBe(28);

    const sortTitle = page.getByRole('button', { name: 'Title', exact: true });
    expect(await style(sortTitle, ['font-size', 'font-weight', 'color'])).toEqual({
      'font-size': '11px', 'font-weight': '600', color: TEXT_SECONDARY,
    });
    const plain = page.locator('main thead th', { hasText: 'Reviewer' });
    expect(await style(plain, ['color'])).toEqual({ color: TEXT_SECONDARY });

    const long = rowOf(page, LONG_TITLE).getByText(LONG_TITLE, { exact: true });
    expect(await long.evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(true);
    expect(await style(long, ['white-space', 'text-overflow'])).toEqual({ 'white-space': 'normal', 'text-overflow': 'clip' });
    expect((await box(long)).height).toBeGreaterThan(30);
    expect(Math.round((await box(long)).width)).toBeLessThanOrEqual(420);

    const del = rowOf(page, 'Review sales tables').getByRole('button', { name: 'Delete Request' });
    expect(await style(del, ['color', 'width', 'height'])).toEqual({ color: CRITICAL, width: '24px', height: '24px' });
  });

  test('sorts by title from the header button', async ({ page }) => {
    await setUpList(page);
    const titles = () => page.locator('main tbody tr td:nth-child(2)').allInnerTexts();
    // The table starts sorted by title (the DataTable's first sortable
    // column), ascending; each click turns it round
    expect(await titles()).toEqual([LONG_TITLE, 'Review sales tables']);
    await page.getByRole('button', { name: 'Title', exact: true }).click();
    expect(await titles()).toEqual(['Review sales tables', LONG_TITLE]);
    await page.getByRole('button', { name: 'Title', exact: true }).click();
    expect(await titles()).toEqual([LONG_TITLE, 'Review sales tables']);
  });

  test('a row opens its review; delete asks first and calls the API', async ({ page }) => {
    await setUpList(page);
    const deleted: string[] = [];
    await page.route((url) => url.pathname.startsWith('/api/data-asset-reviews/'), async (route) => {
      if (route.request().method() !== 'DELETE') return route.fallback();
      deleted.push(new URL(route.request().url()).pathname);
      return route.fulfill({ status: 204, body: '' });
    });
    const prompts: string[] = [];
    page.on('dialog', (d) => {
      prompts.push(d.message());
      void (prompts.length === 1 ? d.dismiss() : d.accept());
    });
    const del = rowOf(page, 'Review sales tables').getByRole('button', { name: 'Delete Request' });
    await del.click();
    expect(prompts).toEqual(['Are you sure you want to delete this review request?']);
    expect(deleted).toEqual([]);
    await del.click();
    await expect.poll(() => deleted).toEqual(['/api/data-asset-reviews/e2e-review-1']);
    await expect(page).toHaveURL(/\/data-asset-reviews$/);

    await rowOf(page, 'Review sales tables').getByText('Review sales tables', { exact: true }).click();
    await expect(page).toHaveURL(/\/data-asset-reviews\/e2e-review-1$/);
  });
});

test.describe('the create dialog', () => {
  test('a Mantine Modal: focus on the reviewer, trapped, Escape returns it to Create', async ({ page }) => {
    await setUpList(page);
    const create = page.getByRole('button', { name: 'Create New Data Asset Review Request' });
    const dialog = await openCreate(page);
    await expect(dialog).toHaveClass(/mantine-Modal-content/);
    await expect(dialog).toHaveAccessibleDescription('Select assets and assign a reviewer.');
    // The kit Dialog's md width
    expect(Math.round((await box(dialog)).width)).toBe(560);
    expect(await style(dialog, ['border-top-left-radius'])).toEqual({ 'border-top-left-radius': '8px' });
    await expect(dialog.getByRole('textbox', { name: 'Reviewer' })).toBeFocused();
    await expect(dialog.getByRole('textbox', { name: 'Your Email' })).toHaveValue('e2e.user@example.com');
    await expect(dialog.getByRole('textbox', { name: 'Your Email' })).toBeDisabled();
    for (const name of ['Your Email', 'Reviewer', 'Title (Optional)']) {
      expect(Math.round((await box(dialog.getByRole('textbox', { name }))).height)).toBe(28);
    }
    expect(await style(dialog.getByText('Your Email', { exact: true }), ['font-size', 'color'])).toEqual({
      'font-size': '12px', color: 'rgb(44, 47, 52)',
    });

    for (let i = 0; i < 8; i += 1) {
      await page.keyboard.press('Tab');
      expect(await focusInDialog(page)).toBe(true);
    }
    for (let i = 0; i < 3; i += 1) {
      await page.keyboard.press('Shift+Tab');
      expect(await focusInDialog(page)).toBe(true);
    }
    // A click outside leaves it open, as the Radix dialog did
    await page.mouse.click(10, 10);
    await expect(dialog).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(dialog).toHaveCount(0);
    await expect(create).toBeFocused();
  });

  test('a validation error is shown in the dialog, and focus stays inside', async ({ page }) => {
    await setUpList(page);
    const dialog = await openCreate(page);
    const submit = page.getByRole('button', { name: 'Submit Request' });
    await expect(submit).toBeDisabled();
    await pickOrders(page, dialog);
    await expect(submit).toBeEnabled();
    await submit.click();
    const error = dialog.getByRole('alert').filter({ hasText: 'Reviewer email is required.' });
    await expect(error).toBeVisible();
    expect(await focusInDialog(page)).toBe(true);
    await expect(dialog).toBeVisible();
  });

  test('submit posts the payload, closes, and puts focus back on Create after the reload', async ({ page }) => {
    await setUpList(page);
    const posted: unknown[] = [];
    await page.route((url) => url.pathname === '/api/data-asset-reviews', async (route) => {
      if (route.request().method() !== 'POST') return route.fallback();
      posted.push(route.request().postDataJSON());
      return route.fulfill({ json: { ...REVIEW, id: 'e2e-review-new', title: 'New review' } });
    });
    const dialog = await openCreate(page);
    await pickOrders(page, dialog);
    const reviewer = dialog.getByRole('textbox', { name: 'Reviewer' });
    await reviewer.fill('sam@example.com');
    await reviewer.press('Enter');
    await dialog.getByRole('textbox', { name: 'Title (Optional)' }).fill('  Orders  ');
    await dialog.getByRole('textbox', { name: 'Notes (Optional)' }).fill('Please look');
    await page.getByRole('button', { name: 'Submit Request' }).click();
    await expect(dialog).toHaveCount(0);
    expect(posted).toEqual([{
      requester_email: 'e2e.user@example.com',
      reviewer_email: 'sam@example.com',
      asset_fqns: ['main.sales.orders'],
      title: 'Orders',
      notes: 'Please look',
    }]);
    await expect(page.getByRole('button', { name: 'Create New Data Asset Review Request' })).toBeFocused();
  });

  test('a slow reload: focus the user moved elsewhere stays there, once the list is back', async ({ page }) => {
    await setUpList(page);
    await page.route((url) => url.pathname === '/api/data-asset-reviews', (route) =>
      route.request().method() === 'POST' ? route.fulfill({ json: { ...REVIEW, id: 'e2e-review-new' } }) : route.fallback());
    const dialog = await openCreate(page);
    await pickOrders(page, dialog);
    const reviewer = dialog.getByRole('textbox', { name: 'Reviewer' });
    await reviewer.fill('sam@example.com');
    await reviewer.press('Enter');

    // Hold the reload until the user has moved on
    let release: () => void = () => {};
    const held = new Promise<void>((resolve) => { release = resolve; });
    let reloads = 0;
    await page.route((url) => url.pathname === '/api/data-asset-reviews', async (route) => {
      if (route.request().method() !== 'GET') return route.fallback();
      reloads += 1;
      await held;
      return route.fallback();
    });
    await page.getByRole('button', { name: 'Submit Request' }).click();
    await expect(dialog).toHaveCount(0);
    await expect.poll(() => reloads).toBe(1);

    const search = page.getByPlaceholder(/^Search assets, concepts, contracts/);
    await search.focus();
    release();
    await expect(page.getByRole('button', { name: 'Create New Data Asset Review Request' })).toBeVisible();
    // Give any late focus move a chance to happen
    await page.waitForTimeout(300);
    await expect(search).toBeFocused();
  });

  test('after a delete, focus goes to Create once the list is back; after a failed one it stays on the row', async ({ page }) => {
    await setUpList(page);
    let fail = true;
    await page.route((url) => url.pathname.startsWith('/api/data-asset-reviews/'), (route) => {
      if (route.request().method() !== 'DELETE') return route.fallback();
      return fail ? route.fulfill({ status: 409, json: { detail: 'In use' } }) : route.fulfill({ status: 204, body: '' });
    });
    page.on('dialog', (d) => void d.accept());
    const del = rowOf(page, 'Review sales tables').getByRole('button', { name: 'Delete Request' });
    await del.click();
    await expect(page.getByRole('region', { name: 'Review request list' }).getByRole('alert')).toHaveText('In use');
    await expect(del).toBeFocused();

    fail = false;
    await del.click();
    await expect(page.getByRole('button', { name: 'Create New Data Asset Review Request' })).toBeFocused();
  });

  test('Escape in the reviewer search closes only its results', async ({ page }) => {
    await setUpList(page, {
      '/api/directory/status': { configured: true, provider_type: 'e2e', connection_name: 'e2e' },
      '/api/directory/search': { results: [{ type: 'user', id: 'sam@example.com', display_name: 'Sam Example', sub_label: 'sam@example.com' }] },
    });
    const dialog = await openCreate(page);
    const reviewer = dialog.getByRole('textbox', { name: 'Reviewer' });
    await reviewer.fill('sam');
    const result = page.getByTestId('principal-row');
    await expect(result).toBeVisible();
    // The results sit above the dialog
    expect(await result.evaluate((el) => {
      const r = el.getBoundingClientRect();
      return document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2)?.closest('[data-testid="principal-row"]') === el;
    })).toBe(true);
    await page.keyboard.press('Escape');
    await expect(result).toHaveCount(0);
    // Past the Modal's 200ms exit transition: still open
    await page.waitForTimeout(500);
    await expect(dialog).toHaveCount(1);
    await page.keyboard.press('Escape');
    await expect(dialog).toHaveCount(0);
  });
});

test.describe('the detail page', () => {
  test('the shell breadcrumb, the kit header, and the request panes stacked', async ({ page }) => {
    await setUpDetail(page);
    const main = page.locator('main');
    expect(await style(main, ['padding-top', 'padding-left'])).toEqual({ 'padding-top': '0px', 'padding-left': '0px' });
    const crumb = page.getByRole('navigation', { name: 'Breadcrumb' });
    await expect(crumb.getByRole('listitem')).toHaveText(['Home', '>Settings', '>Asset Reviews', '>Review sales tables']);
    await expect(crumb.getByRole('link', { name: 'Asset Reviews' })).toHaveAttribute('href', '/data-asset-reviews');

    const title = page.getByRole('heading', { level: 1, name: 'Review sales tables' });
    expect(await style(title, ['font-size', 'color'])).toEqual({ 'font-size': '16px', color: NAVY });

    const status = page.getByLabel('Overall Status:', { exact: true });
    await expect(status).toHaveAttribute('aria-haspopup', 'listbox');
    await expect(status).toHaveValue('In Review');
    expect(Math.round((await box(status)).height)).toBe(28);
    expect(await style(page.getByText('Overall Status:', { exact: true }), ['color'])).toEqual({ color: TEXT_SECONDARY });

    const info = page.getByRole('region', { name: 'Request Information' });
    const assets = page.getByRole('region', { name: 'Assets for Review (3)' });
    // One stack: the second pane shares the first one's bottom border
    expect(Math.round((await box(assets)).y)).toBe(Math.round((await box(info)).y + (await box(info)).height));
    expect(await style(assets, ['border-top-width'])).toEqual({ 'border-top-width': '0px' });
    expect(await style(info.locator('dt').first(), ['color'])).toEqual({ color: TEXT_SECONDARY });
    // Every label sits in the fixed 86px column (Task 13d fix round 1)
    for (const dt of await info.locator('dt').all()) {
      expect(Math.round((await box(dt)).width)).toBe(86);
    }
    // A label wider than 86px in any font wraps inside its column, nothing is
    // clipped, and the values still line up down the column: Requester,
    // Current Status and Last Updated are the left column's pairs
    const wide = info.locator('dt', { hasText: 'Current Status' });
    await wide.evaluate((el) => { el.textContent = 'Current Status of this request for review'; });
    expect(Math.round((await box(wide)).width)).toBe(86);
    expect(await wide.evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(true);
    const left = async (label: string) => Math.round((await box(info.locator('dt', { hasText: label }).locator('xpath=following-sibling::dd'))).x);
    const requesterX = await left('Requester');
    expect(await left('Current Status')).toBe(requesterX);
    expect(await left('Last Updated')).toBe(requesterX);
    // The notes read in full, on at least two lines
    const notes = info.getByText(LONG_NOTES, { exact: true });
    expect(await notes.evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(true);
    const lineHeight = await notes.evaluate((el) => parseFloat(getComputedStyle(el).lineHeight));
    expect((await box(notes)).height).toBeGreaterThanOrEqual(2 * lineHeight - 1);

    expect(Math.round((await box(rowOf(page, 'main.sales.orders'))).height)).toBe(28);
  });

  test('the overall status is a Mantine Select that saves the change', async ({ page }) => {
    await setUpDetail(page);
    const put: unknown[] = [];
    await page.route((url) => url.pathname === '/api/data-asset-reviews/e2e-review-1/status', async (route) => {
      put.push({ method: route.request().method(), body: route.request().postDataJSON() });
      return route.fulfill({ json: { ...DETAIL, status: 'approved' } });
    });
    const status = page.getByLabel('Overall Status:', { exact: true });
    await status.click();
    const approved = page.getByRole('option', { name: 'Approved' });
    await expect(page.getByRole('listbox')).toHaveClass(/mantine-Select-options/);
    await approved.click();
    await expect(status).toHaveValue('Approved');
    expect(put).toEqual([{ method: 'PUT', body: { status: 'approved' } }]);
  });

  test('the title edits inline: Enter saves, Escape cancels', async ({ page }) => {
    await setUpDetail(page);
    const patched: unknown[] = [];
    await page.route((url) => url.pathname === '/api/data-asset-reviews/e2e-review-1', async (route) => {
      if (route.request().method() !== 'PATCH') return route.fallback();
      patched.push(route.request().postDataJSON());
      return route.fulfill({ json: { ...DETAIL, title: 'Renamed' } });
    });
    const edit = page.getByRole('button', { name: 'Edit title' });
    await edit.focus();
    // Focused by keyboard, the hidden edit button shows
    await expect.poll(async () => (await style(edit, ['opacity'])).opacity).toBe('1');
    await page.keyboard.press('Enter');
    const field = page.getByPlaceholder('Leave empty to auto-generate from selected assets');
    await expect(field).toBeFocused();
    await page.keyboard.press('Escape');
    await expect(field).toHaveCount(0);
    expect(patched).toEqual([]);

    await page.getByRole('button', { name: 'Edit title' }).click();
    await field.fill('Renamed');
    await field.press('Enter');
    await expect(page.getByRole('heading', { level: 1, name: 'Renamed' })).toBeVisible();
    expect(patched).toEqual([{ title: 'Renamed' }]);
  });
});

test.describe('the asset review editor', () => {
  test('a Mantine Modal over the page: Escape closes it and focus goes back to Review', async ({ page }) => {
    await setUpDetail(page);
    const review = reviewButton(page, 'main.sales.orders');
    await review.click();
    const editor = editorOf(page, 'main.sales.orders');
    await expect(editor).toHaveClass(/mantine-Modal-content/);
    // The kit Dialog's xl width
    expect(Math.round((await box(editor)).width)).toBe(960);
    await expect(editor.getByText('Ada', { exact: true })).toBeVisible();
    expect(await focusInDialog(page)).toBe(true);
    const status = editor.getByLabel('Status *', { exact: true });
    await expect(status).toHaveAttribute('aria-haspopup', 'listbox');
    await expect(status).toHaveValue('pending');
    expect(Math.round((await box(status)).height)).toBe(28);
    // A click outside leaves it open, as the overlay did
    await page.mouse.click(10, 10);
    await expect(editor).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(editor).toHaveCount(0);
    await expect(review).toBeFocused();
  });

  test('saves the review with its status and comments', async ({ page }) => {
    await setUpDetail(page);
    const put: unknown[] = [];
    await page.route((url) => url.pathname === `${ASSETS_BASE}/e2e-reviewed-1/status`, async (route) => {
      put.push(route.request().postDataJSON());
      return route.fulfill({ json: { ...REVIEW.assets[0], status: 'approved', comments: 'Fine' } });
    });
    await reviewButton(page, 'main.sales.orders').click();
    const editor = editorOf(page, 'main.sales.orders');
    const status = editor.getByLabel('Status *', { exact: true });
    await status.click();
    await page.getByRole('option', { name: 'approved' }).click();
    // Escape on the open list closes only the list
    await status.click();
    await expect(page.getByRole('option', { name: 'rejected' })).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.getByRole('option', { name: 'rejected' })).toHaveCount(0);
    // Past the Modal's 200ms exit transition: still open, with the choice kept
    await page.waitForTimeout(500);
    await expect(editor).toHaveCount(1);
    await expect(status).toHaveValue('approved');
    expect(await focusInDialog(page)).toBe(true);
    await editor.getByRole('textbox', { name: 'Comments' }).fill('Fine');
    await editor.getByRole('button', { name: 'Save Review' }).click();
    await expect.poll(() => put).toEqual([{ status: 'approved', comments: 'Fine' }]);
  });

  test('a long definition and a long markdown code block scroll inside the editor', async ({ page }) => {
    await setUpDetail(page);
    await reviewButton(page, 'main.sales.v_orders').click();
    const editor = editorOf(page, 'main.sales.v_orders');
    const code = editor.locator('pre').first();
    await expect(code).toContainText('o.column_number_39');
    const editorWidth = Math.round((await box(editor)).width);
    expect(editorWidth).toBe(960);
    expect(await code.evaluate((el) => el.scrollWidth > el.clientWidth)).toBe(true);
    expect(Math.round((await box(code)).width)).toBeLessThan(editorWidth);

    await editor.getByRole('button', { name: 'Run AI Analysis' }).click();
    await expect(editor.getByRole('heading', { name: 'Findings' })).toBeVisible();
    await expect(editor.locator('strong', { hasText: 'every' })).toBeVisible();
    const markdownCode = editor.locator('.markdown-container pre');
    await expect(markdownCode).toContainText('o.column_number_39');
    expect(Math.round((await box(editor)).width)).toBe(editorWidth);
    const scroller = editor.locator('.markdown-container');
    expect(await scroller.evaluate((el) => {
      const pre = el.querySelector('pre')!;
      return pre.scrollWidth > pre.clientWidth || el.scrollWidth > el.clientWidth;
    })).toBe(true);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  });
});
