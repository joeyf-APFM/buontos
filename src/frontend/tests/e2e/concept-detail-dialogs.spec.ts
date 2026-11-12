/**
 * Wave 2 Task 15: the concept detail page's dialogs on the kit Dialog, and
 * ConceptSelectDialog on the kit (rulings R36, R38), in a real browser
 * (ruling R10).
 *
 * - Request, Submit for review, Save new version and Deprecate: the kit look, and Review Focus 3 (Escape in an open Select or
 *   picker closes only that layer, and the input survives). The dialogs the
 *   Request dialog hands over to give focus back to Request. (Request
 *   changes can't be reached from the page, at BASE or now: the Request
 *   dialog offers only forward steps.)
 * - The linked entities' Add and Remove dialogs.
 * - The stacking rule: the kit picker opened from the kit Deprecate dialog,
 *   and from the pages that open it (asset, product and contract details),
 *   is on top, takes focus, and closes alone on Escape.
 *
 * CAPTURE=before|after also saves images of the dialogs to
 * .superpowers/sdd/2026-11-10-mantine-restyle-wave-2/task-15-images/.
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test, type Locator, type Page } from '@playwright/test';
import { mockApi } from './fixtures/api';
import { DATA_FIXTURES } from './fixtures/data';
import { conceptDetailFixtures } from './fixtures/concept-detail';
import { PERSONAS } from './fixtures/personas';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const IMAGES = path.resolve(HERE, '../../../../.superpowers/sdd/2026-11-10-mantine-restyle-wave-2/task-15-images');
const CAPTURE = process.env.CAPTURE;

const IRI = 'urn:e2e:concept:Customer';

/** A real click at the element's centre lands on it: nothing covers it. */
const onTop = (loc: Locator) =>
  loc.evaluate((el) => {
    const r = el.getBoundingClientRect();
    const hit = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
    return !!hit && (hit === el || el.contains(hit));
  });

const focusInside = (loc: Locator) => loc.evaluate((el) => el.contains(document.activeElement));

async function setUp(page: Page, status = 'draft', extra: Record<string, unknown> = {}) {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.clock.setFixedTime(new Date('2026-11-09T12:00:00Z'));
  await mockApi(page, PERSONAS.admin, { ...DATA_FIXTURES, ...conceptDetailFixtures({ concept: { status } }), ...extra });
  await page.goto(`/concepts/browser/${encodeURIComponent(IRI)}`);
  await expect(page.locator('main').getByText('Sales orders')).toBeVisible();
}

async function capture(page: Page, name: string) {
  if (!CAPTURE) return;
  await page.mouse.move(0, 0);
  await page.waitForTimeout(400);
  await page.screenshot({ path: path.join(IMAGES, `${name}-${CAPTURE}.png`), animations: 'disabled', caret: 'hide' });
}

const requestButton = (page: Page) => page.locator('main').getByRole('button', { name: 'Request', exact: true });

/** Opens Request, picks `action` in its Select, and confirms with `confirm`. */
async function request(page: Page, action: string | null, confirm: string) {
  await requestButton(page).click();
  const dialog = page.getByRole('dialog', { name: 'Request Action' });
  await expect(dialog).toBeVisible();
  if (action) {
    await dialog.getByRole('textbox', { name: 'What do you want to request?' }).click();
    await page.getByRole('option', { name: action, exact: true }).click();
  }
  await dialog.getByRole('button', { name: confirm, exact: true }).click();
  await expect(dialog).toHaveCount(0);
}

test.describe('captures', () => {
  test('captures the dialogs', async ({ page }) => {
    test.skip(!CAPTURE, 'only with CAPTURE=before|after');
    await setUp(page, 'certified');
    await requestButton(page).click();
    await capture(page, 'request-action');
    await page.keyboard.press('Escape');
    await request(page, 'Deprecate', 'Deprecate');
    await capture(page, 'deprecate');
    await page.getByRole('button', { name: '+ Add successor' }).click();
    await page.waitForTimeout(500);
    await capture(page, 'deprecate-picker');
    await page.keyboard.press('Escape');
    await page.keyboard.press('Escape');

    await setUp(page, 'published');
    await request(page, 'New Version', 'Create New Version');
    await capture(page, 'publish-version');
    await page.keyboard.press('Escape');

    await setUp(page, 'draft');
    await request(page, null, 'Request Review');
    await capture(page, 'submit-review');
    await page.keyboard.press('Escape');

    // By test id, which BASE has too
    await page.getByTestId('linked-objects-assign-button').click();
    await capture(page, 'linked-add');
    await page.keyboard.press('Escape');
    await page.getByTestId('linked-object-remove-link-1').click({ force: true });
    await capture(page, 'linked-remove');
  });
});

test.describe('concept-detail dialogs', () => {
  test('Request is a kit Dialog; Escape in its Select closes only the list', async ({ page }) => {
    await setUp(page, 'published');
    await requestButton(page).click();
    const dialog = page.getByRole('dialog', { name: 'Request Action' });
    await expect(dialog).toHaveClass(/mantine-Modal-content/);
    const select = dialog.getByRole('textbox', { name: 'What do you want to request?' });
    expect(Math.round((await select.boundingBox())!.height)).toBeLessThanOrEqual(28);
    await select.click();
    await page.getByRole('option', { name: 'New Version', exact: true }).click();
    await expect(dialog.getByTestId('request-concept-action-body')).toContainText('Save a new version');
    await select.click();
    const list = page.getByRole('listbox');
    await expect(list).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(list).toBeHidden();
    await expect(dialog).toBeVisible();
    await expect(select).toHaveValue('New Version');
    await page.keyboard.press('Escape');
    await expect(dialog).toHaveCount(0);
    await expect(requestButton(page)).toBeFocused();
  });

  test('Save new version is a kit Dialog; its text survives, it saves, and focus goes back to Request', async ({ page }) => {
    let body: unknown = null;
    await setUp(page, 'published');
    await page.route((url) => url.pathname === '/api/semantic-models/concepts/version/publish', async (route) => {
      body = route.request().postDataJSON();
      await route.fulfill({ json: { iri: IRI, new_version: 3, is_current: true } });
    });
    await request(page, 'New Version', 'Create New Version');
    const dialog = page.getByRole('dialog', { name: 'Save new version' });
    await expect(dialog).toHaveClass(/mantine-Modal-content/);
    const definition = dialog.getByRole('textbox', { name: 'Definition' });
    await expect(definition).toBeFocused();
    await definition.fill('A party that buys from us.');
    await dialog.getByRole('textbox', { name: /What changed/ }).fill('Shorter');
    expect(await onTop(definition)).toBe(true);
    await dialog.getByRole('button', { name: 'Save new version' }).click();
    await expect(dialog).toHaveCount(0);
    expect(body).toEqual({ iri: IRI, changes: { definition: 'A party that buys from us.' }, change_note: 'Shorter' });
    await expect(page.getByText('New version saved')).toBeVisible();
    await expect(requestButton(page)).toBeFocused();
  });

  test('Submit for review is a kit Dialog; Escape in its reviewer picker closes only the picker', async ({ page }) => {
    await setUp(page, 'draft', {
      '/api/directory/status': { configured: true, provider_type: 'scim', connection_name: 'e2e' },
      '/api/directory/search': { results: [{ type: 'user', id: 'reviewer@example.com', display_name: 'Rita Reviewer', secondary: 'reviewer@example.com' }] },
    });
    await request(page, null, 'Request Review');
    const dialog = page.getByRole('dialog', { name: 'Submit for Review' });
    await expect(dialog).toHaveClass(/mantine-Modal-content/);
    await expect(dialog.getByText(/No approval workflow is attached/)).toBeVisible();
    const notes = dialog.getByRole('textbox', { name: 'Notes (optional)' });
    await notes.fill('Please check the wording');
    const reviewer = dialog.getByRole('textbox', { name: 'Reviewer (optional)' });
    await reviewer.click();
    await reviewer.pressSequentially('Rit');
    const results = page.getByText('Rita Reviewer');
    await expect(results).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(results).toBeHidden();
    await expect(dialog).toBeVisible();
    await expect(notes).toHaveValue('Please check the wording');
    await expect(reviewer).toHaveValue('Rit');
    await page.keyboard.press('Escape');
    await expect(dialog).toHaveCount(0);
    await expect(requestButton(page)).toBeFocused();
  });

  test('Deprecate is a kit alertdialog; its kit picker opens on top, takes focus, and Escape closes only the picker', async ({ page }) => {
    let body: unknown = null;
    await setUp(page, 'certified');
    await page.route((url) => url.pathname === '/api/semantic-models/concepts/deprecate', async (route) => {
      body = route.request().postDataJSON();
      await route.fulfill({ json: {} });
    });
    await request(page, 'Deprecate', 'Deprecate');
    const dialog = page.getByRole('alertdialog', { name: 'Deprecate concept' });
    await expect(dialog).toHaveClass(/mantine-Modal-content/);

    const add = dialog.getByRole('button', { name: '+ Add successor' });
    await add.click();
    const picker = page.getByRole('dialog', { name: 'Select Business Concept' });
    await expect(picker).toBeVisible();
    await expect(picker).toHaveClass(/mantine-Modal-content/);
    const search = picker.getByPlaceholder('Search business concepts...');
    expect(await onTop(search)).toBe(true);
    await expect.poll(() => focusInside(picker)).toBe(true);
    await page.waitForTimeout(300);
    expect(await focusInside(picker)).toBe(true);
    await search.click();
    await search.pressSequentially('Acc');
    await expect(search).toHaveValue('Acc');

    // Escape closes only the picker; focus goes back to Add successor
    await page.keyboard.press('Escape');
    await expect(picker).toHaveCount(0);
    await expect(dialog).toBeVisible();
    await expect(add).toBeFocused();

    // A pick lands in the dialog, and survives the next picker's Escape
    await add.click();
    await expect(picker.getByText('Account', { exact: true })).toBeVisible();
    await picker.getByRole('button', { name: 'Select' }).first().click();
    await expect(picker).toHaveCount(0);
    await expect(dialog.getByText('urn:e2e:concept:Account')).toBeVisible();
    await add.click();
    await expect(picker).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(picker).toHaveCount(0);
    await expect(dialog.getByText('urn:e2e:concept:Account')).toBeVisible();

    await dialog.getByRole('button', { name: 'Deprecate', exact: true }).click();
    await expect(dialog).toHaveCount(0);
    expect(body).toEqual({ iri: IRI, replaced_by: ['urn:e2e:concept:Account'] });
    await expect(requestButton(page)).toBeFocused();
  });

  test('Add a linked entity: a kit Dialog, Escape in its Select closes only the list, and Assign links it', async ({ page }) => {
    let body: unknown = null;
    await setUp(page);
    await page.route((url) => url.pathname === '/api/semantic-links/', async (route) => {
      body = route.request().postDataJSON();
      await route.fulfill({ json: { id: 'link-3' } });
    });
    const linked = page.locator('main').getByRole('region', { name: 'Linked Entities', exact: true });
    const add = linked.getByRole('button', { name: 'Add', exact: true });
    await add.click();
    const dialog = page.getByRole('dialog', { name: 'Assign Object to Concept' });
    await expect(dialog).toHaveClass(/mantine-Modal-content/);
    const type = dialog.getByRole('textbox', { name: 'Entity Type' });
    await type.click();
    await expect(page.getByRole('listbox')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.getByRole('listbox')).toBeHidden();
    await expect(dialog).toBeVisible();
    await type.click();
    await page.getByRole('option', { name: 'Data Product' }).click();
    const entity = dialog.getByRole('textbox', { name: 'Data Product' });
    await entity.click();
    await page.getByRole('option', { name: /^Sales orders/ }).click();
    await dialog.getByRole('button', { name: 'Assign' }).click();
    await expect(dialog).toHaveCount(0);
    expect(body).toEqual({ entity_id: 'e2e-product-1', entity_type: 'data_product', iri: IRI });
    await expect(add).toBeFocused();
  });

  test('Remove a linked entity asks in a kit alertdialog; a failure keeps it open with no success toast', async ({ page }) => {
    let fail = true;
    await setUp(page);
    await page.route((url) => url.pathname === '/api/semantic-links/link-1', async (route) => {
      if (fail) return route.fulfill({ status: 500, json: { detail: 'Link store is down' } });
      return route.fulfill({ json: {} });
    });
    const linked = page.locator('main').getByRole('region', { name: 'Linked Entities', exact: true });
    const remove = linked.getByRole('button', { name: 'Remove linked entity' }).first();
    await remove.focus();
    await page.keyboard.press('Enter');
    const dialog = page.getByRole('alertdialog', { name: 'Remove this link?' });
    await expect(dialog).toHaveClass(/mantine-Modal-content/);
    await expect(dialog).toContainText('Sales orders');
    await dialog.getByRole('button', { name: 'Remove' }).click();
    await expect(page.getByText('Link store is down')).toBeVisible();
    await expect(dialog).toBeVisible();
    await expect(page.getByText(/Removed link to/)).toHaveCount(0);
    fail = false;
    await dialog.getByRole('button', { name: 'Remove' }).click();
    await expect(dialog).toHaveCount(0);
    await expect(page.getByText('Removed link to "Sales orders".')).toBeVisible();
  });
});

// The stacking rule for ConceptSelectDialog's page openers: the kit picker is
// on top, takes focus, and closes alone on Escape, with focus back on Add
test.describe('ConceptSelectDialog from the pages', () => {
  const PAGES = [
    { name: 'asset detail', route: '/assets/e2e-asset-1' },
    { name: 'data product details', route: '/data-products/e2e-product-1' },
    { name: 'data contract details', route: '/data-contracts/e2e-contract-1' },
  ];
  for (const { name, route } of PAGES) {
    test(`${name}: the kit picker opens on top of the page, takes focus, and Escape closes it`, async ({ page }) => {
      await page.setViewportSize({ width: 1280, height: 800 });
      await page.clock.setFixedTime(new Date('2026-11-09T12:00:00Z'));
      await mockApi(page, PERSONAS.admin, {
        ...DATA_FIXTURES,
        '/api/semantic-models/concepts': [{ value: 'urn:e2e:concept:Account', label: 'Account', type: 'class' }],
      });
      await page.goto(route);
      const details = page.locator('main').getByRole('region', { name: 'Details', exact: true });
      const add = details.getByRole('button', { name: 'Add', exact: true });
      await add.click();
      const picker = page.getByRole('dialog', { name: 'Select Business Concept' });
      await expect(picker).toBeVisible();
      await expect(picker).toHaveClass(/mantine-Modal-content/);
      const search = picker.getByPlaceholder('Search business concepts...');
      expect(await onTop(search)).toBe(true);
      await expect.poll(() => focusInside(picker)).toBe(true);
      await search.click();
      await search.pressSequentially('Acc');
      await expect(search).toHaveValue('Acc');
      await page.keyboard.press('Escape');
      await expect(picker).toHaveCount(0);
      await expect(add).toBeFocused();
    });
  }
});
