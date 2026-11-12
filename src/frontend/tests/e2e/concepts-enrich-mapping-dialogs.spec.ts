/**
 * Wave 2 Task 14: the Enrich and Term Mapping dialogs on the kit Dialog,
 * in a real browser (ruling R10). Escape in the run dialog's asset-type
 * list closes only the list and keeps the typed comment (Review Focus 3);
 * the Suggest matches chain (run, result, review) hands over one dialog at
 * a time and gives focus back to Suggest matches; long concept, term and
 * asset names wrap inside the dialogs (Review Focus 1); each dialog closes
 * on Escape and gives focus back to its opener.
 *
 * CAPTURE=before|after also saves images of the dialogs to
 * .superpowers/sdd/2026-11-10-mantine-restyle-wave-2/task-14-images/.
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test, type Locator, type Page } from '@playwright/test';
import { mockApi } from './fixtures/api';
import { DATA_FIXTURES } from './fixtures/data';
import { ENRICH_MAPPING_FIXTURES, LONG_NAME, UNBROKEN, routeRuns } from './fixtures/enrich-mapping';
import { PERSONAS } from './fixtures/personas';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const IMAGES = path.resolve(HERE, '../../../../.superpowers/sdd/2026-11-10-mantine-restyle-wave-2/task-14-images');
const CAPTURE = process.env.CAPTURE;

const noPageScroll = (page: Page) =>
  page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);

/** Whether `inner` ends inside `outer`, to the pixel. */
async function inside(inner: Locator, outer: Locator) {
  const i = (await inner.boundingBox())!;
  const o = (await outer.boundingBox())!;
  return i.x >= o.x - 1 && i.x + i.width <= o.x + o.width + 1;
}

/** Nothing in the dialog runs out of it sideways. */
const noSidewaysOverflow = (dialog: Locator) =>
  dialog.evaluate((el) => {
    const box = el.getBoundingClientRect();
    return [...el.querySelectorAll('*')].every((child) => {
      const r = child.getBoundingClientRect();
      return r.width === 0 || (r.left >= box.left - 1 && r.right <= box.right + 1);
    });
  });

async function setUp(page: Page, route: string) {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.clock.setFixedTime(new Date('2026-11-09T12:00:00Z'));
  await mockApi(page, PERSONAS.admin, { ...DATA_FIXTURES, ...ENRICH_MAPPING_FIXTURES });
  await routeRuns(page);
  await page.goto(route);
}

async function capture(page: Page, name: string) {
  if (!CAPTURE) return;
  await page.mouse.move(0, 0);
  await page.waitForTimeout(400);
  await page.screenshot({ path: path.join(IMAGES, `${name}-${CAPTURE}.png`), animations: 'disabled', caret: 'hide' });
}

const main = (page: Page) => page.locator('main');

test.describe('captures', () => {
  test('captures the dialogs', async ({ page }) => {
    test.skip(!CAPTURE, 'only with CAPTURE=before|after');
    await setUp(page, '/concepts/mapping');
    await main(page).getByRole('button', { name: 'New run' }).click();
    await expect(page.getByRole('dialog')).toBeVisible();
    await expect(page.getByText('Finance Glossary')).toBeVisible();
    await capture(page, 'run-config');
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog')).toHaveCount(0);

    await setUp(page, '/concepts/enrich');
    await main(page).getByRole('button', { name: 'Review' }).first().click();
    await expect(page.getByRole('dialog')).toBeVisible();
    await page.waitForTimeout(400);
    await capture(page, 'review-suggestions');
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog')).toHaveCount(0);

    await main(page).getByRole('button', { name: '2 pending' }).click();
    await expect(page.getByRole('dialog')).toBeVisible();
    await capture(page, 'pending-tags');
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog')).toHaveCount(0);

    await main(page).getByRole('button', { name: 'Suggest matches' }).click();
    await page.getByRole('button', { name: 'Create run' }).click();
    await expect(page.getByRole('button', { name: 'Review matches' })).toBeVisible();
    await capture(page, 'run-result');
    await page.getByRole('button', { name: 'Review matches' }).click();
    await expect(page.getByText('Term-mapping suggestion')).toBeVisible();
    await capture(page, 'suggestion-review');
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog')).toHaveCount(0);

    await main(page).getByRole('button', { name: 'Suggest matches' }).click();
    await page.getByRole('button', { name: 'Create run' }).click();
    await page.getByRole('button', { name: 'Request review' }).click();
    await expect(page.getByRole('dialog')).toBeVisible();
    await capture(page, 'generate-review');
  });
});

test.describe('concepts-enrich-mapping dialogs', () => {
  test('Escape in the run dialog’s asset-type list closes only the list, and the typed comment survives', async ({ page }) => {
    await setUp(page, '/concepts/mapping');
    const opener = main(page).getByRole('button', { name: 'New run' });
    await opener.click();
    const dialog = page.getByRole('dialog', { name: 'New Term Mapping Run' });
    await expect(dialog).toBeVisible();
    await expect(dialog).toHaveClass(/mantine-Modal-content/);
    const comment = dialog.getByRole('textbox', { name: 'Comment (optional)' });
    await comment.fill('Nightly columns');

    const picker = dialog.getByRole('combobox', { name: /Asset types to match/ });
    await picker.click();
    const list = page.getByRole('listbox');
    await expect(list).toBeVisible();
    await expect(list.getByRole('option', { name: 'Table' })).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(list).toHaveCount(0);
    await expect(dialog).toBeVisible();
    await expect(comment).toHaveValue('Nightly columns');

    // Again from the list's search field, after typing in it
    await picker.click();
    await page.getByPlaceholder('Search asset types...').fill('tab');
    await page.keyboard.press('Escape');
    await expect(page.getByRole('listbox')).toHaveCount(0);
    await expect(dialog).toBeVisible();
    await expect(comment).toHaveValue('Nightly columns');

    // Escape again closes the dialog, and focus goes back to New run
    await page.keyboard.press('Escape');
    await expect(dialog).toHaveCount(0);
    await expect(opener).toBeFocused();
  });

  test('the run dialog’s fields are at the control height, its info marks open on focus, and its long names wrap', async ({ page }) => {
    await setUp(page, '/concepts/mapping');
    await main(page).getByRole('button', { name: 'New run' }).click();
    const dialog = page.getByRole('dialog', { name: 'New Term Mapping Run' });
    await expect(dialog.getByText(LONG_NAME)).toBeVisible();
    for (const field of [dialog.getByRole('spinbutton', { name: 'Limit' }), dialog.getByRole('combobox', { name: /Asset types to match/ })]) {
      expect((await field.boundingBox())!.height).toBeLessThanOrEqual(28);
    }
    // From the keyboard (the dialog was opened by a click): Tab onto the first info mark
    const info = dialog.getByRole('button', { name: /^Select which ontologies to use/ });
    await dialog.getByRole('button', { name: 'Small View' }).focus();
    for (let i = 0; i < 5 && !(await info.evaluate((el) => el === document.activeElement)); i += 1) {
      await page.keyboard.press('Tab');
    }
    await expect(info).toBeFocused();
    await expect(page.getByRole('tooltip')).toBeVisible();
    expect(await noSidewaysOverflow(dialog)).toBe(true);
    expect(await noPageScroll(page)).toBe(true);
  });

  test('Suggest matches runs, sums up, and hands over to the reviewer; Escape gives focus back to Suggest matches', async ({ page }) => {
    await setUp(page, '/concepts/enrich');
    const suggest = main(page).getByRole('button', { name: 'Suggest matches' });
    await suggest.click();
    await page.getByRole('dialog', { name: 'New Term Mapping Run' }).getByRole('button', { name: 'Create run' }).click();

    const result = page.getByRole('dialog', { name: 'Run complete' });
    await expect(result.getByText('Found 2 suggested match(es) to review.')).toBeVisible();
    await expect(page.getByRole('dialog')).toHaveCount(1);
    await result.getByRole('button', { name: 'Review matches' }).click();

    const review = page.getByRole('dialog', { name: /Review suggested matches/ });
    await expect(review.getByText('Term-mapping suggestion')).toBeVisible();
    // One dialog at a time
    await expect(page.getByRole('dialog')).toHaveCount(1);
    await expect(review.getByText(LONG_NAME, { exact: true })).toBeVisible();
    await expect(review.getByText(`main.sales.${UNBROKEN}`, { exact: true })).toBeVisible();
    expect(await noSidewaysOverflow(review)).toBe(true);

    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect(suggest).toBeFocused();
  });

  test('Request review opens the review request; Escape gives focus back to Suggest matches', async ({ page }) => {
    await setUp(page, '/concepts/enrich');
    const suggest = main(page).getByRole('button', { name: 'Suggest matches' });
    await suggest.click();
    await page.getByRole('button', { name: 'Create run' }).click();
    await page.getByRole('dialog', { name: 'Run complete' }).getByRole('button', { name: 'Request review' }).click();
    const request = page.getByRole('dialog', { name: 'Generate Review for Run' });
    await expect(request.getByRole('textbox', { name: 'Reviewer email *' })).toHaveValue('e2e.user@example.com');
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect(suggest).toBeFocused();
  });

  test('a scheme’s review lists long names inside the dialog; Escape gives focus back to its Review button', async ({ page }) => {
    await setUp(page, '/concepts/enrich');
    const row = main(page).getByRole('row').filter({ hasText: 'Finance' });
    const reviewButton = row.getByRole('button', { name: 'Review' });
    await reviewButton.click();
    const review = page.getByRole('dialog', { name: /Review suggested matches/ });
    await expect(review.getByText(LONG_NAME, { exact: true })).toBeVisible();
    const asset = review.getByText(`main.sales.${UNBROKEN}`, { exact: true });
    await expect(asset).toHaveAttribute('title', `main.sales.${UNBROKEN}`);
    expect(await inside(asset, review)).toBe(true);
    expect(await noSidewaysOverflow(review)).toBe(true);
    await expect(review.getByRole('button', { name: 'Accept & apply all 2' })).toBeEnabled();
    await page.keyboard.press('Escape');
    await expect(review).toHaveCount(0);
    await expect(reviewButton).toBeFocused();
  });

  test('the pending tag changes wrap their long names; Escape gives focus back to the count', async ({ page }) => {
    await setUp(page, '/concepts/enrich');
    const opener = main(page).getByRole('button', { name: '2 pending' });
    await opener.click();
    const dialog = page.getByRole('dialog', { name: 'Pending tag changes' });
    await expect(dialog.getByRole('button', { name: LONG_NAME }).first()).toBeVisible();
    await expect(dialog.getByRole('button', { name: UNBROKEN })).toBeVisible();
    expect(await noSidewaysOverflow(dialog)).toBe(true);
    await page.keyboard.press('Escape');
    await expect(dialog).toHaveCount(0);
    await expect(opener).toBeFocused();
  });

  test('Term Mapping’s Generate review opens the request; Escape gives focus back', async ({ page }) => {
    await setUp(page, '/concepts/mapping');
    await main(page).getByRole('button', { name: /1aaaaaaa/ }).click();
    const opener = main(page).getByRole('button', { name: 'Generate review' });
    await opener.click();
    const dialog = page.getByRole('dialog', { name: 'Generate Review for Run' });
    await expect(dialog).toHaveClass(/mantine-Modal-content/);
    await expect(dialog.getByText('2 suggestions will become reviewable assets (2 pending).')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(dialog).toHaveCount(0);
    await expect(opener).toBeFocused();
  });
});
