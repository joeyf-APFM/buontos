import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, screen, waitFor, within } from '@testing-library/react';
import { renderWithMantine, userEvent } from '@/test/utils';
import usePermissionsStore from '@/stores/permissions-store';
import { useFeatureVisibilityStore } from '@/stores/feature-visibility-store';
import { FeatureAccessLevel } from '@/types/settings';
import { AppShell } from '@/mantine/shell/app-shell';
import { SHELL_DEFAULTS, useShellStore } from '@/mantine/shell/use-shell-store';
import ExplorerPage from '@/mantine/asset-explorer/explorer-page';
import { json, mockBackend } from '@/mantine/asset-explorer/test-fixtures';
import { HELIX_DEFAULTS, useHelixStore, type HelixConfig } from './helix-store';
import { HelixPanel } from './helix-panel';
import { frame, openStream, sseResponse } from './test-fixtures';

vi.mock('@/components/ui/user-info', () => ({ default: () => null }));
vi.mock('@/components/ui/notification-bell', () => ({ default: () => null }));
vi.mock('@/components/ui/project-chooser', () => ({ ProjectChooser: () => null }));
vi.mock('@/components/common/language-selector', () => ({ LanguageSelector: () => null }));
vi.mock('@/stores/ui-customization-store', () => ({
  useUICustomizationStore: (select: (s: { getShortName: () => string }) => unknown) =>
    select({ getShortName: () => 'APFM' }),
}));

const HOST = 'https://dbc-1.cloud.databricks.com';
const USER_MODE: HelixConfig = { enabled: true, mode: 'user', workspace_host: HOST };

/** Answers each ask with the next queued response; records the bodies sent. */
function mockAsk(...responses: Response[]) {
  const bodies: Record<string, unknown>[] = [];
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    if (String(input) === '/api/helix/ask') {
      bodies.push(JSON.parse(String(init?.body)));
      return responses.shift() ?? sseResponse([frame('done', {})]);
    }
    return json([]);
  });
  vi.stubGlobal('fetch', fetchMock);
  return bodies;
}

const answer = (...frames: string[]) => sseResponse([...frames, frame('done', {})]);
const input = () => screen.getByRole('textbox', { name: 'Ask Helix' });
const answers = () => screen.queryAllByRole('article', { name: 'Helix’s answer' });

function renderPanel(config: HelixConfig = USER_MODE, context: string | null = 'insights.referrals.leads') {
  useHelixStore.setState({ ...HELIX_DEFAULTS, isOpen: true, config, context });
  return renderWithMantine(<HelixPanel />);
}

async function send(user: ReturnType<typeof userEvent.setup>, question: string) {
  await user.type(input(), question);
  await user.keyboard('{Enter}');
}

describe('HelixPanel', () => {
  beforeEach(() => useHelixStore.setState(HELIX_DEFAULTS));
  afterEach(() => vi.unstubAllGlobals());

  it('asks a suggestion with the context', async () => {
    const user = userEvent.setup();
    const bodies = mockAsk(answer(frame('text', { text: 'It lists leads.' })));
    renderPanel();

    await user.click(screen.getByRole('button', { name: 'What’s in this?' }));

    expect(await screen.findByText('It lists leads.')).toBeInTheDocument();
    expect(bodies).toEqual([{ question: 'What’s in this?', context: 'insights.referrals.leads' }]);
    expect(screen.queryByRole('button', { name: 'Who uses this most?' })).toBeNull();
  });

  it('streams text into one answer, with its SQL behind "Show SQL" and a preview of the result', async () => {
    const user = userEvent.setup();
    const rows = Array.from({ length: 7 }, (_, i) => [`day ${i}`, String(i)]);
    mockAsk(
      answer(
        frame('conversation', { conversation_id: 'c1' }),
        frame('sql', { sql: 'SELECT day, n FROM t' }),
        frame('result', { columns: ['day', 'n'], rows, total: '7', warehouse_id: 'w' }),
        frame('text', { text: 'First part.' }),
        frame('text', { text: 'Second part.' }),
      ),
    );
    renderPanel();

    await send(user, 'How many?');

    await waitFor(() => expect(answers()).toHaveLength(1));
    const reply = answers()[0];
    expect(await within(reply).findByText('Second part.')).toBeInTheDocument();
    expect(within(reply).getByText('First part.')).toBeInTheDocument();
    expect(within(reply).getAllByRole('row')).toHaveLength(6); // header + 5
    expect(within(reply).getByText('7 rows')).toBeInTheDocument();

    expect(within(reply).queryByText('SELECT day, n FROM t')).toBeNull();
    await user.click(within(reply).getByRole('button', { name: 'Show SQL' }));
    expect(within(reply).getByText('SELECT day, n FROM t')).toBeInTheDocument();
    await user.click(within(reply).getByRole('button', { name: 'Hide SQL' }));
    expect(within(reply).queryByText('SELECT day, n FROM t')).toBeNull();
  });

  it('shows no preview when the result’s rows or columns are not lists', async () => {
    const user = userEvent.setup();
    mockAsk(answer(frame('result', { columns: ['a'], rows: 'oops', total: '3' }), frame('text', { text: 'Done.' })));
    renderPanel();

    await send(user, 'Q');

    expect(await screen.findByText('Done.')).toBeInTheDocument();
    expect(screen.queryByRole('table')).toBeNull();
  });

  it('sends the conversation id with a follow-up, and "New conversation" clears it', async () => {
    const user = userEvent.setup();
    const bodies = mockAsk(
      answer(frame('conversation', { conversation_id: 'c1' }), frame('text', { text: 'One.' })),
      answer(frame('text', { text: 'Two.' })),
      answer(frame('text', { text: 'Fresh.' })),
    );
    renderPanel(USER_MODE, null);

    await send(user, 'First');
    await screen.findByText('One.');
    await send(user, 'Second');
    await screen.findByText('Two.');
    expect(bodies[0]).toEqual({ question: 'First' });
    expect(bodies[1]).toEqual({ question: 'Second', conversation_id: 'c1' });

    await user.click(screen.getByRole('button', { name: 'New conversation' }));
    expect(screen.queryByText('One.')).toBeNull();
    expect(useHelixStore.getState().conversationId).toBeNull();

    await send(user, 'Third');
    await screen.findByText('Fresh.');
    expect(bodies[2]).toEqual({ question: 'Third' });
  });

  it('keeps the partial answer, shows the error and re-enables the input when the stream fails', async () => {
    const user = userEvent.setup();
    const stream = openStream();
    mockAsk(stream.response);
    renderPanel();

    await send(user, 'How many?');
    act(() => stream.send('text', { text: 'Partial answer.' }));
    expect(await screen.findByText('Partial answer.')).toBeInTheDocument();
    expect(input()).toBeDisabled();

    act(() => {
      stream.send('error', { message: 'Genie One didn’t answer (HTTP 500).' });
      stream.close();
    });

    expect(await screen.findByRole('alert')).toHaveTextContent('Genie One didn’t answer (HTTP 500).');
    expect(screen.getByText('Partial answer.')).toBeInTheDocument();
    expect(input()).toBeEnabled();
  });

  it('stops a running answer with Stop', async () => {
    const user = userEvent.setup();
    const stream = openStream();
    mockAsk(stream.response);
    renderPanel();

    await send(user, 'How many?');
    act(() => stream.send('text', { text: 'Partial answer.' }));
    await screen.findByText('Partial answer.');

    await user.click(screen.getByRole('button', { name: 'Stop' }));

    await waitFor(() => expect(input()).toBeEnabled());
    expect(screen.getByText('Partial answer.')).toBeInTheDocument();
    expect(screen.getByText('Stopped.')).toBeInTheDocument();
  });

  it('shows the error the server gives before streaming', async () => {
    const user = userEvent.setup();
    mockAsk(json({ detail: 'Helix needs your Databricks sign-in.' }, 403));
    renderPanel();

    await send(user, 'How many?');

    expect(await screen.findByRole('alert')).toHaveTextContent('Helix needs your Databricks sign-in.');
    expect(input()).toBeEnabled();
  });

  it('adds a newline with Shift+Enter instead of sending', async () => {
    const user = userEvent.setup();
    const bodies = mockAsk();
    renderPanel();

    await user.type(input(), 'line one{Shift>}{Enter}{/Shift}line two');

    expect(input()).toHaveValue('line one\nline two');
    expect(bodies).toEqual([]);
  });

  it('labels shared mode, and only shared mode', () => {
    const { unmount } = renderPanel({ ...USER_MODE, mode: 'shared' });
    expect(screen.getByText('Answering as APFM Helix, not as you')).toBeInTheDocument();
    unmount();

    renderPanel(USER_MODE);
    expect(screen.getByRole('heading', { name: 'Helix · Genie One' })).toBeInTheDocument();
    expect(screen.queryByText('Answering as APFM Helix, not as you')).toBeNull();
  });

  it('sends no context once the chip is removed', async () => {
    const user = userEvent.setup();
    const bodies = mockAsk(answer(frame('text', { text: 'Answer.' })));
    renderPanel();

    await user.click(screen.getByRole('button', { name: 'Remove context' }));
    expect(screen.queryByText('insights.referrals.leads')).toBeNull();
    await send(user, 'How many?');

    await screen.findByText('Answer.');
    expect(bodies).toEqual([{ question: 'How many?' }]);
  });

  it('closes from its close button', async () => {
    const user = userEvent.setup();
    renderPanel();
    await user.click(screen.getByRole('button', { name: 'Close Helix' }));
    expect(useHelixStore.getState().isOpen).toBe(false);
  });
});

describe('Ask Helix in the shell', () => {
  beforeEach(() => {
    useHelixStore.setState(HELIX_DEFAULTS);
    useShellStore.setState(SHELL_DEFAULTS);
    useFeatureVisibilityStore.setState({ allowedMaturities: ['ga'] });
    usePermissionsStore.setState({
      permissions: { assets: FeatureAccessLevel.READ_WRITE },
      appliedRoleId: null,
      isLoading: false,
      _initAttempted: true,
      _isInitializing: false,
    });
  });
  afterEach(() => vi.unstubAllGlobals());

  const renderExplorer = () =>
    renderWithMantine(
      <AppShell>
        <ExplorerPage />
      </AppShell>,
      { route: '/assets' },
    );

  it('shows no Ask Helix button, and no panel, when Helix is disabled', async () => {
    const fetchMock = mockBackend((url) => (url.pathname === '/api/settings/helix' ? json({ detail: 'Not Found' }, 404) : undefined));
    useHelixStore.setState({ isOpen: true }); // e.g. open when Helix was switched off
    renderExplorer();

    await waitFor(() => expect(fetchMock.mock.calls.some(([u]) => String(u) === '/api/settings/helix')).toBe(true));
    expect(screen.queryByRole('button', { name: 'Ask Helix' })).toBeNull();
    expect(useHelixStore.getState().isOpen).toBe(false);
  });

  it('hides the explorer’s details while Helix is open and brings them back when it closes', async () => {
    const user = userEvent.setup();
    mockBackend((url) => (url.pathname === '/api/settings/helix' ? json(USER_MODE) : undefined));
    renderExplorer();

    await user.click(await within(await screen.findByRole('table')).findByText('leads'));
    expect(await screen.findByRole('complementary', { name: 'leads' })).toBeInTheDocument();

    await user.click(await screen.findByRole('button', { name: 'Ask Helix' }));
    const helix = screen.getByRole('complementary', { name: 'Helix' });
    expect(within(helix).getByText('insights.referrals.leads')).toBeInTheDocument();
    expect(screen.queryByRole('complementary', { name: 'leads' })).toBeNull();

    await user.click(within(helix).getByRole('button', { name: 'Close Helix' }));
    expect(screen.queryByRole('complementary', { name: 'Helix' })).toBeNull();
    expect(screen.getByRole('complementary', { name: 'leads' })).toBeInTheDocument();
  });
});
