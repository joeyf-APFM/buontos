/**
 * Assign Owner (wave 2 Task 3, fix round 1) works again when it is reopened
 * in the same mount. The Copy from Team → Assign Owner focus hand-off needs
 * Mantine's real transitions and timers, so it is in
 * tests/e2e/shared-panels.spec.ts.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import { renderWithMantine } from '@/test/utils';
import { AssignOwnerDialog } from './assign-owner-dialog';

const json = (body: unknown) =>
  new Response(JSON.stringify(body), { status: 200, headers: { 'Content-Type': 'application/json' } });

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.includes('/api/business-roles')) return json([{ id: 'r1', name: 'Business Owner', status: 'active' }]);
    return json([]);
  }));
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('AssignOwnerDialog', () => {
  it('Assign Owner can assign again when reopened in the same mount', async () => {
    const props = { objectType: 'data_product' as const, objectId: 'p1', onSuccess: () => {}, onOpenChange: () => {}, initialEmail: 'bea@example.com' };
    const { rerender } = renderWithMantine(<AssignOwnerDialog {...props} open />);
    const assignButton = async () =>
      within(await screen.findByRole('dialog', { name: 'Assign Owner' })).getByRole('button', { name: 'Assign Owner' });
    await waitFor(async () => expect(await assignButton()).toBeEnabled());

    rerender(<AssignOwnerDialog {...props} open={false} />);
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Assign Owner' })).toBeNull());
    rerender(<AssignOwnerDialog {...props} open />);
    // The roles are already loaded; the default role comes back with them
    await waitFor(async () => expect(await assignButton()).toBeEnabled());
  });
});
