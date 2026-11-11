/**
 * Wave 2 Task 14: the term-mapping dialogs on the kit Dialog, shared by
 * Enrich and Term Mapping (run-config-dialog, generate-review-dialog), and
 * the shared suggestion reviewer (suggestion-review, also on Data Asset
 * Reviews). These check the kit markup, every field and action, the API
 * payloads and toasts, the error states with Retry, and stale answers. The
 * Escape layering in a real browser is in
 * tests/e2e/concepts-enrich-mapping-dialogs.spec.ts (ruling R10).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, screen, waitFor, within } from '@testing-library/react';
import { useEffect } from 'react';
import { Route, Routes, useLocation } from 'react-router-dom';
import { renderWithMantine, userEvent } from '@/test/utils';
import { expectKitDialog, expectNoOldMarkup } from '@/test/kit-dialog';
import RunConfigDialog from './run-config-dialog';
import GenerateReviewDialog from './generate-review-dialog';
import TermMappingSuggestionReview from './suggestion-review';
import type { Run } from '@/types/term-mapping';

const toast = vi.hoisted(() => vi.fn());
vi.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast, dismiss: vi.fn() }), toast }));

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

const LONG = `Customer ${'lifetime-revenue-and-retention-domain-'.repeat(6)}`.slice(0, 200);
const UNBROKEN = `urn:e2e:${'q'.repeat(150)}`;

const CONTEXTS = [
  { context: 'urn:glossary:finance', label: 'Finance Glossary', concept_count: 45 },
  { context: 'urn:glossary:hr', label: 'People Glossary', concept_count: 3 },
];
const ASSET_TYPES = [
  { id: '1', name: 'Table', status: 'active' },
  { id: '2', name: 'Column', status: 'active' },
  { id: '3', name: 'LegacyThing', status: 'deprecated' },
];

const RUN: Run = {
  id: 'run-9', status: 'suggested', comment: null, created_at: '2026-11-09T11:00:00Z',
  stats: { suggestions_pending: 3, suggestions_accepted: 2 },
  ontology_contexts: [], include_shipped: [], target_filter: {}, engines: ['heuristic'], applied_link_ids: [],
};

const suggestion = (extra: Record<string, unknown> = {}) => ({
  id: 'sg-1', run_id: 'run-9', source_entity_type: 'data_contract_property', source_entity_id: `main.sales.${UNBROKEN}`,
  source_label: null, suggestion_kind: 'entity_assignment', target_concept_iri: `urn:concept:${UNBROKEN}`,
  target_concept_label: LONG, confidence: 0.93, reason: 'exact label match', auto_apply: true, engine: 'heuristic',
  status: 'pending', warnings: [], custom_iri: null, created_at: '', updated_at: '', ...extra,
});

let fetchMock: ReturnType<typeof vi.fn>;
let contexts: { status: number; body: unknown } = { status: 200, body: CONTEXTS };
let suggestions: { status: number; body: unknown } = { status: 200, body: [suggestion()] };
let post: { status: number; body: unknown } = { status: 201, body: {} };
let held: { path: string; release?: (body: unknown) => void } | null = null;

function mockBackend() {
  fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input), 'http://localhost');
    if (held && url.pathname === held.path) {
      const hold = held;
      held = null;
      return new Promise<Response>((resolve) => {
        hold.release = (body) => resolve(json(body));
      });
    }
    if (init?.method === 'POST') return json(post.body, post.status);
    switch (url.pathname) {
      case '/api/term-mappings/contexts':
        return json(contexts.body, contexts.status);
      case '/api/asset-types':
        return json(ASSET_TYPES);
      case '/api/term-mappings/runs/run-9/suggestions':
        return json(suggestions.body, suggestions.status);
      default:
        return json([]);
    }
  });
  vi.stubGlobal('fetch', fetchMock);
}

const posts = (pathname: string) =>
  fetchMock.mock.calls
    .filter(([input, init]) => new URL(String(input), 'http://localhost').pathname === pathname && (init as RequestInit)?.method === 'POST')
    .map(([, init]) => JSON.parse(String((init as RequestInit).body)));

const gets = (pathname: string) =>
  fetchMock.mock.calls.filter(([input, init]) =>
    new URL(String(input), 'http://localhost').pathname === pathname && !(init as RequestInit | undefined)?.method);

let location = '';
function Probe() {
  const l = useLocation();
  useEffect(() => {
    location = l.pathname;
  });
  return null;
}

beforeEach(() => {
  contexts = { status: 200, body: CONTEXTS };
  suggestions = { status: 200, body: [suggestion()] };
  post = { status: 201, body: {} };
  held = null;
  localStorage.setItem('ontosConceptMode', 'simple');
  mockBackend();
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('RunConfigDialog on the kit Dialog', () => {
  const renderDialog = (props: Partial<Parameters<typeof RunConfigDialog>[0]> = {}) => {
    const onOpenChange = vi.fn();
    const onCreated = vi.fn();
    renderWithMantine(<RunConfigDialog isOpen onOpenChange={onOpenChange} onCreated={onCreated} {...props} />);
    return { onOpenChange, onCreated };
  };
  const dialog = () => screen.getByRole('dialog', { name: 'New Term Mapping Run' });
  const loaded = () => within(dialog()).findByRole('checkbox', { name: /Finance Glossary/ });

  it('renders on the kit with no old markup, in the simple and the advanced view', async () => {
    const user = userEvent.setup();
    renderDialog();
    await loaded();
    expectKitDialog(dialog());
    expectNoOldMarkup(dialog());
    expect(within(dialog()).getByText(/Pick the ontologies and target entities/)).toBeInTheDocument();
    // The shared Simple/Advanced switch is in the dialog
    await user.click(within(dialog()).getByRole('button', { name: /^Large View/ }));
    expect(within(dialog()).getByText('Also include shipped taxonomies')).toBeInTheDocument();
    expectNoOldMarkup(dialog());
    await user.click(within(dialog()).getByRole('button', { name: 'Small View' }));
  });

  it('lists the contexts and the target types, and sends the chosen ones', async () => {
    const user = userEvent.setup();
    post = { status: 201, body: { id: 'run-new', stats: { suggestions_total: 4, targets: 9 } } };
    const { onCreated, onOpenChange } = renderDialog();
    await loaded();
    const d = within(dialog());
    expect(d.getByText('2 enabled')).toBeInTheDocument();
    const all = d.getByRole('checkbox', { name: 'Use every enabled customer ontology' });
    expect(all).toBeChecked();
    const finance = d.getByRole('checkbox', { name: /Finance Glossary/ });
    expect(finance).toBeChecked();
    expect(finance).toBeDisabled();
    // The IRIs show in the advanced view only
    expect(d.getByText('urn:glossary:finance')).not.toBeVisible();

    await user.click(all);
    expect(finance).not.toBeChecked();
    await user.click(finance);
    expect(finance).toBeChecked();

    // Simple view shows the core target types; the rest keep their default
    expect(d.getByRole('checkbox', { name: 'Asset / Column' })).toBeChecked();
    expect(d.getByRole('checkbox', { name: 'Data Product' })).not.toBeChecked();
    expect(d.getByRole('checkbox', { name: 'Contract Property', hidden: true })).not.toBeVisible();
    await user.click(d.getByRole('checkbox', { name: 'Data Product' }));

    await user.clear(d.getByRole('spinbutton', { name: 'Limit' }));
    await user.type(d.getByRole('spinbutton', { name: 'Limit' }), '25');
    await user.type(d.getByRole('textbox', { name: 'Comment (optional)' }), ' Nightly ');
    expect(d.getByText(/1 customer ontology/)).toBeInTheDocument();

    await user.click(d.getByRole('button', { name: 'Create run' }));
    await waitFor(() => expect(onCreated).toHaveBeenCalledWith(expect.objectContaining({ id: 'run-new' })));
    expect(posts('/api/term-mappings/runs')[0]).toEqual({
      target_filter: { entity_types: ['asset', 'data_contract_property', 'data_product'], asset_type_names: ['Column'], limit: 25 },
      include_shipped: [],
      engines: ['heuristic'],
      comment: 'Nightly',
      ontology_contexts: ['urn:glossary:finance'],
    });
    expect(toast).toHaveBeenCalledWith(expect.objectContaining({ title: 'Run created', description: 'Generated 4 suggestions across 9 target(s).' }));
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it('picks asset types from a searchable list, and removes them by their chips', async () => {
    const user = userEvent.setup();
    post = { status: 201, body: { id: 'run-new', stats: {} } };
    renderDialog();
    await loaded();
    const d = within(dialog());
    expect(within(d.getByTestId('tm-asset-types-selected')).getByText('Column')).toBeInTheDocument();

    const picker = d.getByRole('combobox', { name: /Asset types to match/ });
    expect(picker).toHaveTextContent('1 selected');
    expect(picker).toHaveAttribute('aria-expanded', 'false');
    await user.click(picker);
    expect(picker).toHaveAttribute('aria-expanded', 'true');
    const list = () => document.getElementById(picker.getAttribute('aria-controls') ?? '') as HTMLElement;
    const names = () => within(list()).getAllByRole('option', { hidden: true }).map((o) => o.textContent);
    expect(names()).toEqual(['Column', 'Table']);
    expect(within(list()).getByRole('option', { name: 'Column', hidden: true })).toHaveAttribute('aria-selected', 'true');
    await user.click(within(list()).getByRole('option', { name: 'Table', hidden: true }));
    expect(picker).toHaveTextContent('2 selected');
    // The search narrows the list
    await user.type(screen.getByPlaceholderText('Search asset types...'), 'tab');
    expect(names()).toEqual(['Table']);
    await user.click(picker);

    await user.click(d.getByRole('button', { name: 'Remove Column' }));
    await user.click(d.getByRole('button', { name: 'Create run' }));
    await waitFor(() => expect(posts('/api/term-mappings/runs')).toHaveLength(1));
    expect(posts('/api/term-mappings/runs')[0].target_filter.asset_type_names).toEqual(['Table']);
  });

  it('pre-picks the Databricks taxonomy when there are no customer schemes, and sends it', async () => {
    const user = userEvent.setup();
    contexts = { status: 200, body: [] };
    post = { status: 201, body: { id: 'run-new', stats: {} } };
    renderDialog();
    const d = within(dialog());
    expect(await d.findByText(/No customer ontologies are loaded yet/)).toBeInTheDocument();
    await user.click(d.getByRole('button', { name: /^Large View/ }));
    expect(d.getByRole('checkbox', { name: /Databricks ontology/ })).toBeChecked();
    await user.click(d.getByRole('checkbox', { name: /ODCS ontology/ }));
    await user.click(d.getByRole('button', { name: 'Create run' }));
    await waitFor(() => expect(posts('/api/term-mappings/runs')).toHaveLength(1));
    expect(posts('/api/term-mappings/runs')[0].include_shipped).toEqual(['urn:taxonomy:databricks_ontology', 'urn:taxonomy:odcs-ontology']);
    await user.click(d.getByRole('button', { name: 'Small View' }));
  });

  it('a failed context load shows an Alert with Retry, which loads them', async () => {
    const user = userEvent.setup();
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    contexts = { status: 500, body: { detail: 'Graph store down' } };
    renderDialog();
    const alert = await within(dialog()).findByRole('alert');
    expect(alert).toHaveTextContent('Graph store down');
    contexts = { status: 200, body: CONTEXTS };
    await user.click(within(dialog()).getByRole('button', { name: 'Retry' }));
    expect(await loaded()).toBeInTheDocument();
    expect(within(dialog()).queryByRole('alert')).toBeNull();
    expect(spy).toHaveBeenCalled();
  });

  it('a slow context answer from an earlier opening is dropped', async () => {
    held = { path: '/api/term-mappings/contexts' };
    const hold = held;
    const props = { onOpenChange: vi.fn(), onCreated: vi.fn() };
    const { rerender } = renderWithMantine(<RunConfigDialog isOpen {...props} />);
    // Closed and opened again before the first answer: the second load answers
    rerender(<RunConfigDialog isOpen={false} {...props} />);
    rerender(<RunConfigDialog isOpen {...props} />);
    await loaded();
    await act(async () => hold.release?.([{ context: 'urn:old', label: 'Stale Scheme', concept_count: 1 }]));
    expect(within(dialog()).queryByText('Stale Scheme')).toBeNull();
    expect(within(dialog()).getByText('2 enabled')).toBeInTheDocument();
  });

  it('checks its fields before it posts', async () => {
    const user = userEvent.setup();
    renderDialog();
    await loaded();
    const d = within(dialog());
    await user.click(d.getByRole('checkbox', { name: 'Use every enabled customer ontology' }));
    await user.click(d.getByRole('button', { name: 'Create run' }));
    expect(toast).toHaveBeenCalledWith(expect.objectContaining({ title: 'Pick at least one ontology', variant: 'destructive' }));
    await user.click(d.getByRole('checkbox', { name: 'Asset / Column' }));
    await user.click(d.getByRole('button', { name: /^Large View/ }));
    await user.click(d.getByRole('checkbox', { name: 'Contract Property' }));
    await user.click(d.getByRole('button', { name: 'Create run' }));
    expect(toast).toHaveBeenCalledWith(expect.objectContaining({ title: 'Pick at least one target type', variant: 'destructive' }));
    expect(posts('/api/term-mappings/runs')).toHaveLength(0);
    await user.click(d.getByRole('button', { name: 'Small View' }));
  });

  it('a failed run toasts the failure, no success, and stays open; Cancel closes', async () => {
    const user = userEvent.setup();
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    post = { status: 500, body: { detail: 'Suggester crashed' } };
    const { onCreated, onOpenChange } = renderDialog();
    await loaded();
    await user.click(within(dialog()).getByRole('button', { name: 'Create run' }));
    await waitFor(() => expect(toast).toHaveBeenCalledWith(expect.objectContaining({ title: 'Failed to create run', description: 'Suggester crashed' })));
    expect(toast).not.toHaveBeenCalledWith(expect.objectContaining({ title: 'Run created' }));
    expect(onCreated).not.toHaveBeenCalled();
    expect(onOpenChange).not.toHaveBeenCalled();
    await user.click(within(dialog()).getByRole('button', { name: 'Cancel' }));
    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(spy).toHaveBeenCalled();
  });

  it('names its info marks, whose tooltips open on focus', async () => {
    renderDialog();
    await loaded();
    const info = within(dialog()).getByRole('button', { name: /^Select which ontologies to use/ });
    await act(async () => info.focus());
    expect(await screen.findByRole('tooltip')).toHaveTextContent(/Select which ontologies to use/);
    expect(within(dialog()).getByRole('button', { name: /^Entity types to match concepts against/ })).toBeInTheDocument();
  });
});

describe('GenerateReviewDialog on the kit Dialog', () => {
  const renderDialog = (run: Run | null = RUN) => {
    const onOpenChange = vi.fn();
    const onCreated = vi.fn();
    renderWithMantine(
      <Routes>
        <Route path="*" element={<><GenerateReviewDialog isOpen onOpenChange={onOpenChange} run={run} currentUserEmail="me@example.com" onCreated={onCreated} /><Probe /></>} />
      </Routes>,
    );
    return { onOpenChange, onCreated };
  };
  const dialog = () => screen.getByRole('dialog', { name: 'Generate Review for Run' });

  it('renders on the kit with no old markup, and posts the request, then opens the review', async () => {
    const user = userEvent.setup();
    post = { status: 201, body: { run_id: 'run-9', review_request_id: 'rr-1', suggestion_count: 5, message: '' } };
    const { onCreated, onOpenChange } = renderDialog();
    expectKitDialog(dialog());
    expectNoOldMarkup(dialog());
    const d = within(dialog());
    const email = d.getByRole('textbox', { name: 'Reviewer email *' });
    expect(email).toHaveValue('me@example.com');
    expect(d.getByText('3 suggestions will become reviewable assets (3 pending).')).toBeInTheDocument();
    await user.click(d.getByRole('checkbox', { name: /Also include already-accepted suggestions/ }));
    expect(d.getByText('5 suggestions will become reviewable assets (3 pending, 2 accepted).')).toBeInTheDocument();
    await user.clear(email);
    await user.type(email, 'steward@example.com');
    await user.type(d.getByRole('textbox', { name: 'Notes' }), 'Please check');
    await user.click(d.getByRole('button', { name: 'Generate Review' }));
    await waitFor(() => expect(onCreated).toHaveBeenCalledWith('rr-1'));
    expect(posts('/api/term-mappings/runs/run-9/review')[0]).toEqual({ reviewer_email: 'steward@example.com', notes: 'Please check', include_accepted: true });
    expect(toast).toHaveBeenCalledWith(expect.objectContaining({ title: 'Review created', description: '5 suggestions queued for review.' }));
    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(location).toBe('/data-asset-reviews/rr-1');
  });

  it('needs a reviewer, and shows a failure in the dialog without a toast', async () => {
    const user = userEvent.setup();
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    renderDialog();
    const d = within(dialog());
    await user.clear(d.getByRole('textbox', { name: 'Reviewer email *' }));
    await user.click(d.getByRole('button', { name: 'Generate Review' }));
    expect(d.getByRole('alert')).toHaveTextContent('Reviewer email is required.');
    expect(posts('/api/term-mappings/runs/run-9/review')).toHaveLength(0);

    post = { status: 500, body: { detail: 'Review service down' } };
    await user.type(d.getByRole('textbox', { name: 'Reviewer email *' }), 'me@example.com');
    await user.click(d.getByRole('button', { name: 'Generate Review' }));
    expect(await d.findByText('Review service down')).toBeInTheDocument();
    expect(toast).not.toHaveBeenCalled();
    expect(spy).toHaveBeenCalled();
  });

  it('has nothing to send with no pending suggestions; Cancel closes', async () => {
    const user = userEvent.setup();
    const { onOpenChange } = renderDialog({ ...RUN, stats: { suggestions_pending: 0, suggestions_accepted: 0 } });
    expect(within(dialog()).getByRole('button', { name: 'Generate Review' })).toBeDisabled();
    await user.click(within(dialog()).getByRole('button', { name: 'Cancel' }));
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });
});

describe('TermMappingSuggestionReview without the old markup', () => {
  const renderReview = (props: Partial<Parameters<typeof TermMappingSuggestionReview>[0]> = {}) => {
    const onReviewComplete = vi.fn();
    const onNext = vi.fn();
    const view = renderWithMantine(
      <TermMappingSuggestionReview
        assetFqn="term-mapping://run-9/sg-1"
        onReviewComplete={onReviewComplete}
        onNext={onNext}
        hasNext
        currentIndex={1}
        totalCount={2}
        {...props}
      />,
    );
    return { ...view, onReviewComplete, onNext };
  };
  /** Classes that look like Tailwind utilities, outside the ui Button and Badge (which stay, wave 6). */
  const tailwindIn = (root: HTMLElement) => {
    const utility = /^(?:[a-z]+:)*-?(?:flex|grid|hidden|inline|block|truncate|shrink|items-|justify-|gap-|space-|p[xytrbl]?-|m[xytrbl]?-|w-|h-|min-|max-|text-|font-|bg-|border|rounded|leading-|tracking-|whitespace-|capitalize|uppercase|animate-|break-all)/;
    const found = new Set<string>();
    for (const el of root.querySelectorAll<HTMLElement>('[class]')) {
      if (el.closest('.mantine-Badge-root, .mantine-Button-root')) continue;
      for (const c of el.classList) if (utility.test(c)) found.add(c);
    }
    return [...found];
  };

  it('renders the mapping with no Tailwind or shadcn Card, the long names wrapping', async () => {
    const { container } = renderReview();
    expect(await screen.findByText('Term-mapping suggestion')).toBeInTheDocument();
    expect(screen.getByText('1 of 2')).toBeInTheDocument();
    expect(screen.getByText('pending')).toBeInTheDocument();
    expect(screen.getByText('data contract property')).toBeInTheDocument();
    expect(screen.getByText(LONG)).toBeInTheDocument();
    // The source keeps its full id in the title
    expect(screen.getByText(`main.sales.${UNBROKEN}`)).toHaveAttribute('title', `main.sales.${UNBROKEN}`);
    expect(screen.getByText('93% · high')).toHaveAttribute('data-bucket', 'high');
    expect(screen.getByText('auto-apply candidate')).toBeInTheDocument();
    expect(screen.getByText('exact label match')).toBeInTheDocument();
    expect(container.querySelector('.rounded-lg, .bg-card, [class*="shadow"]')).toBeNull();
    expect(tailwindIn(container)).toEqual([]);
  });

  it('accepts with the override IRI and the comment, and reports it', async () => {
    const user = userEvent.setup();
    post = { status: 200, body: { accepted: 1, rejected: 0, skipped: 0, errors: [] } };
    const { onReviewComplete } = renderReview();
    const iri = await screen.findByRole('textbox', { name: 'Override target IRI (optional)' });
    await user.type(iri, 'urn:concept:other');
    await user.type(screen.getByRole('textbox', { name: 'Comment' }), 'Better fit');
    await user.click(screen.getByRole('button', { name: 'Accept & apply' }));
    await waitFor(() => expect(onReviewComplete).toHaveBeenCalledWith('approved'));
    expect(posts('/api/term-mappings/runs/run-9/decisions')[0]).toEqual({
      decisions: [{ id: 'sg-1', decision: 'accept', custom_iri: 'urn:concept:other', comment: 'Better fit' }],
    });
    expect(toast).toHaveBeenCalledWith(expect.objectContaining({ title: expect.any(String) }));
  });

  it('rejects, asks for clarification, and accepts then moves on', async () => {
    const user = userEvent.setup();
    post = { status: 200, body: { accepted: 0, rejected: 1, skipped: 0, errors: [] } };
    const { onReviewComplete, onNext } = renderReview();
    await user.click(await screen.findByRole('button', { name: 'Reject' }));
    await waitFor(() => expect(onReviewComplete).toHaveBeenCalledWith('rejected'));
    await user.click(screen.getByRole('button', { name: 'Needs clarification' }));
    await waitFor(() => expect(posts('/api/term-mappings/runs/run-9/decisions')).toHaveLength(2));
    expect(posts('/api/term-mappings/runs/run-9/decisions')[1].decisions[0].decision).toBe('clarify');
    await user.click(screen.getByRole('button', { name: 'Accept & next' }));
    await waitFor(() => expect(onNext).toHaveBeenCalled());
  });

  it('a failed decision toasts the failure, and does not move on', async () => {
    const user = userEvent.setup();
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    post = { status: 500, body: { detail: 'Decision store down' } };
    const { onReviewComplete, onNext } = renderReview();
    await user.click(await screen.findByRole('button', { name: 'Accept & next' }));
    await waitFor(() => expect(toast).toHaveBeenCalledWith(expect.objectContaining({ variant: 'destructive', description: 'Decision store down' })));
    expect(onReviewComplete).not.toHaveBeenCalled();
    expect(onNext).not.toHaveBeenCalled();
    expect(spy).toHaveBeenCalled();
  });

  it('a decided or read-only suggestion has its fields and actions off, and shows its warnings', async () => {
    suggestions = { status: 200, body: [suggestion({ status: 'applied', warnings: ['IRI not in scheme'] })] };
    renderReview();
    expect(await screen.findByText('IRI not in scheme')).toBeInTheDocument();
    for (const name of ['Reject', 'Accept & apply', 'Accept & next', 'Needs clarification']) {
      expect(screen.getByRole('button', { name })).toBeDisabled();
    }
    expect(screen.getByRole('textbox', { name: 'Comment' })).toBeDisabled();
    cleanup();
    suggestions = { status: 200, body: [suggestion()] };
    renderReview({ readOnly: true });
    expect(await screen.findByRole('button', { name: 'Reject' })).toBeDisabled();
  });

  it('a failed load shows an Alert with Retry, which loads it', async () => {
    const user = userEvent.setup();
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    suggestions = { status: 500, body: { detail: 'Run store down' } };
    renderReview();
    expect(await screen.findByRole('alert')).toHaveTextContent('Run store down');
    suggestions = { status: 200, body: [suggestion()] };
    await user.click(screen.getByRole('button', { name: 'Retry' }));
    expect(await screen.findByText('Term-mapping suggestion')).toBeInTheDocument();
    expect(gets('/api/term-mappings/runs/run-9/suggestions')).toHaveLength(2);
    expect(spy).toHaveBeenCalled();
  });

  it('an unreadable FQN says so', () => {
    renderReview({ assetFqn: 'not-a-fqn' });
    expect(screen.getByRole('alert')).toHaveTextContent('Invalid term-mapping asset FQN.');
  });
});
