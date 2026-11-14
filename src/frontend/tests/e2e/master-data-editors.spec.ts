/**
 * Wave 3 Task 8b: the Master Data rules editor (Edit MDM Rules) and the match
 * review, measured in a real browser (ruling R10). The rules editor opens from
 * the Master Data page's Matching Rules tab; the match review is what an asset
 * review shows for an MDM match (components/data-asset-reviews/
 * asset-review-editor.tsx), so it is opened from a review request here. The
 * baselines show neither (ruling R6). Covered: the editor's two sections and
 * adding, editing and removing rules, Escape in an open Select (Review Focus
 * 4), the match review's choices and the payload they send, and 200-character
 * names and values (Review Focus 1).
 *
 * CAPTURE=before|after also saves images to
 * .superpowers/sdd/2026-11-13-mantine-restyle-wave-3/task-8-images/.
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test, type Locator, type Page } from '@playwright/test';
import { mockApi } from './fixtures/api';
import { DATA_FIXTURES } from './fixtures/data';
import { PERSONAS } from './fixtures/personas';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const IMAGES = path.resolve(HERE, '../../../../.superpowers/sdd/2026-11-13-mantine-restyle-wave-3/task-8-images');
const CAPTURE = process.env.CAPTURE;

const NAVY = 'rgb(31, 48, 102)';
const MONO = /mono|Menlo|Consolas|Courier/i;

const SPACED = `Customer golden record rule for every region ${'and every partner system '.repeat(8)}`.slice(0, 199) + '.';
const UNBROKEN = 'x'.repeat(200);

type Rec = Record<string, unknown>;
const CONFIG = (DATA_FIXTURES['/api/mdm/configs'] as Rec[])[0];
const LONG_CONFIG = {
  ...CONFIG,
  matching_rules: [
    { name: SPACED, type: 'probabilistic', fields: [UNBROKEN, 'email'], weight: 1, threshold: 0.9, algorithm: 'jaro_winkler' },
    { name: UNBROKEN, type: 'deterministic', fields: ['email'], weight: 1, threshold: 1 },
  ],
  survivorship_rules: [{ field: UNBROKEN, strategy: 'most_trusted', priority: [SPACED] }],
};

// An asset review holding one MDM match
const REVIEW = DATA_FIXTURES['/api/data-asset-reviews/e2e-review-1'] as Rec & { assets: Rec[] };
const FQN = 'mdm://e2e-mdm-1/e2e-mdm-run-1/e2e-mdm-cand-1';
const MDM_ASSET = { id: 'e2e-reviewed-mdm', asset_fqn: FQN, asset_type: 'mdm_match', status: 'pending', comments: null, updated_at: REVIEW.updated_at };
const CANDIDATE = {
  id: 'e2e-mdm-cand-1', run_id: 'e2e-mdm-run-1', master_record_id: 'master-1', source_record_id: 'src-1',
  source_contract_id: 'e2e-contract-src-1', confidence_score: 0.925, match_type: 'fuzzy', matched_fields: ['email'], status: 'pending',
  master_record_data: { golden_id: 'g-1', email: 'ann@example.com', name: 'Ann Lee', phone: null, city: 'Oslo' },
  source_record_data: { email: 'ann@example.com', name: 'Ann B. Lee', phone: '555-1234', city: 'Bergen' },
  merged_record_data: null, review_request_id: 'e2e-review-1', reviewed_at: null, reviewed_by: null, merged_at: null,
};
const LONG_CANDIDATE = {
  ...CANDIDATE,
  master_record_data: { [UNBROKEN]: SPACED, email: UNBROKEN, name: 'Ann Lee' },
  source_record_data: { [UNBROKEN]: UNBROKEN, email: SPACED, name: 'Ann Lee' },
  matched_fields: [UNBROKEN],
};
const REVIEW_FIXTURES = {
  '/api/data-asset-reviews/e2e-review-1': { ...REVIEW, assets: [...REVIEW.assets, MDM_ASSET] },
  '/api/mdm/candidates/e2e-mdm-cand-1': CANDIDATE,
};

const style = (loc: Locator, names: string[]) =>
  loc.evaluate((el, n) => {
    const cs = getComputedStyle(el);
    return Object.fromEntries(n.map((p) => [p, cs.getPropertyValue(p)]));
  }, names);

const box = async (loc: Locator) => (await loc.boundingBox())!;

const noPageScroll = (page: Page) =>
  page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);

/** What sticks out sideways in `root` (inputs scroll their own text; a clipped or truncated box is fine). [] is none. */
const sidewaysOverflow = (root: Locator) =>
  root.evaluate((el) => [el, ...Array.from(el.querySelectorAll<HTMLElement>('*'))]
    .filter((n) => {
      const cs = getComputedStyle(n);
      return n.scrollWidth > n.clientWidth + 1 && n.clientWidth > 0 && !['INPUT', 'TEXTAREA'].includes(n.tagName)
        && cs.overflowX !== 'hidden' && cs.overflowX !== 'clip' && cs.textOverflow !== 'ellipsis';
    })
    .map((n) => `${n.tagName}.${n.className} ${n.scrollWidth}>${n.clientWidth}`));

async function capture(page: Page, name: string) {
  if (!CAPTURE) return;
  await page.mouse.move(0, 0);
  await page.waitForTimeout(400);
  await page.screenshot({ path: path.join(IMAGES, `${name}-${CAPTURE}.png`), animations: 'disabled', caret: 'hide' });
}

async function openRules(page: Page, extra: Record<string, unknown> = {}) {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.clock.setFixedTime(new Date('2026-11-09T12:00:00Z'));
  await mockApi(page, PERSONAS.admin, { ...DATA_FIXTURES, ...extra });
  await page.goto('/master-data');
  const main = page.locator('main');
  await main.getByRole('listbox', { name: 'MDM Configurations' }).getByRole('option', { name: /Customer master/ }).click();
  await main.getByRole('tab', { name: 'Matching Rules' }).click();
  await main.getByRole('button', { name: 'Edit Rules' }).click();
  const dialog = page.getByRole('dialog', { name: 'Edit MDM Rules' });
  await expect(dialog).toBeVisible();
  return dialog;
}

async function openReview(page: Page, extra: Record<string, unknown> = {}) {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.clock.setFixedTime(new Date('2026-11-09T12:00:00Z'));
  await mockApi(page, PERSONAS.admin, { ...DATA_FIXTURES, ...REVIEW_FIXTURES, ...extra });
  await page.goto('/data-asset-reviews/e2e-review-1');
  await expect(page.getByRole('heading', { level: 1, name: 'Review sales tables' })).toBeVisible();
  await page.locator('main tbody tr', { has: page.getByText(FQN, { exact: true }) }).getByRole('button', { name: 'Review' }).click();
  const editor = page.getByRole('dialog', { name: `Reviewing: ${FQN}` });
  await expect(editor.getByRole('table')).toBeVisible();
  return editor;
}

/** The rule cards (before: the bordered boxes; after: [data-rule]). */
const cards = (dialog: Locator) => CAPTURE === 'before' ? dialog.locator('.border.rounded-lg') : dialog.locator('[data-rule]');

const rowOf = (editor: Locator, field: string) =>
  editor.getByRole('row').filter({ has: editor.page().locator('td:first-child').getByText(field, { exact: true }) });

test.describe('captures', () => {
  test('captures the rules editor and the match review', async ({ page }) => {
    test.skip(!CAPTURE, 'only with CAPTURE=before|after');
    let dialog = await openRules(page);
    await capture(page, 'rules-matching');
    await dialog.getByRole(CAPTURE === 'before' ? 'button' : 'tab', { name: /^Survivorship Rules/ }).click();
    await capture(page, 'rules-survivorship');
    await page.keyboard.press('Escape');
    dialog = await openRules(page, { '/api/mdm/configs': [LONG_CONFIG], '/api/mdm/configs/e2e-mdm-1': LONG_CONFIG });
    await capture(page, 'rules-long');
    await dialog.getByRole(CAPTURE === 'before' ? 'button' : 'tab', { name: /^Survivorship Rules/ }).click();
    await capture(page, 'rules-long-survivorship');
    await page.keyboard.press('Escape');

    await openReview(page);
    await capture(page, 'match-review');
    await page.keyboard.press('Escape');
    await openReview(page, {
      '/api/mdm/candidates/e2e-mdm-cand-1': {
        ...CANDIDATE, status: 'approved', reviewed_by: 'steward@example.com', reviewed_at: '2026-11-08T08:00:00Z',
        merged_record_data: { email: 'ann@example.com', name: 'Ann Beth Lee', phone: '555-1234', city: 'Oslo' },
      },
    });
    await capture(page, 'match-review-reviewed');
    await page.keyboard.press('Escape');
    await openReview(page, { '/api/mdm/candidates/e2e-mdm-cand-1': LONG_CANDIDATE });
    await capture(page, 'match-review-long');
  });
});

test.describe('rules editor', () => {
  test('the kit Dialog, kit tabs and 28px fields; add, edit and remove rules; Save sends once', async ({ page }) => {
    const puts: unknown[] = [];
    const dialog = await openRules(page);
    await page.route((url) => url.pathname === '/api/mdm/configs/e2e-mdm-1', async (route) => {
      // The page reads the configuration again after a save
      if (route.request().method() === 'GET' && puts.length) return route.fulfill({ json: { ...CONFIG, ...(puts[0] as Rec) } });
      if (route.request().method() !== 'PUT') return route.fallback();
      puts.push(route.request().postDataJSON());
      await new Promise((r) => setTimeout(r, 300));
      return route.fulfill({ json: { ...CONFIG, ...(route.request().postDataJSON() as Rec) } });
    });
    await expect(dialog).toHaveClass(/mantine-Modal-content/);
    expect(Math.round((await box(dialog)).width)).toBe(720);
    expect(await style(dialog.getByRole('heading', { name: 'Edit MDM Rules' }), ['font-size', 'color'])).toEqual({ 'font-size': '14px', color: NAVY });
    const matching = dialog.getByRole('tab', { name: 'Matching Rules (2)' });
    await expect(matching).toHaveAttribute('aria-selected', 'true');
    expect(Math.round((await box(matching)).height)).toBe(30);
    await expect(cards(dialog)).toHaveCount(2);

    // Every field of a rule is 28px, in the body font except the identifiers
    const first = cards(dialog).first();
    const name = first.getByRole('textbox', { name: 'Rule name' });
    for (const control of [name, first.getByRole('textbox', { name: 'Type' }), first.getByRole('textbox', { name: 'Fields (comma-separated)' }),
      first.getByRole('spinbutton', { name: 'Weight (0-1)' }), first.getByRole('spinbutton', { name: 'Threshold (0-1)' })]) {
      expect(Math.round((await box(control)).height)).toBe(28);
    }
    expect((await style(first.getByRole('textbox', { name: 'Type' }), ['font-family']))['font-family']).not.toMatch(MONO);
    expect((await style(first.getByRole('textbox', { name: 'Fields (comma-separated)' }), ['font-family']))['font-family']).toMatch(MONO);
    // Two fields a row
    const [w, th] = await Promise.all([box(first.getByRole('spinbutton', { name: 'Weight (0-1)' })), box(first.getByRole('spinbutton', { name: 'Threshold (0-1)' }))]);
    expect(Math.round(w.y)).toBe(Math.round(th.y));
    // The probabilistic rule's algorithm
    await expect(cards(dialog).nth(1).getByRole('textbox', { name: 'Algorithm' })).toHaveValue('Jaro-Winkler');

    // Edit: name, a second field (the comma is kept), type
    await name.fill('Email or phone');
    const fields = first.getByRole('textbox', { name: 'Fields (comma-separated)' });
    await fields.fill('');
    await fields.pressSequentially('email, phone');
    await expect(fields).toHaveValue('email, phone');
    await first.getByRole('textbox', { name: 'Type' }).click();
    await page.getByRole('option', { name: 'Probabilistic (Fuzzy)' }).click();
    await expect(first.getByRole('textbox', { name: 'Algorithm' })).toHaveValue('Jaro-Winkler');
    // Remove the second, add one
    await cards(dialog).nth(1).getByRole('button', { name: 'Remove' }).click();
    await expect(cards(dialog)).toHaveCount(1);
    await dialog.getByRole('button', { name: 'Add Rule' }).click();
    await expect(cards(dialog)).toHaveCount(2);
    await expect(dialog.getByRole('tab', { name: 'Matching Rules (2)' })).toBeVisible();
    await expect(cards(dialog).nth(1).getByRole('textbox', { name: 'Rule name' })).toHaveValue('rule_2');
    await capture(page, 'rules-edited');

    // Survivorship: add one with a priority list, remove the old one
    await dialog.getByRole('tab', { name: 'Survivorship Rules (1)' }).click();
    await expect(dialog.getByText('Define how conflicting values are resolved when merging records')).toBeVisible();
    await dialog.getByRole('button', { name: 'Add Rule' }).click();
    const added = cards(dialog).nth(1);
    await expect(added.getByText('Unnamed Field')).toBeVisible();
    await added.getByRole('textbox', { name: 'Field Name' }).fill('phone');
    await added.getByRole('textbox', { name: 'Strategy' }).click();
    await page.getByRole('option', { name: 'Most Trusted' }).click();
    await added.getByRole('textbox', { name: 'Priority (comma-separated source names)' }).pressSequentially('CRM, Web');
    await cards(dialog).first().getByRole('button', { name: 'Remove' }).click();
    await expect(cards(dialog)).toHaveCount(1);
    await expect(dialog.getByRole('button', { name: 'Save Rules' })).toBeInViewport();
    expect(await noPageScroll(page)).toBe(true);

    await dialog.getByRole('button', { name: 'Save Rules' }).dblclick();
    await expect(dialog).toHaveCount(0);
    expect(puts).toEqual([{
      matching_rules: [
        // The algorithm field shows Jaro-Winkler but sends none until one is picked, as before
        { name: 'Email or phone', type: 'probabilistic', fields: ['email', 'phone'], weight: 1, threshold: 1 },
        { name: 'rule_2', type: 'deterministic', fields: [], weight: 1, threshold: 0.8 },
      ],
      survivorship_rules: [{ field: 'phone', strategy: 'most_trusted', priority: ['CRM', 'Web'] }],
    }]);
    // The page shows the saved rules
    await expect(page.locator('main').getByText('Email or phone')).toBeVisible();
  });

  test('Escape in an open Select closes only the Select, and unsaved edits survive', async ({ page }) => {
    const dialog = await openRules(page);
    const name = cards(dialog).first().getByRole('textbox', { name: 'Rule name' });
    await name.fill('Kept while the list closes');
    for (const [card, label] of [[0, 'Type'], [1, 'Algorithm']] as const) {
      await cards(dialog).nth(card).getByRole('textbox', { name: label }).click();
      const list = page.getByRole('listbox', { name: label });
      await expect(list).toBeVisible();
      await page.keyboard.press('Escape');
      await expect(list).toHaveCount(0);
      await expect(dialog).toBeVisible();
      await expect(name).toHaveValue('Kept while the list closes');
    }
    await page.keyboard.press('Escape');
    await expect(dialog).toHaveCount(0);
    await expect(page.locator('main').getByRole('button', { name: 'Edit Rules' })).toBeFocused();
    // Cancelled: the page and a reopened editor still have the saved rules
    await page.locator('main').getByRole('button', { name: 'Edit Rules' }).click();
    await expect(cards(page.getByRole('dialog', { name: 'Edit MDM Rules' })).first().getByRole('textbox', { name: 'Rule name' })).toHaveValue('Email match');
  });

  test('200-character rule and field names stay in the dialog, with no sideways scroll', async ({ page }) => {
    const dialog = await openRules(page, { '/api/mdm/configs': [LONG_CONFIG], '/api/mdm/configs/e2e-mdm-1': LONG_CONFIG });
    await expect(cards(dialog)).toHaveCount(2);
    for (const card of [cards(dialog).first(), cards(dialog).nth(1)]) {
      const name = card.getByRole('textbox', { name: 'Rule name' });
      expect(Math.round((await box(name)).height)).toBe(28);
      expect(await name.getAttribute('title')).toBe(await name.inputValue());
    }
    expect(await sidewaysOverflow(dialog)).toEqual([]);
    expect(await noPageScroll(page)).toBe(true);
    await dialog.getByRole('tab', { name: 'Survivorship Rules (1)' }).click();
    const tag = cards(dialog).first().getByText(UNBROKEN, { exact: true });
    await expect(tag).toBeVisible();
    expect(await tag.getAttribute('title')).toBe(UNBROKEN);
    expect(await sidewaysOverflow(dialog)).toEqual([]);
    await expect(cards(dialog).first().getByRole('button', { name: 'Remove' })).toBeInViewport();
    expect(await noPageScroll(page)).toBe(true);
  });
});

test.describe('match review in an asset review', () => {
  test('the comparison table, its choices and the payload; the editor keeps its look', async ({ page }) => {
    const puts: unknown[] = [];
    const editor = await openReview(page);
    await page.route((url) => url.pathname === '/api/mdm/candidates/e2e-mdm-cand-1', async (route) => {
      if (route.request().method() !== 'PUT') return route.fallback();
      puts.push(route.request().postDataJSON());
      await new Promise((r) => setTimeout(r, 300));
      return route.fulfill({ json: { ...CANDIDATE, status: 'approved' } });
    });
    // Still the asset review editor's kit Dialog, at its xl width
    await expect(editor).toHaveClass(/mantine-Modal-content/);
    expect(Math.round((await box(editor)).width)).toBe(960);
    await expect(editor.getByRole('heading', { name: 'Match Review' })).toBeVisible();
    await expect(editor.getByText('Confidence Score: 92.5%')).toBeVisible();
    const table = editor.getByRole('table');
    // 28px rows, 12px; field names and values are identifiers or data: mono for the field
    const city = rowOf(editor, 'city');
    expect(Math.round((await box(city)).height)).toBeGreaterThanOrEqual(28);
    expect(Math.round((await box(city)).height)).toBeLessThanOrEqual(34);
    expect((await style(city.getByRole('cell').first(), ['font-size']))['font-size']).toBe('12px');
    expect((await style(city.getByRole('cell').first().getByText('city', { exact: true }), ['font-family']))['font-family']).toMatch(MONO);
    // The chosen side is marked; the other is not
    const master = city.getByRole('cell').nth(1).getByRole('button');
    const source = city.getByRole('cell').nth(3).getByRole('button');
    await expect(master).toHaveAttribute('aria-pressed', 'true');
    const chosenBg = (await style(master, ['background-color']))['background-color'];
    expect(chosenBg).not.toBe((await style(source, ['background-color']))['background-color']);
    // Click the source, then Enter on the master of name
    await source.click();
    await expect(source).toHaveAttribute('aria-pressed', 'true');
    await expect(master).toHaveAttribute('aria-pressed', 'false');
    await rowOf(editor, 'name').getByRole('cell').nth(3).getByRole('button').click();
    await rowOf(editor, 'name').getByRole('cell').nth(1).getByRole('button').press('Enter');
    // Edit a final value
    await rowOf(editor, 'phone').getByRole('cell').nth(4).getByRole('button', { name: 'Edit' }).click();
    const custom = rowOf(editor, 'phone').getByRole('textbox', { name: 'Final Value: phone' });
    await custom.fill('555-0000');
    // The tooltips on the bulk buttons
    await editor.getByRole('button', { name: 'Smart Merge' }).hover();
    await expect(page.getByRole('tooltip')).toHaveText('Fill empty master fields with source values');
    await capture(page, 'match-review-chosen');
    expect(await sidewaysOverflow(table)).toEqual([]);
    expect(await noPageScroll(page)).toBe(true);

    await editor.getByRole('button', { name: 'Approve', exact: true }).dblclick();
    await expect.poll(() => puts.length).toBe(1);
    await page.waitForTimeout(400);
    expect(puts).toEqual([{
      status: 'approved',
      merged_record_data: { golden_id: 'g-1', source_record_id: 'src-1', city: 'Bergen', email: 'ann@example.com', name: 'Ann Lee', phone: '555-0000' },
    }]);
  });

  test('All Master, All Source and Smart Merge choose a whole side', async ({ page }) => {
    const puts: unknown[] = [];
    const editor = await openReview(page);
    await page.route((url) => url.pathname === '/api/mdm/candidates/e2e-mdm-cand-1', (route) => {
      if (route.request().method() !== 'PUT') return route.fallback();
      puts.push(route.request().postDataJSON());
      return route.fulfill({ json: { ...CANDIDATE, status: 'rejected' } });
    });
    const pressed = (field: string, side: 1 | 3) => rowOf(editor, field).getByRole('cell').nth(side).getByRole('button');
    await editor.getByRole('button', { name: 'All Source' }).click();
    for (const f of ['city', 'email', 'name', 'phone']) await expect(pressed(f, 3)).toHaveAttribute('aria-pressed', 'true');
    await editor.getByRole('button', { name: 'All Master' }).click();
    for (const f of ['city', 'email', 'name', 'phone']) await expect(pressed(f, 1)).toHaveAttribute('aria-pressed', 'true');
    await editor.getByRole('button', { name: 'Smart Merge' }).click();
    await expect(pressed('phone', 3)).toHaveAttribute('aria-pressed', 'true');
    await expect(pressed('city', 1)).toHaveAttribute('aria-pressed', 'true');
    // Reject sends only the status
    await editor.getByRole('button', { name: 'Reject' }).click();
    await expect.poll(() => puts.length).toBe(1);
    expect(puts[0]).toEqual({ status: 'rejected' });
  });

  test('a reviewed match shows its final values and who reviewed it, with no choices', async ({ page }) => {
    const editor = await openReview(page, {
      '/api/mdm/candidates/e2e-mdm-cand-1': {
        ...CANDIDATE, status: 'approved', reviewed_by: 'steward@example.com', reviewed_at: '2026-11-08T08:00:00Z',
        merged_record_data: { email: 'ann@example.com', name: 'Ann Beth Lee', phone: '555-1234', city: 'Oslo' },
      },
    });
    await expect(editor.getByText(/This match has already been approved by steward@example.com/)).toBeVisible();
    await expect(editor.getByRole('button', { name: 'Approve', exact: true })).toHaveCount(0);
    await expect(editor.getByRole('button', { name: 'All Master' })).toHaveCount(0);
    await expect(rowOf(editor, 'name').getByRole('cell').nth(4)).toHaveText('Ann Beth Lee');
    await expect(rowOf(editor, 'name').getByRole('cell').nth(1).getByRole('button')).toHaveCount(0);
  });

  test('200-character fields and values wrap in the table, with no sideways scroll', async ({ page }) => {
    const editor = await openReview(page, { '/api/mdm/candidates/e2e-mdm-cand-1': LONG_CANDIDATE });
    const table = editor.getByRole('table');
    const field = table.getByRole('cell').getByText(UNBROKEN, { exact: true }).first();
    await expect(field).toBeVisible();
    expect(await field.getAttribute('title')).toBe(UNBROKEN);
    for (const value of [SPACED, UNBROKEN]) {
      const cell = table.getByRole('button', { name: value }).first();
      await expect(cell).toBeVisible();
      expect(await cell.evaluate((n) => n.scrollWidth <= n.clientWidth + 1)).toBe(true);
    }
    expect(await sidewaysOverflow(editor)).toEqual([]);
    expect(await noPageScroll(page)).toBe(true);
    await expect(editor.getByRole('button', { name: 'Approve', exact: true })).toBeVisible();
    // The matched-on line wraps too
    await expect(editor.getByText(/Matched on/)).toBeVisible();
  });
});
