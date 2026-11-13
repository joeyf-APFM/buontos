/**
 * Wave 3 (Govern) safety net: the restyle check (restyle-check.spec.ts) is only
 * worth something if each Govern page baselines real content. A page that
 * answers "Run not found." or an empty state proves nothing about a restyle.
 * This spec opens each of the seven routes as admin and asserts the content the
 * fixtures in fixtures/govern.ts are meant to give it.
 *
 * Run: npx playwright test -c tests/e2e/playwright.config.ts govern-fixtures --project chrome
 */
import { expect, test, type Page } from '@playwright/test';
import { mockApi } from './fixtures/api';
import { DATA_FIXTURES } from './fixtures/data';
import { PERSONAS } from './fixtures/personas';

test.beforeEach(async ({ page }) => {
  await page.clock.setFixedTime(new Date('2026-11-09T12:00:00Z'));
  await mockApi(page, PERSONAS.admin, DATA_FIXTURES);
});

async function open(page: Page, route: string) {
  await page.goto(route);
  await page.waitForLoadState('networkidle');
  await expect(page.locator('main')).toBeVisible();
}

test('compliance: lists at least two policies, one failing', async ({ page }) => {
  await open(page, '/compliance');
  const main = page.locator('main');
  await expect(main.getByText('Owner assigned')).toBeVisible();
  await expect(main.getByText('PII is tagged')).toBeVisible();
  // The failing one: 64% compliance, below the other policies
  await expect(main.getByText('64%').first()).toBeVisible();
  // A 200-character policy name (Review Focus 1)
  await expect(main.getByText(/^Every data product that holds personal data/)).toBeVisible();
});

test('compliance run details: shows passed and failed results, not "Run not found."', async ({ page }) => {
  await open(page, '/compliance/runs/e2e-run-1');
  const main = page.locator('main');
  await expect(main.getByText('Run not found.')).toHaveCount(0);
  await expect(main.getByText('Run e2e-run-1', { exact: true }).last()).toBeVisible();
  // Failed results are shown first; "Show all" adds the passed ones
  await expect(main.getByText('main.sales.orders', { exact: true })).toBeVisible();
  await expect(main.getByText('Failed').first()).toBeVisible();
  await main.getByRole('button', { name: 'Show all' }).click();
  await expect(main.getByText('Passed').first()).toBeVisible();
  // A 120-character object name (Review Focus 1)
  await expect(main.getByText(/^main\.sales\.customer_lifetime_value/)).toBeVisible();
});

test('policy details: shows its rule, a run history and a metadata panel', async ({ page }) => {
  await open(page, '/compliance/policies/e2e-policy-1');
  const main = page.locator('main');
  await expect(main.getByText('Policy not found')).toHaveCount(0);
  await expect(main.getByText('MATCH (obj:Object) ASSERT obj.owner IS NOT NULL')).toBeVisible();
  await expect(main.getByRole('link', { name: 'Open run details' })).toHaveCount(2);
  await expect(main.getByRole('heading', { name: 'Metadata' })).toBeVisible();
});

test('master data: a configuration with two sources, two matching rules, one run and three candidates', async ({ page }) => {
  await open(page, '/master-data');
  const main = page.locator('main');
  await expect(main.getByText('Customer master')).toBeVisible();
  await main.getByText('Customer master').click();
  await expect(main.getByRole('tab', { name: 'Sources (2)' })).toBeVisible();
  await expect(main.getByRole('tab', { name: 'Match Runs (1)' })).toBeVisible();
  await main.getByRole('tab', { name: 'Match Runs (1)' }).click();
  await main.getByText(/Run e2e-mdm/).first().click();
  await expect(main.getByRole('tab', { name: 'Candidates (3)' })).toBeVisible();
  await main.getByRole('tab', { name: 'Matching Rules' }).click();
  await expect(main.getByText('Email match')).toBeVisible();
  await expect(main.getByText('Name similarity')).toBeVisible();
});

test('security features: lists at least two features', async ({ page }) => {
  await open(page, '/security-features');
  const main = page.locator('main');
  await expect(main.getByText('Regional row filter')).toBeVisible();
  await expect(main.getByText('Mask email addresses')).toBeVisible();
});

test('entitlements: lists two personas; the first has privileges and group assignments', async ({ page }) => {
  await open(page, '/entitlements');
  const main = page.locator('main');
  await expect(main.getByText('Data Steward')).toBeVisible();
  await expect(main.getByText('Analyst', { exact: true })).toBeVisible();
  await main.getByText('Data Steward').click();
  await expect(main.getByText('main.sales.orders')).toBeVisible();
  await expect(main.getByText('MANAGE')).toBeVisible();
  await main.getByRole('tab', { name: 'Group Assignments' }).click();
  await expect(main.getByText('data-stewards')).toBeVisible();
});

test('entitlements sync: lists one configuration and one with a disabled switch', async ({ page }) => {
  await open(page, '/entitlements-sync');
  const main = page.locator('main');
  await expect(main.getByText('Nightly workspace sync')).toBeVisible();
  await expect(main.getByText('Weekly partner sync')).toBeVisible();
  await expect(main.getByText('Enabled', { exact: true })).toHaveCount(1);
  await expect(main.getByText('Disabled', { exact: true })).toHaveCount(1);
  // The disabled one's edit dialog opens with its Switch off
  await main.getByRole('row', { name: /Weekly partner sync/ }).getByRole('button').first().click();
  await expect(page.getByRole('switch')).not.toBeChecked();
});

test('long names: a 200-character policy and a 120-character object', async () => {
  const { GOVERN_FIXTURES } = await import('./fixtures/govern');
  const policies = (GOVERN_FIXTURES['/api/compliance/policies'] as { policies: { name: string }[] }).policies;
  expect(policies.some((p) => p.name.length === 200)).toBe(true);
  const results = (GOVERN_FIXTURES['/api/compliance/runs/e2e-run-1/results'] as (u: URL) => { results: { object_name: string }[] })(
    new URL('http://x/?only_failed=false'),
  ).results;
  expect(results.some((r) => r.object_name.length === 120)).toBe(true);
});
