/**
 * Wave 2 Task 9: a Data Contract (/data-contracts/:id) on the page kit,
 * measured in a real browser (ruling R10: jsdom ignores the cascade). Full
 * bleed under the shell's breadcrumb; the kit header (a long name truncates
 * with its title, the actions wrap before the page scrolls sideways), the
 * purpose wrapping under it; the error state's way back; the consumer's
 * controls; and the version prompt a 409 opens from a section's form dialog.
 */
import { expect, test, type Locator, type Page } from '@playwright/test';
import { mockApi } from './fixtures/api';
import { DATA_FIXTURES } from './fixtures/data';
import { PERSONAS, type PersonaId } from './fixtures/personas';

const PATH = '/api/data-contracts/e2e-contract-1';
const BASE = DATA_FIXTURES[PATH] as Record<string, unknown>;

// Review Focus 1: a 200-character name and a long purpose
const LONG_NAME = `Quarterly ${'revenue-and-margin-by-region-'.repeat(8)}`.slice(0, 200);
const LONG_PURPOSE = `${'Orders for reporting across every region and channel, refreshed nightly. '.repeat(4)}${'x'.repeat(120)}`.slice(0, 400);

const style = (loc: Locator, props: string[]) =>
  loc.evaluate((el, names) => {
    const cs = getComputedStyle(el);
    return Object.fromEntries(names.map((n) => [n, cs.getPropertyValue(n)]));
  }, props);

const noPageScroll = (page: Page) =>
  page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);

async function open(page: Page, contract: unknown, { persona = 'admin', size, status = 200 }: {
  persona?: PersonaId; size?: 'minimal' | 'medium' | 'large'; status?: number;
} = {}) {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.clock.setFixedTime(new Date('2026-11-09T12:00:00Z'));
  if (size) await page.addInitScript((s) => localStorage.setItem('data-contract-view-mode', s), size);
  await mockApi(page, PERSONAS[persona], { ...DATA_FIXTURES, [PATH]: contract });
  if (status !== 200) {
    await page.route((url) => url.pathname === PATH, (route) =>
      route.fulfill({ status, contentType: 'application/json', body: JSON.stringify({ detail: 'Backend down' }) }));
  }
  await page.goto('/data-contracts/e2e-contract-1');
}

test('full bleed: no layout padding, one breadcrumb (the shell\'s)', async ({ page }) => {
  await open(page, BASE);
  await expect(page.getByRole('heading', { level: 1, name: 'Orders contract' })).toBeVisible();
  const main = page.locator('main');
  expect(await style(main, ['padding-top', 'padding-left'])).toEqual({ 'padding-top': '0px', 'padding-left': '0px' });
  await expect(main.getByRole('navigation', { name: 'Breadcrumb' })).toHaveCount(1);
});

test('a 200-character name truncates with its title, the purpose wraps, and nothing scrolls sideways', async ({ page }) => {
  await open(page, { ...BASE, name: LONG_NAME, description: { purpose: LONG_PURPOSE, usage: LONG_PURPOSE } });
  const title = page.getByRole('heading', { level: 1 });
  await expect(title).toHaveAttribute('title', LONG_NAME);
  expect(await style(title, ['text-overflow', 'white-space', 'overflow-x'])).toEqual({
    'text-overflow': 'ellipsis', 'white-space': 'nowrap', 'overflow-x': 'hidden',
  });
  // Truncated: the text is wider than its box
  expect(await title.evaluate((el) => el.scrollWidth > el.clientWidth)).toBe(true);

  // The purpose under the header: several lines, inside the window
  const purpose = page.locator('main p').filter({ hasText: 'Orders for reporting across' }).first();
  const lineHeight = parseFloat((await style(purpose, ['line-height']))['line-height']);
  const box = (await purpose.boundingBox())!;
  expect(box.height).toBeGreaterThan(lineHeight * 2);
  expect(box.x + box.width).toBeLessThanOrEqual(1280);
  expect(await purpose.evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(true);

  // The Description pane's usage wraps too
  const usage = page.getByRole('region', { name: 'Description' }).locator('dd').last();
  expect(await usage.evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(true);

  // At 1280 and at a narrow 900, the header's actions wrap before the page scrolls
  expect(await noPageScroll(page)).toBe(true);
  await page.setViewportSize({ width: 900, height: 800 });
  expect(await noPageScroll(page)).toBe(true);
  const deleteButton = page.getByRole('main').getByRole('button', { name: 'Delete', exact: true });
  const del = (await deleteButton.boundingBox())!;
  expect(del.x + del.width).toBeLessThanOrEqual(900);
});

test('a contract that fails to load shows its error, and Back to List goes to the list', async ({ page }) => {
  await open(page, BASE, { status: 500 });
  const alert = page.getByRole('main').getByRole('alert');
  await expect(alert).toContainText('Failed to load contract');
  await page.getByRole('button', { name: 'Back to List' }).click();
  await expect(page).toHaveURL(/\/data-contracts$/);
});

test('the consumer has no edit, delete or certify control', async ({ page }) => {
  await open(page, BASE, { persona: 'consumer' });
  const main = page.getByRole('main');
  await expect(main.getByRole('heading', { level: 1, name: 'Orders contract' })).toBeVisible();
  await expect(main.getByRole('button', { name: 'Clone for Editing' })).toBeEnabled();
  for (const name of ['Edit Metadata', 'Delete', 'Certify', 'Publish', 'Approve', 'Reject', 'Edit description']) {
    await expect(main.getByRole('button', { name, exact: true })).toHaveCount(0);
  }
});

test('a 409 from a section\'s form opens the version prompt on top, with focus inside it', async ({ page }) => {
  await open(page, { ...BASE, status: 'draft' }, { size: 'large' });
  await expect(page.getByRole('heading', { level: 1, name: 'Orders contract' })).toBeVisible();
  // The save answers that the change needs a new version
  await page.route((url) => url.pathname === PATH, (route) => {
    if (route.request().method() !== 'PUT') return route.fallback();
    return route.fulfill({
      status: 409,
      contentType: 'application/json',
      body: JSON.stringify({
        detail: {
          requires_versioning: true,
          user_can_override: true,
          change_analysis: {
            change_type: 'breaking', version_bump: 'major', summary: 'The SLA got stricter',
            breaking_changes: ['Uptime target raised'], new_features: [], fixes: [],
          },
        },
      }),
    });
  });

  await page.getByRole('button', { name: 'Edit SLA' }).click();
  const sla = page.getByRole('dialog', { name: /SLA/ });
  await expect(sla).toBeVisible();
  await sla.getByRole('button', { name: 'Save SLA' }).click();

  const prompt = page.getByRole('dialog', { name: 'Changes Detected - Version Recommendation' });
  await expect(prompt).toBeVisible();
  // The form dialog has gone, and it handed focus over rather than taking it back
  await expect(sla).toHaveCount(0);
  await expect.poll(() => prompt.evaluate((el) => el.contains(document.activeElement))).toBe(true);
  // Let any late focus return run, then check again
  await page.waitForTimeout(400);
  expect(await prompt.evaluate((el) => el.contains(document.activeElement))).toBe(true);
  // On top: a real click on its Cancel lands on it
  const cancel = prompt.getByRole('button', { name: 'Cancel' });
  const hit = await cancel.evaluate((el) => {
    const r = el.getBoundingClientRect();
    return el.contains(document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2));
  });
  expect(hit).toBe(true);
  await cancel.click();
  await expect(prompt).toHaveCount(0);
});
