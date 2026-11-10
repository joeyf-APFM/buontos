/**
 * A toast must stay clickable while a Radix modal is open. Radix sets
 * `body { pointer-events: none }` for a modal; the toasts opt back in.
 */
import { expect, test } from '@playwright/test';
import { mockApi } from './fixtures/api';
import { DATA_FIXTURES } from './fixtures/data';
import { PERSONAS } from './fixtures/personas';

test('toast action and close button are clickable while body has pointer-events: none', async ({ page }) => {
  await mockApi(page, PERSONAS.admin, DATA_FIXTURES);
  await page.goto('/assets');
  await expect(page.locator('main')).toBeVisible();
  await page.evaluate(async () => {
    const style = document.createElement('style');
    style.textContent = 'body { pointer-events: none !important; }';
    document.head.append(style); // what an open Radix modal does
    const { toast } = await import('/src/hooks/use-toast.ts');
    const { ToastAction } = await import('/src/components/ui/toast.tsx');
    const React = await import('/node_modules/.vite/deps/react.js');
    const createElement = (React.default ?? React).createElement;
    (window as unknown as { clicked: number }).clicked = 0;
    toast({
      title: 'Over a modal',
      duration: Infinity,
      action: createElement(ToastAction, { altText: 'Go', onClick: () => { (window as unknown as { clicked: number }).clicked++; } }, 'Go'),
    });
  });
  await page.getByRole('button', { name: 'Go', exact: true }).click({ timeout: 5000 });
  expect(await page.evaluate(() => (window as unknown as { clicked: number }).clicked)).toBe(1);
  await page.locator('[role="status"] button.mantine-CloseButton-root').click({ timeout: 5000 });
  await expect(page.getByText('Over a modal')).toHaveCount(0);
});

/**
 * Ruling R8: clicking a toast's action or close button over an open sheet or
 * dialog leaves it open (the old Radix toast was a Radix layer, so it did).
 * A click elsewhere outside still dismisses them.
 */
for (const scene of ['sheet', 'dismissable-dialog'] as const) {
  test(`a toast click leaves an open ${scene} open`, async ({ page }) => {
    await mockApi(page, PERSONAS.admin, DATA_FIXTURES);
    await page.goto('/assets');
    await expect(page.locator('main')).toBeVisible();
    const harness = '/tests/e2e/fixtures/compound-harness.tsx';
    await page.evaluate(async ([path, name]) => {
      const h = await import(/* @vite-ignore */ path);
      h.mountScene(name);
      h.showToast();
    }, [harness, scene] as const);
    const events = () => page.evaluate(async (path) => (await import(/* @vite-ignore */ path)).events, harness);
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();

    // The modal marks everything outside it aria-hidden, the toasts too (as it
    // did the Radix toast viewport), so find the buttons by markup.
    await page.locator('.mantine-Notifications-root button', { hasText: 'Undo' }).click({ timeout: 5000 });
    expect(await events()).toEqual({ openChanges: [], toastActions: 1 });
    await page.locator('.mantine-Notifications-root button.mantine-CloseButton-root').click({ timeout: 5000 });
    await expect(page.locator('.mantine-Notifications-root', { hasText: 'Saved' })).toHaveCount(0);
    await expect(dialog).toBeVisible();
    expect((await events()).openChanges).toEqual([]);

    await page.mouse.click(20, 200); // on the overlay, outside the content
    await expect(dialog).toHaveCount(0);
    expect((await events()).openChanges).toEqual([false]);
  });
}
