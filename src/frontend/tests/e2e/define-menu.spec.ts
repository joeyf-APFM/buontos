/**
 * Task 16e: Build → Concepts → Define → Author Concepts, Generate Ontology
 * and Import RDF in a real browser. The third level's indent comes from
 * shell.module.css, where .subSubItem competes with .subItem (R10); and the
 * menu's ?open= link opens the Define page's own dialog. Both personas: the
 * consumer (read-only) has none of the three.
 *
 * CAPTURE=1 also saves images to
 * .superpowers/sdd/2026-11-09-mantine-restyle-waves-0-1/task-16e-images/.
 *
 * Run: npx playwright test -c tests/e2e/playwright.config.ts define-menu
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test, type Locator, type Page } from '@playwright/test';
import { mockApi } from './fixtures/api';
import { DATA_FIXTURES } from './fixtures/data';
import { PERSONAS } from './fixtures/personas';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const IMAGES = path.resolve(HERE, '../../../../.superpowers/sdd/2026-11-09-mantine-restyle-waves-0-1/task-16e-images');
const CAPTURE = !!process.env.CAPTURE;
const DEFINE_CHILDREN = ['Author Concepts', 'Generate Ontology', 'Import RDF'];

const buildPanel = (page: Page) => page.getByRole('navigation', { name: 'Build' });
// The panel's highlight, by id: an open modal hides the rest of the page from the accessibility tree
const highlighted = (page: Page) => page.locator('#shell-group-panel [data-active]');
const paddingLeft = (el: Locator) => el.evaluate((e) => getComputedStyle(e).paddingLeft);

async function openBuild(page: Page, url: string) {
  await page.goto(url);
  // Already a Build page: the strip button opens the panel without navigating
  await page.getByRole('navigation', { name: 'Main menu' }).getByRole('button', { name: 'Build' }).click();
  await expect(buildPanel(page)).toBeVisible();
  await page.waitForLoadState('networkidle');
}

/** The panel alone, or (`below`) the page from the top down to below that element (a dialog). */
async function capture(page: Page, name: string, target: Locator, below = false) {
  if (!CAPTURE) return;
  // Let an opening dialog finish its animation
  await page.waitForTimeout(400);
  const box = (await target.boundingBox())!;
  const clip = below
    ? { x: 0, y: 0, width: Math.min(1800, box.x + box.width + 40), height: box.y + box.height + 20 }
    : { x: box.x, y: box.y, width: box.width, height: Math.min(box.height, 700) };
  await page.screenshot({ path: path.join(IMAGES, `${name}.png`), clip });
}

test('admin: three levels, one indent step each, and Author Concepts opens the New Concept Scheme dialog', async ({ page }) => {
  await mockApi(page, PERSONAS.admin, DATA_FIXTURES);
  await openBuild(page, '/concepts/define');
  const panel = buildPanel(page);
  const define = panel.getByRole('link', { name: 'Define', exact: true });
  await expect(define).toHaveAttribute('aria-expanded', 'false');
  await define.click();
  await expect(define).toHaveAttribute('aria-expanded', 'true');
  await expect(page).toHaveURL(/\/concepts\/define$/);

  // 12px, then one 22px step per depth
  expect(await paddingLeft(panel.getByRole('link', { name: 'Concepts', exact: true }))).toBe('12px');
  expect(await paddingLeft(define)).toBe('34px');
  expect(await paddingLeft(panel.getByRole('link', { name: 'Explore', exact: true }))).toBe('34px');
  for (const name of DEFINE_CHILDREN) expect(await paddingLeft(panel.getByRole('link', { name }))).toBe('56px');
  // Define alone is highlighted on its page
  await expect(highlighted(page)).toHaveText(['Define']);
  await capture(page, 'admin-build-panel-concepts-define-expanded', panel);

  await panel.getByRole('link', { name: 'Author Concepts' }).click();
  await expect(page).toHaveURL(/\/concepts\/define\?open=author$/);
  const dialog = page.getByRole('dialog', { name: 'Create Scheme' });
  await expect(dialog).toBeVisible();
  await expect(highlighted(page)).toHaveText(['Author Concepts']);
  await expect(page.locator('nav[aria-label="Breadcrumb"] li')).toHaveText(
    ['Home', 'Build', 'Concepts', 'Define', 'Author Concepts'].map((c, i) => (i === 0 ? c : new RegExp(`${c}$`))),
  );
  await capture(page, 'admin-author-concepts-dialog-from-menu', dialog, true);

  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
  await expect(page).toHaveURL(/\/concepts\/define$/);
  await expect(highlighted(page)).toHaveText(['Define']);
});

test('admin: a typed ?open=generate URL opens its dialog, and the menu opens Import RDF', async ({ page }) => {
  await mockApi(page, PERSONAS.admin, DATA_FIXTURES);
  // A fresh load: the dialog waits for the permissions, then opens
  await page.goto('/concepts/define?open=generate');
  await expect(page.getByRole('dialog')).toBeVisible();
  await expect(page).toHaveURL(/\?open=generate$/);
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page).toHaveURL(/\/concepts\/define$/);

  await page.getByRole('navigation', { name: 'Main menu' }).getByRole('button', { name: 'Build' }).click();
  await buildPanel(page).getByRole('link', { name: 'Define', exact: true }).click();
  await buildPanel(page).getByRole('link', { name: 'Import RDF' }).click();
  await expect(page).toHaveURL(/\/concepts\/define\?open=import$/);
  await expect(page.getByRole('dialog')).toBeVisible();
  await expect(highlighted(page)).toHaveText(['Import RDF']);
});

test('consumer: Define is a plain page, and ?open=author opens nothing', async ({ page }) => {
  await mockApi(page, PERSONAS.consumer, DATA_FIXTURES);
  await openBuild(page, '/concepts/define?open=author');
  const panel = buildPanel(page);
  await expect(page).toHaveURL(/\/concepts\/define$/);
  await expect(page.getByRole('dialog')).toHaveCount(0);
  const define = panel.getByRole('link', { name: 'Define', exact: true });
  await expect(define).not.toHaveAttribute('aria-expanded');
  for (const name of DEFINE_CHILDREN) await expect(panel.getByRole('link', { name })).toHaveCount(0);
  await expect(highlighted(page)).toHaveText(['Define']);
  await capture(page, 'consumer-build-panel-define-plain', panel);
});
