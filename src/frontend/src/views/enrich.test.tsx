import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, within, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

// ---------------------------------------------------------------------------
// Enrich view tests — assert the two-lane frame wiring, not backend behavior:
//  - Map lane renders the coverage matrix (scheme rows + totals),
//  - Review opens the inline modal (no navigation),
//  - Deliver lane renders Tags(Live) / Column descriptions(Planned) /
//    UC Glossary(Coming),
//  - The L (advanced) view reveals the Direct/Indirect/Manual mode cards; S hides.
// ---------------------------------------------------------------------------

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, defOrOpts?: any, maybeOpts?: any) => {
      // Signature used here: t(key, defaultString, options) OR t(key, options).
      let def: string | undefined;
      let opts: Record<string, any> | undefined;
      if (typeof defOrOpts === 'string') {
        def = defOrOpts;
        opts = maybeOpts;
      } else if (defOrOpts && typeof defOrOpts === 'object') {
        opts = defOrOpts;
      }
      let out = def ?? key;
      if (opts) {
        for (const [k, v] of Object.entries(opts)) {
          out = out.replace(new RegExp(`{{${k}}}`, 'g'), String(v));
        }
      }
      return out;
    },
    i18n: { language: 'en', changeLanguage: vi.fn() },
  }),
  Trans: ({ children }: any) => children,
}));

vi.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast: vi.fn() }) }));

vi.mock('@/stores/permissions-store', () => ({
  usePermissions: () => ({ hasPermission: () => true }),
}));

// The shared reviewer talks to live endpoints; stub it so the modal renders
// without network. The Enrich modal only mounts it when live FQNs exist, which
// these tests don't provide, but stub defensively.
vi.mock('@/components/term-mapping/suggestion-review', () => ({
  default: () => <div data-testid="shared-reviewer" />,
}));

import EnrichView from './enrich';
import { ConceptModeSwitch } from '@/components/concepts/mode-switch';

// EnrichView mounts dialogs that use useNavigate (Suggest matches routes to the
// Review Board), so it needs a Router in tests even when those dialogs are closed.
// (src/test/setup.ts already wraps every render in a MantineProvider.)
const renderEnrich = () => render(<EnrichView />, { wrapper: MemoryRouter });

// Every endpoint is unavailable, so the frame shows its sample rows. Once the
// coverage load has failed, its notice offers Retry: the page has settled.
const settled = () => screen.findByRole('button', { name: 'Retry' });

describe('EnrichView', () => {
  beforeEach(() => {
    try {
      localStorage.clear();
    } catch {
      /* ignore */
    }
    vi.stubGlobal('fetch', vi.fn(async () => new Response('{}', { status: 503 })));
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('renders both lanes and the coverage matrix', async () => {
    renderEnrich();
    await settled();
    expect(screen.getByText('Map')).toBeInTheDocument();
    expect(screen.getByText('Deliver')).toBeInTheDocument();
    // Coverage rows + totals.
    expect(screen.getByText('Finance')).toBeInTheDocument();
    expect(screen.getByText('Logistics')).toBeInTheDocument();
    expect(screen.getByText('All selected')).toBeInTheDocument();
  });

  it('renders delivery targets with correct status badges', async () => {
    renderEnrich();
    await settled();
    expect(screen.getByText('Tags')).toBeInTheDocument();
    expect(screen.getByText('Live')).toBeInTheDocument();
    expect(screen.getByText('Column descriptions')).toBeInTheDocument();
    expect(screen.getByText('Planned')).toBeInTheDocument();
    expect(screen.getByText('UC Glossary')).toBeInTheDocument();
    expect(screen.getByText('Coming')).toBeInTheDocument();
  });

  it('opens the inline review modal without navigating', async () => {
    renderEnrich();
    await settled();
    const reviewButtons = screen.getAllByRole('button', { name: 'Review' });
    fireEvent.click(reviewButtons[0]);
    // Dialog title is the inline review header.
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText('Review suggested matches')).toBeInTheDocument();
    // A placeholder suggestion from the Finance scheme is shown in-place.
    expect(within(dialog).getByText('Payment Term')).toBeInTheDocument();
  });

  it('reveals delivery-mode cards only in advanced view', async () => {
    // The Simple/Advanced switch now lives in the Concepts layout (shared),
    // not inside EnrichView. Render the switch alongside so toggling it drives
    // the same shared mode store EnrichView reads.
    render(
      <MemoryRouter>
        <ConceptModeSwitch />
        <EnrichView />
      </MemoryRouter>,
    );
    await settled();
    // Simple (default): mode cards hidden.
    expect(screen.queryByText('Direct')).not.toBeInTheDocument();
    // Switch to advanced.
    fireEvent.click(screen.getByRole('button', { name: /^Large View/ }));
    expect(screen.getByText('Direct')).toBeInTheDocument();
    expect(screen.getByText('Indirect')).toBeInTheDocument();
    expect(screen.getByText('Manual')).toBeInTheDocument();
    // Back to simple, so the shared mode doesn't leak into other files
    fireEvent.click(screen.getByRole('button', { name: 'Small View' }));
    await waitFor(() => expect(screen.queryByText('Direct')).not.toBeInTheDocument());
  });
});
