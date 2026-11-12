/** Owner Consumers loads its data once and then settles. */
import { describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';

const get = vi.fn(async (url: string) => {
  if (url === '/api/data-products') return { data: [{ id: 'p1', name: 'One' }, { id: 'p2', name: 'Two' }] };
  return { data: { subscribers: [] } };
});
// Like the real hook: a new object on every render, stable functions
vi.mock('@/hooks/use-api', () => ({
  useApi: () => ({ get, post: vi.fn(), put: vi.fn(), delete: vi.fn() }),
}));

import OwnerConsumersView from './owner-consumers';

describe('owner consumers', () => {
  it('owner consumers fetches once on mount', async () => {
    render(<OwnerConsumersView />);
    await waitFor(() => expect(get).toHaveBeenCalledTimes(3));
    await new Promise((r) => setTimeout(r, 200));
    expect(screen.getAllByText('One').length).toBeGreaterThan(0);
    // the product list, plus the subscribers of each of the 2 products
    expect(get).toHaveBeenCalledTimes(3);
  });
});
