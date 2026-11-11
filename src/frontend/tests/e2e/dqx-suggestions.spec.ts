/**
 * Wave 2 Task 8a fix round 1 (ruling R37): the DQX suggestions dialog on the
 * contract page is a kit Dialog, so the new-version prompt it opens for a
 * non-draft contract stacks over it in a real browser: visible on top,
 * clickable, focused, and Escape closes only the prompt.
 */
import { expect, test, type Page } from '@playwright/test';
import { mockApi } from './fixtures/api';
import { DATA_FIXTURES } from './fixtures/data';
import { PERSONAS } from './fixtures/personas';

const CREATED = '2026-10-01T09:00:00Z';
const CONTRACT = {
  id: 'e2e-contract-1', name: 'Orders', version: '1.0.0', status: 'active', apiVersion: 'v3.0.2', kind: 'DataContract',
  owner_team_id: null, schema: [], tags: [], customProperties: [], created: CREATED, updated: CREATED,
};
const suggestion = (id: string, property: string) => ({
  id, profile_run_id: 'run-1', contract_id: 'e2e-contract-1', schema_name: 'orders', property_name: property,
  status: 'pending', name: 'not_null', dimension: 'completeness', severity: 'error', rule: `${property} IS NOT NULL`,
});

async function openSuggestions(page: Page) {
  await page.setViewportSize({ width: 1280, height: 800 });
  await mockApi(page, PERSONAS.admin, {
    ...DATA_FIXTURES,
    '/api/data-contracts/e2e-contract-1': CONTRACT,
    '/api/data-contracts/e2e-contract-1/maturity': {
      entity_type: 'DataContract', entity_id: 'e2e-contract-1', entity_name: 'Orders', achieved_level_order: null,
      achieved_level_name: null, total_levels: 0, gates_passed: 0, gates_total: 0, levels: [], evaluated_at: CREATED,
      evaluated_by: null,
    },
    '/api/data-contracts/e2e-contract-1/profile-runs': [
      { id: 'run-1', contract_id: 'e2e-contract-1', status: 'completed', started_at: CREATED, suggestion_counts: { pending: 2 } },
    ],
    '/api/data-contracts/e2e-contract-1/profile-runs/run-1/suggestions': [suggestion('s-1', 'order_id'), suggestion('s-2', 'amount')],
  });
  await page.goto('/data-contracts/e2e-contract-1');
  const review = page.getByRole('button', { name: 'Review Suggestions' });
  await review.click();
  const dqx = page.getByRole('dialog', { name: 'Review Quality Check Suggestions' });
  await expect(dqx).toBeVisible();
  return dqx;
}

test('the DQX dialog is a kit Dialog, and the version prompt it opens stacks on top: clickable, focused, Escape closes only it', async ({ page }) => {
  const dqx = await openSuggestions(page);
  await expect(dqx).toHaveClass(/mantine-Modal-content/);
  await expect(dqx.getByText('2 pending suggestions')).toBeVisible();

  await dqx.getByRole('checkbox', { name: 'Select row' }).first().check();
  await dqx.getByRole('button', { name: 'Accept Selected' }).click();

  // The prompt: on top, with focus inside it (on Cancel, as the Radix AlertDialog)
  const prompt = page.getByRole('alertdialog', { name: 'Create New Version' });
  await expect(prompt).toBeVisible();
  await expect(prompt.getByRole('button', { name: 'Cancel' })).toBeFocused();
  const field = prompt.getByRole('textbox', { name: 'New Version String' });
  // A real click lands on the field (nothing covers it), and typing reaches it
  await field.click();
  await expect(field).toBeFocused();
  await field.fill('2.0.0');
  await expect(field).toHaveValue('2.0.0');

  // Escape closes the prompt alone; the suggestions stay open
  await page.keyboard.press('Escape');
  await expect(prompt).toHaveCount(0);
  await expect(dqx).toBeVisible();
  await expect(dqx.getByRole('checkbox', { name: 'Select row' }).first()).toBeChecked();

  // The next Escape closes the suggestions
  await page.keyboard.press('Escape');
  await expect(dqx).toHaveCount(0);
});

test('accepting through the version prompt sends the new version with the chosen suggestions', async ({ page }) => {
  const dqx = await openSuggestions(page);
  let body: unknown = null;
  await page.route('**/api/data-contracts/e2e-contract-1/suggestions/accept', async (route) => {
    body = route.request().postDataJSON();
    await route.fulfill({ json: { accepted_count: 1 } });
  });
  await dqx.getByRole('checkbox', { name: 'Select row' }).first().check();
  await dqx.getByRole('button', { name: 'Accept Selected' }).click();
  const prompt = page.getByRole('alertdialog', { name: 'Create New Version' });
  await prompt.getByRole('textbox', { name: 'New Version String' }).fill('2.0.0');
  await prompt.getByRole('button', { name: 'Create Version' }).click();
  await expect.poll(() => body).toEqual({ suggestion_ids: ['s-1'], bump_version: { new_version: '2.0.0' } });
  await expect(prompt).toHaveCount(0);
  await expect(dqx).toHaveCount(0);
});
