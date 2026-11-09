/** The Ask Ontos tab steps aside while the Helix panel is open. */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { HELIX_DEFAULTS, useHelixStore } from '@/mantine/helix/helix-store';
import { useCopilotStore } from '@/stores/copilot-store';
import Layout from './layout';

vi.mock('@/mantine/shell/app-shell', () => ({
  AppShell: ({ children }: { children: React.ReactNode }) => children,
}));
vi.mock('@/components/ui/breadcrumbs', () => ({ Breadcrumbs: () => null }));
vi.mock('@/components/copilot/copilot-panel', () => ({ default: () => null }));
vi.mock('@/stores/ui-customization-store', () => ({
  useUICustomizationStore: (select: (s: { getShortName: () => string }) => unknown) =>
    select({ getShortName: () => 'Ontos' }),
}));

describe('Layout with Helix', () => {
  beforeEach(() => {
    useHelixStore.setState(HELIX_DEFAULTS);
    useCopilotStore.setState({ isOpen: false });
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ db_ok: true, ws_ok: true, warnings: [] }))));
  });
  afterEach(() => vi.unstubAllGlobals());

  it('hides the Ask Ontos tab while Helix is open', async () => {
    render(<Layout>page</Layout>, { wrapper: MemoryRouter });
    await act(async () => {}); // the health check settles
    const tab = () => screen.queryByRole('button', { name: 'Ask Ontos' });
    expect(tab()).toBeInTheDocument();

    act(() => useHelixStore.getState().actions.open());
    expect(tab()).toBeNull();

    act(() => useHelixStore.getState().actions.close());
    expect(tab()).toBeInTheDocument();
  });
});
