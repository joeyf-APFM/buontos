import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import { renderWithMantine, userEvent } from '@/test/utils';
import usePermissionsStore from '@/stores/permissions-store';
import { FeatureAccessLevel } from '@/types/settings';
import { json } from '@/mantine/asset-explorer/test-fixtures';
import { HELIX_DEFAULTS, useHelixStore } from '@/mantine/helix/helix-store';
import HelixSettings from './helix-settings';

function grant(level: FeatureAccessLevel) {
  usePermissionsStore.setState({
    permissions: { settings: FeatureAccessLevel.READ_ONLY, 'settings-general': level },
    appliedRoleId: null,
    isLoading: false,
    _initAttempted: true,
    _isInitializing: false,
  });
}

function mockSettings(helix: unknown, helixStatus = 200) {
  const puts: Record<string, unknown>[] = [];
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    if (url === '/api/settings' && init?.method === 'PUT') {
      puts.push(JSON.parse(String(init.body)));
      return json({});
    }
    if (url === '/api/settings') return json({ helix_enabled: helixStatus === 200, llm_enabled: true, llm_endpoint: 'databricks-claude' });
    if (url === '/api/settings/helix') return json(helix, helixStatus);
    return json([]);
  });
  vi.stubGlobal('fetch', fetchMock);
  return puts;
}

describe('HelixSettings', () => {
  beforeEach(() => {
    grant(FeatureAccessLevel.READ_WRITE);
    useHelixStore.setState(HELIX_DEFAULTS);
  });
  afterEach(() => vi.unstubAllGlobals());

  it('shows the current values and the identity mode, read-only', async () => {
    mockSettings({ enabled: true, mode: 'shared', workspace_host: 'h' });
    renderWithMantine(<HelixSettings />, { route: '/settings/helix' });

    expect(await screen.findByRole('switch', { name: 'Enable Ask Helix' })).toBeChecked();
    expect(await screen.findByText('A shared identity, APFM Helix')).toBeInTheDocument();
    expect(screen.getByRole('switch', { name: 'Enable LLM features' })).toBeChecked();
    expect(screen.getByRole('textbox', { name: 'Serving endpoint' })).toHaveValue('databricks-claude');
  });

  it('saves the Helix switch and the LLM keys the General page writes', async () => {
    const user = userEvent.setup();
    const puts = mockSettings({ enabled: true, mode: 'user', workspace_host: 'h' });
    renderWithMantine(<HelixSettings />, { route: '/settings/helix' });

    const helix = await screen.findByRole('switch', { name: 'Enable Ask Helix' });
    await waitFor(() => expect(helix).toBeChecked());
    await user.click(helix);
    await user.clear(screen.getByRole('textbox', { name: 'Serving endpoint' }));
    await user.type(screen.getByRole('textbox', { name: 'Serving endpoint' }), 'other-endpoint');
    await user.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(puts).toEqual([{ helix_enabled: false, llm_enabled: true, llm_endpoint: 'other-endpoint' }]));
  });

  it('is read-only without write access', async () => {
    grant(FeatureAccessLevel.READ_ONLY);
    mockSettings({ enabled: true, mode: 'user', workspace_host: 'h' });
    renderWithMantine(<HelixSettings />, { route: '/settings/helix' });

    expect(await screen.findByRole('switch', { name: 'Enable Ask Helix' })).toBeDisabled();
    expect(screen.queryByRole('button', { name: 'Save' })).toBeNull();
  });
});
