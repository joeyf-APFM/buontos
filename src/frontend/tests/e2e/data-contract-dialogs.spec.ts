/**
 * Wave 2 Task 11: the Data Contract dialogs on the kit Dialog, in a real
 * browser (ruling R10).
 *
 * - The schema form: the kit look, and Review Focus 3 (Escape in an open
 *   Select closes only the Select, and typed input survives).
 * - Ruling R38: ConceptSelectDialog stays Radix, and opens over the kit schema
 *   form (z 50 over 49): on top, it takes clicks and focus, and Escape closes
 *   only the picker.
 * - The 409 path: a section form that a save answers with 409 hands over to
 *   the version prompt, kit on kit (schema and quality rule; SLA is in
 *   data-contract-details.spec.ts).
 */
import { expect, test, type Locator, type Page } from '@playwright/test';
import { mockApi } from './fixtures/api';
import { DATA_FIXTURES } from './fixtures/data';
import { PERSONAS } from './fixtures/personas';

const WIDE = '/api/data-contracts/e2e-contract-wide';

const CONCEPTS = [
  { value: 'https://example.com/ontology#Customer', label: 'Customer', type: 'class' },
  { value: 'https://example.com/ontology#Order', label: 'Order', type: 'class' },
];

async function openWide(page: Page) {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.clock.setFixedTime(new Date('2026-11-09T12:00:00Z'));
  await page.addInitScript(() => localStorage.setItem('data-contract-view-mode', 'large'));
  await mockApi(page, PERSONAS.admin, {
    ...DATA_FIXTURES,
    '/api/semantic-models/concepts': CONCEPTS,
  });
  await page.goto('/data-contracts/e2e-contract-wide');
  await expect(page.getByRole('heading', { level: 1, name: 'Wide contract' })).toBeVisible();
}

/** The save answers that the change needs a new version. */
async function answer409(page: Page) {
  await page.route((url) => url.pathname === WIDE, (route) => {
    if (route.request().method() !== 'PUT') return route.fallback();
    return route.fulfill({
      status: 409,
      contentType: 'application/json',
      body: JSON.stringify({
        detail: {
          requires_versioning: true,
          user_can_override: true,
          change_analysis: {
            change_type: 'breaking', version_bump: 'major', summary: 'A column changed',
            breaking_changes: ['Column type changed'], new_features: [], fixes: [],
          },
        },
      }),
    });
  });
}

/** A real click at the element's centre lands on it: nothing covers it. */
const onTop = (loc: Locator) =>
  loc.evaluate((el) => {
    const r = el.getBoundingClientRect();
    return el.contains(document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2));
  });

const focusInside = (loc: Locator) => loc.evaluate((el) => el.contains(document.activeElement));

async function openSchemaEdit(page: Page) {
  await page.getByRole('button', { name: 'Edit wide_orders' }).click();
  const dialog = page.getByRole('dialog', { name: 'Edit Schema' });
  await expect(dialog).toBeVisible();
  return dialog;
}

test('the schema form is a kit Dialog, and Escape in its open Select closes only the Select (Review Focus 3)', async ({ page }) => {
  await openWide(page);
  const dialog = await openSchemaEdit(page);
  await expect(dialog).toHaveClass(/mantine-Modal-content/);
  expect((await dialog.boundingBox())!.width).toBe(960);
  const info = dialog.getByRole('region', { name: 'Schema Information' });

  const name = info.getByRole('textbox', { name: /^Name/ });
  await name.fill('wide_orders_v2');
  const type = info.getByRole('textbox', { name: 'Physical Type' });
  expect(await type.evaluate((el) => getComputedStyle(el).height)).toBe('28px');
  await type.click();
  const list = page.getByRole('listbox', { name: 'Physical Type' });
  await expect(list).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(list).toBeHidden();
  await expect(dialog).toBeVisible();
  await expect(name).toHaveValue('wide_orders_v2');

  // The next Escape closes the dialog
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
});

test('a section form closed with Escape gives focus back to its opener', async ({ page }) => {
  await openWide(page);
  const opener = page.getByRole('region', { name: 'Quality Rules (1)' }).getByRole('button', { name: 'Add Rule' });
  await opener.click();
  const dialog = page.getByRole('dialog', { name: 'Add Quality Rule' });
  await expect(dialog).toBeVisible();
  await expect(dialog).toHaveClass(/mantine-Modal-content/);
  expect((await dialog.boundingBox())!.width).toBe(720);
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
  await expect(opener).toBeFocused();
});

test('the Radix concept picker opens over the kit schema form: on top, clickable, focused, Escape closes only it', async ({ page }) => {
  await openWide(page);
  const dialog = await openSchemaEdit(page);
  const info = dialog.getByRole('region', { name: 'Schema Information' });
  await info.getByRole('textbox', { name: /^Name/ }).fill('wide_orders_v2');

  const concepts = dialog.getByRole('group', { name: 'Business Concepts' });
  await concepts.getByRole('button', { name: 'Add Concept' }).click();
  const picker = page.getByRole('dialog', { name: 'Select Business Concept' });
  await expect(picker).toBeVisible();

  // On top (z 50 over the kit's 49), with focus inside it
  const pickerZ = await picker.evaluate((el) => Number(getComputedStyle(el).zIndex));
  // The modal Radix picker hides the rest of the page from assistive tech, the
  // kit dialog included, so it's found by its markup while the picker is open
  const kit = page.locator('.mantine-Modal-content');
  const kitZ = await kit.evaluate((el) => Number(getComputedStyle(el.closest('.mantine-Modal-inner')!).zIndex));
  expect(pickerZ).toBeGreaterThan(kitZ);
  await expect.poll(() => focusInside(picker)).toBe(true);
  // The kit's focus trap doesn't pull focus back over the next frames
  await page.waitForTimeout(300);
  expect(await focusInside(picker)).toBe(true);

  // A real click lands on its search field, and typing reaches it
  const search = picker.getByPlaceholder('Search business concepts...');
  expect(await onTop(search)).toBe(true);
  await search.click();
  await search.pressSequentially('Cust');
  await expect(search).toHaveValue('Cust');
  // Tab moves within the picker, not back into the schema form
  await page.keyboard.press('Tab');
  expect(await focusInside(picker)).toBe(true);
  await page.keyboard.press('Shift+Tab');
  await expect(search).toBeFocused();

  // Escape closes only the picker; the form keeps its input, and focus comes back to the picker's opener
  await page.keyboard.press('Escape');
  await expect(picker).toHaveCount(0);
  await expect(dialog).toBeVisible();
  await expect(info.getByRole('textbox', { name: /^Name/ })).toHaveValue('wide_orders_v2');
  await expect(concepts.getByRole('button', { name: 'Add Concept' })).toBeFocused();

  // A concept picked in the picker lands in the form
  await concepts.getByRole('button', { name: 'Add Concept' }).click();
  await expect(picker).toBeVisible();
  await expect(picker.getByText('Customer', { exact: true })).toBeVisible();
  await picker.getByRole('button', { name: 'Select' }).first().click();
  await expect(picker).toHaveCount(0);
  await expect(concepts.getByText('Customer')).toBeVisible();
  await expect(dialog).toBeVisible();
  await expect(concepts.getByRole('button', { name: 'Add Concept' })).toBeFocused();
});

/** The version prompt, on top of everything, with focus inside it that stays there. */
async function expectPromptOnTop(page: Page, form: Locator) {
  const prompt = page.getByRole('dialog', { name: 'Changes Detected - Version Recommendation' });
  await expect(prompt).toBeVisible();
  // The form dialog has gone, and it handed focus over rather than taking it back
  await expect(form).toHaveCount(0);
  await expect.poll(() => focusInside(prompt)).toBe(true);
  // Let any late focus return run, then check again
  await page.waitForTimeout(400);
  expect(await focusInside(prompt)).toBe(true);
  const cancel = prompt.getByRole('button', { name: 'Cancel' });
  expect(await onTop(cancel)).toBe(true);
  await cancel.click();
  await expect(prompt).toHaveCount(0);
}

test('a 409 from the schema form opens the version prompt on top, with focus inside it', async ({ page }) => {
  await openWide(page);
  await answer409(page);
  const dialog = await openSchemaEdit(page);
  await dialog.getByRole('button', { name: 'Save Changes' }).click();
  await expectPromptOnTop(page, dialog);
});

test('a 409 from the quality rule form opens the version prompt on top, with focus inside it', async ({ page }) => {
  await openWide(page);
  await answer409(page);
  await page.getByRole('region', { name: 'Quality Rules (1)' }).getByRole('button', { name: 'Add Rule' }).click();
  const dialog = page.getByRole('dialog', { name: 'Add Quality Rule' });
  await expect(dialog).toBeVisible();
  await dialog.getByRole('textbox', { name: /Rule Name/ }).fill('Positive amounts');
  await dialog.getByRole('button', { name: 'Add Rule' }).click();
  await expectPromptOnTop(page, dialog);
});

test('the column editor\'s quality check form opens kit on kit over the schema form: on top, Escape closes only it', async ({ page }) => {
  await openWide(page);
  const dialog = await openSchemaEdit(page);
  await dialog.getByRole('tab', { name: 'Quality' }).click();
  const addCheck = dialog.getByRole('button', { name: 'Add Check' });
  await addCheck.click();
  const rule = page.getByRole('dialog', { name: 'Add Quality Rule' });
  await expect(rule).toBeVisible();
  const name = rule.getByRole('textbox', { name: /Rule Name/ });
  expect(await onTop(name)).toBe(true);
  await name.click();
  await name.pressSequentially('No nulls');
  await expect(name).toHaveValue('No nulls');
  await page.keyboard.press('Escape');
  await expect(rule).toHaveCount(0);
  await expect(dialog).toBeVisible();
  await expect(addCheck).toBeFocused();
});

// Part 2: the request dialog, with the shared access fields, and the inline contract create
test('the contract request dialog is a kit Dialog: Escape in its Selects closes only the list, and the typed reason survives', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await mockApi(page, PERSONAS.admin, DATA_FIXTURES);
  await page.goto('/data-contracts/e2e-contract-1');
  const opener = page.getByRole('button', { name: 'Request...' });
  await opener.click();
  const dialog = page.getByRole('dialog', { name: 'Request Action' });
  await expect(dialog).toBeVisible();
  await expect(dialog).toHaveClass(/mantine-Modal-content/);
  expect(Math.round((await dialog.boundingBox())!.width)).toBe(560);

  const type = dialog.getByRole('textbox', { name: 'Request Type *' });
  expect(Math.round((await type.boundingBox())!.height)).toBe(28);
  await type.click();
  await page.getByRole('option', { name: 'Request Access to Contract' }).click();
  const reason = dialog.getByRole('textbox', { name: /Reason for Access/ });
  await reason.fill('Quarterly revenue reporting');

  // The request type list
  await type.click();
  await expect(page.getByRole('option', { name: 'Request Deploy to Unity Catalog' })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('listbox')).toHaveCount(0);
  await expect(dialog).toBeVisible();
  await expect(reason).toHaveValue('Quarterly revenue reporting');

  // The shared access fields' duration list
  await dialog.getByRole('textbox', { name: 'Access Duration' }).click();
  await expect(page.getByRole('listbox')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('listbox')).toHaveCount(0);
  await expect(dialog).toBeVisible();
  await expect(reason).toHaveValue('Quarterly revenue reporting');

  // The next Escape is the dialog's, and focus goes back to its opener
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
  await expect(opener).toBeFocused();
});

test('the inline contract create opens kit on kit over a deliverable\'s form: on top, clickable, Escape closes only it', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.addInitScript(() => localStorage.setItem('data-product-view-mode', 'large'));
  await mockApi(page, PERSONAS.admin, DATA_FIXTURES);
  await page.goto('/data-products/e2e-product-1');
  await page.getByRole('region', { name: /^Deliverables/ }).getByRole('button', { name: 'Add Deliverable' }).click();
  const port = page.getByRole('dialog', { name: 'Add Deliverable' });
  await expect(port).toBeVisible();
  await port.getByRole('radio', { name: 'Create New Contract' }).check();
  const opener = port.getByRole('button', { name: 'Create New Contract' });
  await opener.click();

  const create = page.getByRole('dialog', { name: 'Create New Contract' });
  await expect(create).toBeVisible();
  await expect(create).toHaveClass(/mantine-Modal-content/);
  const name = create.getByRole('textbox', { name: /Contract Name/ });
  await expect(name).toBeFocused();
  expect(await onTop(name)).toBe(true);
  await name.click();
  await name.pressSequentially('Orders');
  await expect(name).toHaveValue('Orders');

  // Escape in its Status list closes only the list
  await create.getByRole('textbox', { name: 'Status' }).click();
  await expect(page.getByRole('listbox')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('listbox')).toHaveCount(0);
  await expect(name).toHaveValue('Orders');

  // The next Escape closes only the create dialog; the deliverable's form stays, and focus goes back to the opener
  await page.keyboard.press('Escape');
  await expect(create).toHaveCount(0);
  await expect(port).toBeVisible();
  await expect(opener).toBeFocused();
});
