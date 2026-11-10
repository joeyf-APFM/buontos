/** My Requests loads its data once and then settles. */
import { describe, it, expect, vi } from 'vitest';
import { render, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

const get = vi.fn(async () => []);
vi.mock('@/hooks/use-api', () => ({
  useApi: () => ({ get, post: vi.fn(), put: vi.fn(), delete: vi.fn() }),
}));

import MyRequests from './my-requests';

describe('my requests', () => {
  it('my requests fetches once on mount', async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify([]), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    render(<MemoryRouter><MyRequests /></MemoryRouter>);
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    await new Promise((r) => setTimeout(r, 200));
    // one request for the access requests, one for the subscriptions
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(get).toHaveBeenCalledTimes(1);
    vi.unstubAllGlobals();
  });
});
