/**
 * Wave 3 Task 8a: the Master Data dialogs (New MDM Configuration, Link Source
 * Contract, Create Match Review) on the kit Dialog, measured in a real browser
 * (ruling R10). The baselines show only the unselected page (ruling R6) and
 * master-data.spec.ts only opens these dialogs, so this spec goes through each
 * dialog's own states: the configuration's form and its rules preview (from
 * the contract, or the defaults), every step of linking a source, creating a
 * review, Escape in an open Select (Review Focus 4) and 200-character names
 * (Review Focus 1).
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

// Review Focus 1: 200-character names, spaced and unbroken
const SPACED = `Customer golden record contract for every region ${'and every partner system '.repeat(8)}`.slice(0, 199) + '.';
const UNBROKEN = 'x'.repeat(200);
const LONG_COLUMN = `customer_${'y'.repeat(191)}`;

const props = (names: string[]) => names.map((name) => ({ name, logicalType: 'string' }));
const RULES = [
  { name: 'email_exact', type: 'exact', fields: ['email'], weight: 1, threshold: 1 },
  { name: 'name_fuzzy', type: 'fuzzy', fields: ['first_name', 'last_name'], weight: 0.6, threshold: 0.85 },
  { name: 'phone', type: 'deterministic', fields: ['phone'], weight: 0.5, threshold: 1 },
  { name: 'postcode', type: 'probabilistic', fields: ['postcode'], weight: 0.3, threshold: 0.9 },
];

const CONTRACT_FIXTURES: Record<string, unknown> = {
  '/api/data-contracts': [
    { id: 'e2e-contract-1', name: 'Orders contract', status: 'active' },
    { id: 'e2e-crm', name: 'CRM contract', status: 'active' },
    { id: 'e2e-web', name: 'Web shop contract', status: 'active' },
    { id: 'e2e-draft', name: 'Draft contract', status: 'draft' },
  ],
  '/api/data-contracts/e2e-contract-1': {
    id: 'e2e-contract-1', name: 'Orders contract', status: 'active',
    schema: [{ name: 'customers', properties: props(['customer_id', 'email', 'full_name', 'phone']) }],
  },
  '/api/data-contracts/e2e-crm': {
    id: 'e2e-crm', name: 'CRM contract', status: 'active',
    schema: [{ name: 'accounts', properties: props(['account_id', 'email_address', 'fullname', 'phone']) }],
    customProperties: {
      mdmMatchingRules: JSON.stringify(RULES),
      mdmSurvivorshipRules: [{ field: 'email', strategy: 'most_trusted' }],
      mdmKeyColumn: 'account_id',
      mdmSourcePriority: 7,
      mdmColumnMappings: { email_address: 'email' },
    },
  },
  '/api/data-contracts/e2e-web': {
    id: 'e2e-web', name: 'Web shop contract', status: 'active',
    schema: [{ name: 'web', properties: props(['web_id', 'email', 'full_name']) }], customProperties: {},
  },
};

const LONG_FIXTURES: Record<string, unknown> = {
  '/api/data-contracts': [
    { id: 'e2e-contract-1', name: 'Orders contract', status: 'active' },
    { id: 'e2e-spaced', name: SPACED, status: 'active' },
    { id: 'e2e-unbroken', name: UNBROKEN, status: 'active' },
  ],
  '/api/data-contracts/e2e-contract-1': {
    id: 'e2e-contract-1', name: 'Orders contract', status: 'active',
    schema: [{ name: 'customers', properties: props([LONG_COLUMN, 'email']) }],
  },
  '/api/data-contracts/e2e-spaced': {
    id: 'e2e-spaced', name: SPACED, status: 'active',
    schema: [{ name: 'wide', properties: props([UNBROKEN, LONG_COLUMN, 'email']) }],
    customProperties: {
      mdmMatchingRules: [{ name: SPACED, type: 'exact', fields: [UNBROKEN], weight: 1, threshold: 1 }],
      mdmColumnMappings: { [UNBROKEN]: LONG_COLUMN },
    },
  },
  '/api/data-contracts/e2e-unbroken': {
    id: 'e2e-unbroken', name: UNBROKEN, status: 'active',
    schema: [{ name: 'wide', properties: props([UNBROKEN, 'email']) }],
    customProperties: { mdmMatchingRules: [{ name: UNBROKEN, type: 'exact', fields: [UNBROKEN], weight: 1, threshold: 1 }] },
  },
};

const style = (loc: Locator, names: string[]) =>
  loc.evaluate((el, n) => {
    const cs = getComputedStyle(el);
    return Object.fromEntries(n.map((p) => [p, cs.getPropertyValue(p)]));
  }, names);

const box = async (loc: Locator) => (await loc.boundingBox())!;

const noPageScroll = (page: Page) =>
  page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);

/**
 * What sticks out sideways in the dialog: elements whose content is wider
 * than their box and that would scroll or spill (inputs scroll their own
 * text, as a field does; a clipped or truncated box is fine). [] is none.
 */
const sidewaysOverflow = (dialog: Locator) =>
  dialog.evaluate((el) => [el, ...Array.from(el.querySelectorAll<HTMLElement>('*'))]
    .filter((n) => {
      const cs = getComputedStyle(n);
      return n.scrollWidth > n.clientWidth + 1 && n.clientWidth > 0 && !['INPUT', 'TEXTAREA'].includes(n.tagName)
        && cs.overflowX !== 'hidden' && cs.overflowX !== 'clip' && cs.textOverflow !== 'ellipsis';
    })
    .map((n) => `${n.tagName}.${n.className} ${n.scrollWidth}>${n.clientWidth}`));

async function setUp(page: Page, extra: Record<string, unknown> = CONTRACT_FIXTURES) {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.clock.setFixedTime(new Date('2026-11-09T12:00:00Z'));
  await mockApi(page, PERSONAS.admin, { ...DATA_FIXTURES, ...extra });
  await page.goto('/master-data');
  await expect(page.getByRole('heading', { level: 1, name: 'Master Data Management' })).toBeVisible();
  await expect(page.locator('main').getByText('Customer master', { exact: true }).first()).toBeVisible();
}

async function capture(page: Page, name: string) {
  if (!CAPTURE) return;
  await page.mouse.move(0, 0);
  await page.waitForTimeout(400);
  await page.screenshot({ path: path.join(IMAGES, `${name}-${CAPTURE}.png`), animations: 'disabled', caret: 'hide' });
}

const newButton = (page: Page) => page.getByRole('button', { name: 'New MDM Configuration' });
const tab = (page: Page, name: string | RegExp) => page.locator('main').getByRole('tab', { name });

async function openConfig(page: Page) {
  await newButton(page).click();
  const dialog = page.getByRole('dialog', { name: 'New MDM Configuration' });
  await expect(dialog).toBeVisible();
  return dialog;
}

async function selectCustomer(page: Page) {
  await page.locator('main').getByRole('listbox', { name: 'MDM Configurations' }).getByRole('option', { name: /Customer master/ }).click();
  await expect(tab(page, 'Sources (2)')).toBeVisible();
}

async function openLink(page: Page) {
  await selectCustomer(page);
  await page.locator('main').getByRole('button', { name: 'Link Source', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Link Source Contract' });
  await expect(dialog).toBeVisible();
  return dialog;
}

/** A Select's field: Mantine's input (role textbox, with a listbox popup). */
const field = (dialog: Locator, name: string | RegExp) => dialog.getByRole('textbox', { name });

/** A Select's open list (the page's own configuration list is a listbox too). */
const listOf = (page: Page, name: string | RegExp) => page.getByRole('listbox', { name });

async function choose(page: Page, dialog: Locator, name: string | RegExp, option: string | RegExp) {
  await field(dialog, name).click();
  await listOf(page, name).getByRole('option', { name: option, exact: typeof option === 'string' }).click();
}

/** A Select's field to click: the old Radix trigger (by its place) before, the Mantine field after. */
const trigger = (page: Page, dialog: Locator, name: string, oldIndex: number) =>
  CAPTURE === 'before' ? dialog.getByRole('combobox').nth(oldIndex) : field(dialog, name);

test.describe('captures', () => {
  test('captures each dialog state', async ({ page }) => {
    test.skip(!CAPTURE, 'only with CAPTURE=before|after');
    await setUp(page);
    let dialog = await openConfig(page);
    await capture(page, 'config-empty');
    await trigger(page, dialog, 'Master Data Contract', 1).click();
    await page.getByRole('option', { name: 'CRM contract' }).click();
    await expect(dialog.getByText(/Loaded 4 matching rules/)).toBeVisible();
    await capture(page, 'config-contract-rules');
    await trigger(page, dialog, 'Master Data Contract', 1).click();
    await page.getByRole('option', { name: 'Web shop contract' }).click();
    await expect(dialog.getByText(/Contract has no MDM rules defined/)).toBeVisible();
    await capture(page, 'config-defaults');
    await dialog.getByRole('button', { name: 'Create Configuration' }).click();
    await capture(page, 'config-errors');
    await dialog.getByRole('button', { name: 'Cancel' }).click();

    dialog = await openLink(page);
    await capture(page, 'link-empty');
    await trigger(page, dialog, 'Source Data Contract', 0).click();
    await page.getByRole('option', { name: 'CRM contract' }).click();
    await expect(dialog.getByText('email_address → email')).toBeVisible();
    await dialog.getByRole('button', { name: 'Suggest' }).click();
    await expect(dialog.getByText('phone → phone')).toBeVisible();
    await capture(page, 'link-mapped');
    await dialog.getByRole('button', { name: 'Cancel' }).click();

    await tab(page, 'Match Runs (1)').click();
    await page.locator('main').getByRole('button', { name: 'Create Review' }).click();
    await expect(page.getByRole('dialog', { name: 'Create Match Review' })).toBeVisible();
    await capture(page, 'review');
    await page.getByRole('dialog', { name: 'Create Match Review' }).getByRole('button', { name: 'Cancel' }).click();

    await setUp(page, LONG_FIXTURES);
    dialog = await openConfig(page);
    await trigger(page, dialog, 'Master Data Contract', 1).click();
    await capture(page, 'long-config-options');
    await page.getByRole('option', { name: SPACED }).click();
    await expect(dialog.getByText(/Loaded 1 matching rules/)).toBeVisible();
    await capture(page, 'long-config');
    await page.keyboard.press('Escape');
    await expect(dialog).toHaveCount(0);
    dialog = await openLink(page);
    await trigger(page, dialog, 'Source Data Contract', 0).click();
    await page.getByRole('option', { name: SPACED }).click();
    await expect(dialog.getByText(`${UNBROKEN} → ${LONG_COLUMN}`)).toBeVisible();
    await capture(page, 'long-link');
  });
});

test.describe('master data dialogs', () => {
  test('New MDM Configuration: the kit Dialog, 28px fields, the form and both rule previews, and Create sends once', async ({ page }) => {
    let posts: unknown[] = [];
    await setUp(page);
    await page.route((url) => url.pathname === '/api/mdm/configs', async (route) => {
      if (route.request().method() !== 'POST') return route.fallback();
      posts.push(route.request().postDataJSON());
      await new Promise((r) => setTimeout(r, 300));
      return route.fulfill({ json: { id: 'e2e-mdm-new', name: 'Partner master' } });
    });
    const dialog = await openConfig(page);
    await expect(dialog).toHaveClass(/mantine-Modal-content/);
    expect(await style(dialog, ['border-top-left-radius'])).toEqual({ 'border-top-left-radius': '8px' });
    expect(Math.round((await box(dialog)).width)).toBe(560);
    const title = dialog.getByRole('heading', { name: 'New MDM Configuration' });
    expect(await style(title, ['font-size', 'color'])).toEqual({ 'font-size': '14px', color: NAVY });
    const name = dialog.getByRole('textbox', { name: 'Configuration Name' });
    await expect(name).toBeFocused();
    for (const control of [name, field(dialog, 'Entity Type'), field(dialog, 'Master Data Contract')]) {
      expect(Math.round((await box(control)).height)).toBe(28);
      expect((await style(control, ['font-family', 'font-size']))).toMatchObject({ 'font-size': '12px' });
      expect((await style(control, ['font-family']))['font-family']).not.toMatch(MONO);
    }
    await expect(field(dialog, 'Entity Type')).toHaveValue('Customer');

    // Required fields, as before
    await dialog.getByRole('button', { name: 'Create Configuration' }).click();
    await expect(dialog.getByText('Name is required')).toBeVisible();
    await expect(dialog.getByText('Master contract is required')).toBeVisible();
    expect(posts).toHaveLength(0);

    // Rules from the contract: the first three and "...and 1 more"
    await choose(page, dialog, 'Master Data Contract', 'CRM contract');
    await expect(dialog.getByText(/Loaded 4 matching rules and 1 survivorship rules/)).toBeVisible();
    await expect(dialog.getByRole('listitem')).toHaveText([
      'email_exact: email (deterministic)', 'name_fuzzy: first_name, last_name (probabilistic)',
      'phone: phone (deterministic)', '...and 1 more',
    ]);
    // Rule names are identifiers, in mono; the heading is prose
    expect((await style(dialog.getByText('Matching Rules:'), ['font-family']))['font-family']).not.toMatch(MONO);
    // The defaults, for a contract without rules
    await choose(page, dialog, 'Master Data Contract', 'Web shop contract');
    await expect(dialog.getByText(/Contract has no MDM rules defined/)).toBeVisible();
    await expect(dialog.getByRole('listitem')).toHaveText(['email_match: email (deterministic)', 'name_fuzzy: customer_name (probabilistic)']);
    await expect(dialog.getByRole('button', { name: 'Create Configuration' })).toBeInViewport();
    expect(await noPageScroll(page)).toBe(true);

    await name.fill('Partner master');
    await choose(page, dialog, 'Entity Type', 'Supplier');
    await dialog.getByRole('button', { name: 'Create Configuration' }).dblclick();
    await expect(dialog).toHaveCount(0);
    expect(posts).toEqual([expect.objectContaining({ name: 'Partner master', entity_type: 'supplier', master_contract_id: 'e2e-web' })]);
    expect((posts[0] as { matching_rules: unknown[] }).matching_rules).toHaveLength(2);
    posts = [];
  });

  test('New MDM Configuration: Escape in an open Select closes only the Select, and unsaved input survives', async ({ page }) => {
    await setUp(page);
    const dialog = await openConfig(page);
    const name = dialog.getByRole('textbox', { name: 'Configuration Name' });
    await name.fill('Supplier golden record');
    const description = dialog.getByRole('textbox', { name: 'Description' });
    await description.fill('Suppliers across ERP and CRM');

    for (const [label, option] of [['Entity Type', 'Product'], ['Master Data Contract', 'CRM contract']] as const) {
      await field(dialog, label).click();
      const list = listOf(page, label);
      await expect(list.getByRole('option', { name: option })).toBeVisible();
      await page.keyboard.press('Escape');
      await expect(list).toHaveCount(0);
      await expect(dialog).toBeVisible();
      await expect(name).toHaveValue('Supplier golden record');
      await expect(description).toHaveValue('Suppliers across ERP and CRM');
    }

    // A chosen option stays chosen, the rules load; the next Escape is the dialog's
    await choose(page, dialog, 'Master Data Contract', 'CRM contract');
    await expect(field(dialog, 'Master Data Contract')).toHaveValue('CRM contract');
    await expect(dialog.getByText(/Loaded 4 matching rules/)).toBeVisible();
    await field(dialog, 'Entity Type').click();
    await expect(listOf(page, 'Entity Type')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(listOf(page, 'Entity Type')).toHaveCount(0);
    await expect(field(dialog, 'Master Data Contract')).toHaveValue('CRM contract');
    await expect(dialog.getByText(/Loaded 4 matching rules/)).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(dialog).toHaveCount(0);
    await expect(newButton(page)).toBeFocused();

    // Opened again, it starts afresh
    const again = await openConfig(page);
    await expect(again.getByRole('textbox', { name: 'Configuration Name' })).toHaveValue('');
    await expect(field(again, 'Master Data Contract')).toHaveValue('');
  });

  test('Link Source Contract: each step, from the source to the mappings, and Link sends once', async ({ page }) => {
    const posts: unknown[] = [];
    await setUp(page);
    await page.route((url) => url.pathname === '/api/mdm/configs/e2e-mdm-1/sources', async (route) => {
      if (route.request().method() !== 'POST') return route.fallback();
      posts.push(route.request().postDataJSON());
      await new Promise((r) => setTimeout(r, 300));
      return route.fulfill({ json: { id: 'e2e-link-new' } });
    });
    const dialog = await openLink(page);
    expect(Math.round((await box(dialog)).width)).toBe(560);
    // Step 1: nothing chosen. The key column and mapping fields wait for a source
    const key = dialog.getByRole('textbox', { name: 'Key Column' });
    await expect(key).toBeDisabled();
    await expect(dialog.getByRole('spinbutton', { name: 'Priority' })).toHaveValue('1');
    await expect(dialog.getByRole('button', { name: 'Suggest' })).toBeDisabled();
    for (const control of [field(dialog, 'Source Data Contract'), key, dialog.getByRole('spinbutton', { name: 'Priority' })]) {
      expect(Math.round((await box(control)).height)).toBe(28);
    }
    // The key column and priority side by side (one read: the dialog may still be moving in)
    const [keyY, priorityY] = await dialog.evaluate((d) =>
      ['key_column', 'priority'].map((id) => Math.round(d.querySelector(`#${id}`)!.getBoundingClientRect().y)));
    expect(keyY).toBe(priorityY);
    // Active contracts other than the master
    await field(dialog, 'Source Data Contract').click();
    await expect(listOf(page, 'Source Data Contract').getByRole('option')).toHaveText(['CRM contract', 'Web shop contract']);
    await page.keyboard.press('Escape');

    // Step 2: a source with MDM settings fills the key column, priority and a mapping
    await choose(page, dialog, 'Source Data Contract', 'CRM contract');
    await expect(dialog.getByText('email_address → email')).toBeVisible();
    await expect(field(dialog, 'Key Column')).toHaveValue('account_id');
    await expect(dialog.getByRole('spinbutton', { name: 'Priority' })).toHaveValue('7');
    await expect(dialog.getByText(/1 column mapping configured/)).toBeVisible();
    // Column names are identifiers, in mono
    expect((await style(dialog.getByText('email_address → email'), ['font-family']))['font-family']).toMatch(MONO);

    // Step 3: Suggest, by name, then fuzzy
    await dialog.getByRole('button', { name: 'Suggest' }).hover();
    await expect(page.getByRole('tooltip')).toHaveText('Auto-suggest mappings using fuzzy column name matching');
    await dialog.getByRole('button', { name: 'Suggest' }).click();
    await expect(dialog.getByText('phone → phone')).toBeVisible();
    await expect(dialog.getByText('fullname → full_name')).toBeVisible();

    // Step 4: remove one, add one back through the two Selects
    await dialog.locator('[data-mapping]', { hasText: 'phone → phone' }).getByRole('button', { name: 'Remove' }).click();
    await expect(dialog.getByText('phone → phone')).toHaveCount(0);
    await expect(dialog.getByRole('button', { name: 'Add', exact: true })).toBeDisabled();
    await choose(page, dialog, 'Source column', 'phone');
    await choose(page, dialog, 'Master column', 'customer_id');
    await dialog.getByRole('button', { name: 'Add', exact: true }).click();
    await expect(dialog.getByText('phone → customer_id')).toBeVisible();
    await expect(field(dialog, 'Source column')).toHaveValue('');
    await capture(page, 'link-steps');
    expect(await noPageScroll(page)).toBe(true);

    // Step 5: Link, with a double click: one request, the dialog closes
    await dialog.getByRole('button', { name: 'Link Source', exact: true }).dblclick();
    await expect(dialog).toHaveCount(0);
    expect(posts).toEqual([{
      source_contract_id: 'e2e-crm', key_column: 'account_id',
      column_mapping: { email_address: 'email', fullname: 'full_name', phone: 'customer_id' }, priority: 7,
    }]);
    await expect(page.locator('main').getByRole('button', { name: 'Link Source', exact: true })).toBeFocused();
  });

  test('Link Source Contract: Escape in an open Select closes only the Select', async ({ page }) => {
    await setUp(page);
    const dialog = await openLink(page);
    await choose(page, dialog, 'Source Data Contract', 'Web shop contract');
    await expect(field(dialog, 'Key Column')).toHaveValue('web_id');
    await dialog.getByRole('spinbutton', { name: 'Priority' }).fill('4');
    await field(dialog, 'Key Column').click();
    await expect(listOf(page, 'Key Column')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(listOf(page, 'Key Column')).toHaveCount(0);
    await expect(dialog).toBeVisible();
    await expect(dialog.getByRole('spinbutton', { name: 'Priority' })).toHaveValue('4');
    await page.keyboard.press('Escape');
    await expect(dialog).toHaveCount(0);
  });

  test('Create Match Review: reviewer and notes, one request on a double click, then the review opens', async ({ page }) => {
    const posts: unknown[] = [];
    await setUp(page);
    await page.route((url) => url.pathname === '/api/mdm/runs/e2e-mdm-run-1/create-review', async (route) => {
      posts.push(route.request().postDataJSON());
      await new Promise((r) => setTimeout(r, 300));
      return route.fulfill({ json: { review_id: 'e2e-review-1', candidate_count: 2 } });
    });
    await selectCustomer(page);
    await tab(page, 'Match Runs (1)').click();
    await page.locator('main').getByRole('button', { name: 'Create Review' }).click();
    const dialog = page.getByRole('dialog', { name: 'Create Match Review' });
    await expect(dialog).toBeVisible();
    expect(Math.round((await box(dialog)).width)).toBe(420);
    await expect(dialog).toContainText('This will create a review request for 2 pending match candidates.');
    const reviewer = dialog.getByRole('textbox', { name: 'Reviewer', exact: true });
    expect(Math.round((await box(reviewer)).height)).toBe(28);
    await dialog.getByRole('button', { name: 'Create Review Request' }).click();
    await expect(dialog.getByText('Valid email is required')).toBeVisible();
    await reviewer.fill('steward@example.com');
    await reviewer.press('Enter');
    await dialog.getByRole('textbox', { name: 'Notes for Reviewer' }).fill('Check the emails');
    expect(await noPageScroll(page)).toBe(true);
    await dialog.getByRole('button', { name: 'Create Review Request' }).dblclick();
    await expect(page).toHaveURL(/\/data-asset-reviews\/e2e-review-1$/);
    expect(posts).toEqual([{ reviewer_email: 'steward@example.com', notes: 'Check the emails' }]);
  });

  test('200-character contract, rule and column names wrap or truncate with a title, with no sideways scroll', async ({ page }) => {
    await setUp(page, LONG_FIXTURES);
    let dialog = await openConfig(page);
    // The options wrap in the list
    await field(dialog, 'Master Data Contract').click();
    for (const name of [SPACED, UNBROKEN]) {
      const option = page.getByRole('option', { name });
      await expect(option).toBeVisible();
      expect(await option.evaluate((n) => n.scrollWidth <= n.clientWidth + 1)).toBe(true);
      expect((await box(option)).height).toBeGreaterThan(28);
    }
    await page.getByRole('option', { name: SPACED }).click();
    // The chosen name stays on the field's line, with the whole of it in its title
    const contract = field(dialog, 'Master Data Contract');
    expect(Math.round((await box(contract)).height)).toBe(28);
    expect(await contract.getAttribute('title')).toBe(SPACED);
    // The rule preview wraps
    await expect(dialog.getByText(/Loaded 1 matching rules/)).toBeVisible();
    const rule = dialog.getByRole('listitem').first();
    expect(await rule.evaluate((n) => n.scrollWidth <= n.clientWidth + 1)).toBe(true);
    expect(await sidewaysOverflow(dialog)).toEqual([]);
    expect(await noPageScroll(page)).toBe(true);
    await choose(page, dialog, 'Master Data Contract', UNBROKEN);
    await expect(dialog.getByRole('listitem').first()).toContainText(UNBROKEN);
    expect(await dialog.getByRole('listitem').first().evaluate((n) => n.scrollWidth <= n.clientWidth + 1)).toBe(true);
    expect(await sidewaysOverflow(dialog)).toEqual([]);
    await dialog.getByRole('button', { name: 'Cancel' }).click();
    await expect(dialog).toHaveCount(0);

    dialog = await openLink(page);
    await choose(page, dialog, 'Source Data Contract', SPACED);
    const mapping = dialog.getByText(`${UNBROKEN} → ${LONG_COLUMN}`);
    await expect(mapping).toBeVisible();
    expect(await mapping.evaluate((n) => n.scrollWidth <= n.clientWidth + 1)).toBe(true);
    await expect(dialog.locator('[data-mapping]').getByRole('button', { name: 'Remove' })).toBeInViewport();
    // A long key column in its field: one line, with a title
    await choose(page, dialog, 'Key Column', UNBROKEN);
    expect(Math.round((await box(field(dialog, 'Key Column'))).height)).toBe(28);
    expect(await field(dialog, 'Key Column').getAttribute('title')).toBe(UNBROKEN);
    await field(dialog, 'Source column').click();
    const option = page.getByRole('option', { name: LONG_COLUMN });
    expect(await option.evaluate((n) => n.scrollWidth <= n.clientWidth + 1)).toBe(true);
    await page.keyboard.press('Escape');
    expect(await sidewaysOverflow(dialog)).toEqual([]);
    expect(await noPageScroll(page)).toBe(true);
    await expect(dialog.getByRole('button', { name: 'Link Source', exact: true })).toBeInViewport();
  });
});
