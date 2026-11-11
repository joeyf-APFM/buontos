import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act, render, screen, waitFor, fireEvent } from '@testing-library/react';
import { MemoryRouter, Routes, Route, useLocation } from 'react-router-dom';

// ---------------------------------------------------------------------------
// Define landing surface tests.
//
// Verifies the three creation-path cards render and route/open correctly, and
// that the in-progress list is fed by the ontology generator runs endpoint.
// The Import dialog is stubbed here (it has its own render path); we only
// assert it opens.
// ---------------------------------------------------------------------------

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, options?: any) => {
      if (typeof options === 'string') return options;
      if (options && typeof options === 'object' && 'defaultValue' in options) {
        return options.defaultValue as string;
      }
      return key;
    },
    i18n: { language: 'en', changeLanguage: vi.fn() },
  }),
}));

vi.mock('@/stores/breadcrumb-store', () => ({ default: () => () => undefined }));

let importDialogOpen = false;
let authorDialogOpen = false;
type DialogProps = { open: boolean; onOpenChange: (open: boolean) => void };
// A stub dialog: shown while open, with a close button as the real ones have
const stubDialog = (testId: string, { open, onOpenChange }: DialogProps) =>
  open ? (
    <div data-testid={testId}>
      <button onClick={() => onOpenChange(false)}>close {testId}</button>
    </div>
  ) : null;

vi.mock('@/components/knowledge', () => ({
  ImportConceptsDialog: (props: DialogProps) => {
    importDialogOpen = props.open;
    return stubDialog('import-dialog', props);
  },
  // Author reuses the collection editor as the "New Concept Scheme" dialog.
  CollectionEditorDialog: (props: DialogProps) => {
    authorDialogOpen = props.open;
    return stubDialog('author-dialog', props);
  },
}));

let guidedDialogOpen = false;
vi.mock('@/components/concepts/guided-generate-dialog', () => ({
  GuidedGenerateDialog: (props: DialogProps) => {
    guidedDialogOpen = props.open;
    return stubDialog('guided-dialog', props);
  },
}));

vi.mock('@/components/concepts/mode-switch', () => ({
  ConceptModeSwitch: () => <div data-testid="mode-switch" />,
}));

vi.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast: vi.fn() }) }));

// Write access on semantic-models, controllable per test (read-only users get
// disabled actions). Readiness (usePermissionsReady) lives in a store so a change
// re-renders the page as the real one does; not ready is a fresh load, when the
// real store is empty and grants nothing.
let canWriteMock = true;
vi.mock('@/stores/permissions-store', async () => {
  const { create } = await import('zustand');
  const { FeatureAccessLevel: Level } = await import('@/types/feature-access-levels');
  const readyStore = create(() => ({ ready: true }));
  return {
    usePermissions: () => ({
      hasPermission: (featureId: string, level: string) =>
        readyStore.getState().ready && featureId === 'semantic-models' && (level !== Level.READ_WRITE || canWriteMock),
      isLoading: false,
    }),
    usePermissionsReady: () => readyStore((s) => s.ready),
    __readyStore: readyStore,
  };
});
import * as permissionsStore from '@/stores/permissions-store';
const setReady = (ready: boolean) =>
  act(() => (permissionsStore as unknown as { __readyStore: { setState: (s: { ready: boolean }) => void } }).__readyStore.setState({ ready }));

import DefineView from './define';
import defineClasses from './define.module.css';

const RUNS = {
  runs: [
    {
      run_id: 'run-1',
      status: 'completed',
      progress_message: '156 draft terms from gold.*',
      created_at: '2026-07-10T12:00:00Z',
      step_count: 4,
    },
    {
      run_id: 'run-2',
      status: 'running',
      progress_message: 'Extracting classes…',
      created_at: '2026-07-12T12:00:00Z',
      step_count: 2,
    },
  ],
};

beforeEach(() => {
  importDialogOpen = false;
  authorDialogOpen = false;
  guidedDialogOpen = false;
  canWriteMock = true;
  setReady(true);
  global.fetch = vi.fn(async (url: any) => {
    const u = String(url);
    if (u.includes('/api/ontology/runs')) {
      return { ok: true, status: 200, json: async () => RUNS } as any;
    }
    // collections
    return { ok: true, status: 200, json: async () => ({ collections: [] }) } as any;
  }) as unknown as typeof fetch;
});

function renderDefine(entry = '/concepts/define') {
  let observed = { pathname: '', search: '' };
  function Probe() {
    const location = useLocation();
    observed = { pathname: location.pathname, search: location.search };
    return null;
  }
  render(
    <MemoryRouter initialEntries={[entry]}>
      <Routes>
        <Route path="/concepts/define" element={<><DefineView /><Probe /></>} />
        <Route path="/concepts/collections" element={<><div>collections-page</div><Probe /></>} />
        <Route path="/concepts/generator" element={<><div>generator-page</div><Probe /></>} />
      </Routes>
    </MemoryRouter>
  );
  return () => observed;
}

// The runs load settles (its state updates land inside RTL's act)
const settled = () => screen.findByText('156 draft terms from gold.*');

describe('DefineView', () => {
  it('renders the three creation-path cards', async () => {
    renderDefine();
    expect(screen.getByText('Author')).toBeInTheDocument();
    expect(screen.getByText('Generate')).toBeInTheDocument();
    expect(screen.getByText('Import')).toBeInTheDocument();
    await settled();
  });

  it('Author card opens the New Concept Scheme dialog in place', async () => {
    renderDefine();
    fireEvent.click(screen.getByText('New Concept Scheme'));
    await waitFor(() => expect(screen.getByTestId('author-dialog')).toBeInTheDocument());
    expect(authorDialogOpen).toBe(true);
  });

  it('Generate card opens the guided build dialog in place', async () => {
    renderDefine();
    fireEvent.click(screen.getByText('Start guided build'));
    await waitFor(() => expect(screen.getByTestId('guided-dialog')).toBeInTheDocument());
    expect(guidedDialogOpen).toBe(true);
  });

  it('Import card opens the import dialog', async () => {
    renderDefine();
    fireEvent.click(screen.getByText('Upload files'));
    await waitFor(() => expect(screen.getByTestId('import-dialog')).toBeInTheDocument());
    expect(importDialogOpen).toBe(true);
  });

  it('legend puts each rung vocabulary behind an info icon shown in both modes', async () => {
    renderDefine();
    expect(screen.queryByRole('button', { name: 'What gets written' })).not.toBeInTheDocument();
    for (const key of ['glossary', 'taxonomy', 'ontology']) {
      const icon = screen.getByTestId(`rung-vocab-${key}`);
      expect(icon).toBeInTheDocument();
      expect(icon).not.toHaveClass('adv-only');
    }
    // Vocabulary text lives in tooltips, not inline under the rungs.
    expect(screen.queryByText(/skos:prefLabel \/ skos:altLabel/)).not.toBeInTheDocument();
    await settled();
  });

  it('legend arrows are separators between rungs, not coupled to the info icon', async () => {
    renderDefine();
    // Two separators for three rungs: none after the last item.
    const seps = screen.getAllByTestId('rung-separator');
    expect(seps).toHaveLength(2);
    for (const sep of seps) {
      expect(sep).toHaveTextContent('→');
      // Hidden when the columns stack (define.module.css); never advanced-only (no dangling arrow in Simple mode).
      expect(sep).toHaveClass(defineClasses.separator);
      expect(sep).not.toHaveClass('adv-only');
    }
    // Each rung's info icon no longer has an arrow as a sibling.
    for (const key of ['glossary', 'taxonomy', 'ontology']) {
      const row = screen.getByTestId(`rung-vocab-${key}`).parentElement!;
      expect(row.textContent).not.toContain('→');
    }
    await settled();
  });

  it('read-only user sees the path actions disabled with a write-access hint', async () => {
    canWriteMock = false;
    renderDefine();
    for (const label of ['New Concept Scheme', 'Start guided build', 'Upload files']) {
      const button = screen.getByRole('button', { name: label });
      expect(button).toBeDisabled();
      expect(button).toHaveAttribute('title', 'Requires write access');
    }
    // Cards and the in-progress list stay visible.
    expect(screen.getByText('Import')).toBeInTheDocument();
    await waitFor(() => expect(screen.getByText('156 draft terms from gold.*')).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: 'Upload files' }));
    expect(screen.queryByTestId('import-dialog')).not.toBeInTheDocument();
  });

  it('writer sees the path actions enabled and Upload files opens the import dialog', async () => {
    renderDefine();
    for (const label of ['New Concept Scheme', 'Start guided build', 'Upload files']) {
      const button = screen.getByRole('button', { name: label });
      expect(button).toBeEnabled();
      expect(button).not.toHaveAttribute('title');
    }
    fireEvent.click(screen.getByRole('button', { name: 'Upload files' }));
    await waitFor(() => expect(screen.getByTestId('import-dialog')).toBeInTheDocument());
  });

  it('shows in-progress generator runs from the runs endpoint', async () => {
    renderDefine();
    await waitFor(() => {
      expect(screen.getByText('156 draft terms from gold.*')).toBeInTheDocument();
    });
    expect(screen.getByText('Extracting classes…')).toBeInTheDocument();
    // completed run surfaces the "Needs review" badge
    expect(screen.getByText('Needs review')).toBeInTheDocument();
  });
});

// Task 16e: the side menu's Build → Concepts → Define → Author Concepts,
// Generate Ontology and Import RDF link here with ?open=…
describe('DefineView ?open=', () => {
  it.each([
    ['author', 'author-dialog', () => authorDialogOpen],
    ['generate', 'guided-dialog', () => guidedDialogOpen],
    ['import', 'import-dialog', () => importDialogOpen],
  ])('?open=%s opens its dialog, and closing it clears the param', async (open, testId, isOpen) => {
    const location = renderDefine(`/concepts/define?open=${open}`);
    expect(await screen.findByTestId(testId)).toBeInTheDocument();
    expect(isOpen()).toBe(true);
    // The URL keeps the param while the dialog is open (the menu highlights it)
    expect(location().search).toBe(`?open=${open}`);

    fireEvent.click(screen.getByRole('button', { name: `close ${testId}` }));

    expect(screen.queryByTestId(testId)).not.toBeInTheDocument();
    await waitFor(() => expect(location().search).toBe(''));
    expect(location().pathname).toBe('/concepts/define');
    // and it doesn't reopen
    expect(screen.queryByTestId(testId)).not.toBeInTheDocument();
  });

  it('opens only the named dialog', async () => {
    renderDefine('/concepts/define?open=generate');
    await screen.findByTestId('guided-dialog');
    expect(screen.queryByTestId('author-dialog')).not.toBeInTheDocument();
    expect(screen.queryByTestId('import-dialog')).not.toBeInTheDocument();
  });

  it('keeps other params when it clears open', async () => {
    const location = renderDefine('/concepts/define?mode=advanced&open=import');
    await screen.findByTestId('import-dialog');
    fireEvent.click(screen.getByRole('button', { name: 'close import-dialog' }));
    await waitFor(() => expect(location().search).toBe('?mode=advanced'));
  });

  it('does nothing for an unknown open value', async () => {
    const location = renderDefine('/concepts/define?open=nonsense');
    await waitFor(() => expect(screen.getByText('156 draft terms from gold.*')).toBeInTheDocument());
    for (const testId of ['author-dialog', 'guided-dialog', 'import-dialog']) {
      expect(screen.queryByTestId(testId)).not.toBeInTheDocument();
    }
    expect(location().search).toBe('?open=nonsense');
  });

  it('waits for the permissions on a fresh load, then opens the dialog', async () => {
    setReady(false);
    const location = renderDefine('/concepts/define?open=author');
    await waitFor(() => expect(screen.getByText('156 draft terms from gold.*')).toBeInTheDocument());
    expect(location().search).toBe('?open=author');
    expect(screen.queryByTestId('author-dialog')).not.toBeInTheDocument();

    setReady(true);
    expect(await screen.findByTestId('author-dialog')).toBeInTheDocument();
    expect(location().search).toBe('?open=author');
  });

  it('waits for the permissions on a fresh load, then drops the param for a reader', async () => {
    canWriteMock = false;
    setReady(false);
    const location = renderDefine('/concepts/define?open=import');
    await waitFor(() => expect(screen.getByText('156 draft terms from gold.*')).toBeInTheDocument());
    expect(location().search).toBe('?open=import');

    setReady(true);
    await waitFor(() => expect(location().search).toBe(''));
    expect(screen.queryByTestId('import-dialog')).not.toBeInTheDocument();
  });

  it.each(['author', 'generate', 'import'])(
    'opens no dialog from ?open=%s for a user without write access, and clears the param',
    async (open) => {
      canWriteMock = false;
      const location = renderDefine(`/concepts/define?open=${open}`);
      await waitFor(() => expect(location().search).toBe(''));
      for (const testId of ['author-dialog', 'guided-dialog', 'import-dialog']) {
        expect(screen.queryByTestId(testId)).not.toBeInTheDocument();
      }
      expect([authorDialogOpen, guidedDialogOpen, importDialogOpen]).toEqual([false, false, false]);
    },
  );
});
