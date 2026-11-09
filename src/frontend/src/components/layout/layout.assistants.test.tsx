/** Ask Ontos is a floating window now (R26): the layout has no drawer and no edge tab. */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { useCopilotStore } from '@/stores/copilot-store';
import Layout from './layout';

vi.mock('@/mantine/shell/app-shell', () => ({
  AppShell: ({ children }: { children: React.ReactNode }) => children,
}));
vi.mock('@/components/ui/breadcrumbs', () => ({ Breadcrumbs: () => null }));
vi.mock('@/stores/ui-customization-store', () => ({
  useUICustomizationStore: (select: (s: { getShortName: () => string }) => unknown) =>
    select({ getShortName: () => 'Ontos' }),
}));

describe('Layout without the Ask Ontos drawer', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ db_ok: true, ws_ok: true, warnings: [] }))));
  });
  afterEach(() => vi.unstubAllGlobals());

  it('renders no right-edge tab and no drawer, open or closed', async () => {
    const { container } = render(<Layout>page</Layout>, { wrapper: MemoryRouter });
    await act(async () => {}); // the health check settles
    expect(screen.queryByRole('button', { name: /Ask/ })).toBeNull();

    act(() => useCopilotStore.getState().actions.openPanel());

    expect(screen.queryByRole('button', { name: /Ask/ })).toBeNull();
    expect(screen.queryByRole('separator', { name: /Resize Ask Ontos/ })).toBeNull();
    expect(container.querySelector('[style*="padding-right"]')).toBeNull();
  });
});
