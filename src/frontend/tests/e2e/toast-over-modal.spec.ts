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
