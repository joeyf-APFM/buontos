/**
 * Wave 2 Task 12b: Define's Import Concepts dialog on the kit Dialog, with
 * Mantine fields: the files, the landing strategy, the target scheme, the
 * conflict choice, the diff preview, the outcome summary and the toasts.
 * Escape in its Select and the footer's submit are also checked in a real
 * browser (tests/e2e/concepts-generator.spec.ts).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { renderWithMantine, userEvent } from '@/test/utils';
import { expectKitDialog, expectNoOldMarkup, pick, selectField } from '@/test/kit-dialog';
import type { KnowledgeCollection } from '@/types/ontology';
import dialogKit from '@/mantine/page/dialog.module.css';
import { ImportConceptsDialog } from './import-concepts-dialog';

const toast = vi.hoisted(() => vi.fn());
vi.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast, dismiss: vi.fn() }), toast }));

const make = (overrides: Partial<KnowledgeCollection>): KnowledgeCollection => ({
  iri: 'urn:coll:x',
  label: 'X',
  collection_type: 'glossary',
  scope_level: 'enterprise',
  source_type: 'custom',
  is_editable: true,
  status: 'active',
  concept_count: 0,
  child_collections: [],
  ...overrides,
});

const COLLECTIONS: KnowledgeCollection[] = [
  make({ iri: 'urn:coll:a', label: 'Finance' }),
  make({ iri: 'urn:coll:full', label: 'Sales Ontology', collection_type: 'ontology', concept_count: 4 }),
  make({ iri: 'urn:coll:b', label: 'Locked', is_editable: false }),
];

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

let fetchMock: ReturnType<typeof vi.fn>;
type Backend = { importStatus?: number; conflicts?: unknown[]; importBody?: unknown };
function mockBackend({ importStatus = 200, conflicts = [], importBody }: Backend = {}) {
  fetchMock = vi.fn(async (input: RequestInfo | URL) => {
    const url = new URL(String(input), 'http://localhost');
    if (url.pathname.endsWith('/import/conflicts')) return json({ conflicts });
    if (url.pathname.endsWith('/import')) {
      if (importStatus !== 200) return json({ detail: 'Parse error on line 3' }, importStatus);
      if (url.pathname.includes('urn%3Acoll%3Afull') && !url.searchParams.has('conflict_mode')) {
        return json({
          mode: 'preview', preview_token: 'tok-1', context_name: 'Sales Ontology',
          summary: { unchanged: 2, modified: 1, new: 1, removed: 1 },
          modified: [{ iri: 'urn:c:order', label: 'Order' }],
          new: [{ iri: 'urn:c:refund', label: 'Refund' }],
          removed: [{ iri: 'urn:c:legacy', label: 'Legacy', reference_count: 3 }],
        });
      }
      return json(importBody ?? { mode: 'imported', triples_imported: 7 });
    }
    if (url.pathname.includes('/uploads/preview/')) return json({ status: 'held', review_request_id: 'req-12345678-abc' });
    if (url.pathname === '/api/knowledge/collections') return json({ iri: 'urn:coll:new', label: 'New' });
    return json({});
  });
  vi.stubGlobal('fetch', fetchMock);
}

const onOpenChange = vi.fn();
const onImported = vi.fn();
const renderDialog = (collections = COLLECTIONS) =>
  renderWithMantine(
    <ImportConceptsDialog open onOpenChange={onOpenChange} collections={collections} onImported={onImported} />,
  );

const dialog = () => screen.getByRole('dialog', { name: 'Import files' });
// The footer's Close (the corner close is named Close too)
const footerClose = () => within(dialog()).getAllByRole('button', { name: 'Close' }).find((b) => b.textContent === 'Close')!;
const fileInput = () => dialog().querySelector('input[type="file"]') as HTMLInputElement;
const addFiles = (...names: string[]) =>
  fireEvent.change(fileInput(), { target: { files: names.map((n) => new File(['@prefix : <urn:x#> .'], n, { type: 'text/turtle' })) } });

describe('ImportConceptsDialog on the kit Dialog', () => {
  beforeEach(() => mockBackend());
  afterEach(() => {
    vi.unstubAllGlobals();
    toast.mockClear();
    onOpenChange.mockClear();
    onImported.mockClear();
  });

  it('renders on the kit Dialog', () => {
    renderDialog();
    expectKitDialog(dialog());
    expectNoOldMarkup(dialog());
    expect(dialog()).toHaveAccessibleDescription(/Drop one or more ontology files/);
    // The form is in the kit's scrolling body; Import, in the footer, submits it by its id
    const formEl = dialog().querySelector('form')!;
    expect(formEl.parentElement).toHaveClass(dialogKit.body);
    const submit = within(dialog()).getByRole('button', { name: 'Import 0 file(s)' });
    expect(submit).toHaveAttribute('type', 'submit');
    expect(submit).toHaveAttribute('form', formEl.id);
    expect(formEl.contains(submit)).toBe(false);
  });

  it('keeps its fields and actions', async () => {
    const user = userEvent.setup();
    renderDialog();
    const d = within(dialog());
    expect(d.getByRole('button', { name: 'Choose files…' })).toBeEnabled();
    expect(fileInput()).toHaveAttribute('accept', '.ttl,.rdf,.xml,.owl,.n3,.nt,.jsonld,.json');
    expect(fileInput()).toHaveAttribute('multiple');

    // Files are listed, named in mono, and each can be removed
    addFiles('a.ttl', 'b.ttl');
    expect(d.getByText('a.ttl')).toHaveAttribute('title', 'a.ttl');
    expect(d.getByRole('button', { name: 'Add more files…' })).toBeEnabled();
    await user.click(d.getAllByRole('button', { name: 'Remove' })[1]);
    expect(d.queryByText('b.ttl')).toBeNull();

    // The strategy: two radio cards in a named group
    const group = d.getByRole('radiogroup', { name: 'How should these land?' });
    const merge = within(group).getByRole('radio', { name: /^One scheme Merge/ });
    const perFile = within(group).getByRole('radio', { name: /^One scheme per file/ });
    expect(merge).toHaveAttribute('aria-checked', 'true');
    await user.click(perFile);
    expect(perFile).toHaveAttribute('aria-checked', 'true');
    expect(d.getByText(/each file creates a new scheme named after the file/i)).toBeInTheDocument();
    expect(d.queryByRole('textbox', { name: 'Target concept scheme' })).toBeNull();
    await user.click(merge);

    // The target: Create new first, then the editable schemes by type
    const target = selectField(dialog(), 'Target concept scheme');
    await user.click(target);
    const list = document.getElementById(target.getAttribute('aria-controls') ?? '')!;
    const options = within(list).getAllByRole('option', { hidden: true }).map((o) => o.textContent);
    expect(options[0]).toBe('＋ Create a new scheme…');
    expect(options.slice(1)).toEqual(['Finance', 'Sales Ontology']);
    expect(within(list).getByText('Glossaries')).toBeInTheDocument();
    expect(within(list).getByText('Ontologies')).toBeInTheDocument();
    await user.click(target);
    expect(d.getByText(/Only editable schemes can receive imports/)).toBeInTheDocument();

    // Create new asks for a name, then imports into the new scheme
    await pick(user, target, '＋ Create a new scheme…');
    const name = d.getByRole('textbox', { name: 'New scheme name (e.g. Finance Ontology)' });
    expect(d.getByRole('button', { name: 'Import 1 file(s)' })).toBeDisabled();
    await user.type(name, 'Risk');
    await waitFor(() => expect(d.getByRole('button', { name: 'Import 1 file(s)' })).toBeEnabled());
    expect(d.getByText(/reconciled later in the Review Board/)).toBeInTheDocument();
  });

  it('a clean import shows the success toast and closes', async () => {
    const user = userEvent.setup();
    renderDialog();
    addFiles('a.ttl');
    await pick(user, selectField(dialog(), 'Target concept scheme'), 'Finance');
    const submit = within(dialog()).getByRole('button', { name: 'Import 1 file(s)' });
    await waitFor(() => expect(submit).toBeEnabled());
    await user.click(submit);
    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
    expect(onImported).toHaveBeenCalled();
    expect(toast).toHaveBeenCalledWith(expect.objectContaining({ description: 'Imported 1 file(s).' }));
    const importCall = fetchMock.mock.calls.find(([u]) => String(u).includes('/import?'));
    expect(String(importCall![0])).toBe('/api/knowledge/collections/urn%3Acoll%3Aa/import?conflict_mode=block');
  });

  it('while it uploads, Import shows the spinner beside its Upload icon, and Cancel is disabled', async () => {
    const user = userEvent.setup();
    renderDialog();
    addFiles('a.ttl');
    await pick(user, selectField(dialog(), 'Target concept scheme'), 'Finance');
    const submit = within(dialog()).getByRole('button', { name: 'Import 1 file(s)' });
    await waitFor(() => expect(submit).toBeEnabled());
    let finish: (r: Response) => void = () => {};
    fetchMock.mockImplementation((input: RequestInfo | URL) =>
      String(input).includes('/import?') ? new Promise<Response>((r) => { finish = r; }) : Promise.resolve(json({ conflicts: [] })));
    await user.click(submit);
    await waitFor(() => expect(submit.querySelector('.mantine-Loader-root')).not.toBeNull());
    expect(submit.querySelector('svg.lucide-upload')).not.toBeNull();
    expect(within(dialog()).getByRole('button', { name: 'Cancel' })).toBeDisabled();
    finish(json({ mode: 'imported', triples_imported: 1 }));
    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
  });

  it('a failed import shows the error and per-file results, with no success toast', async () => {
    mockBackend({ importStatus: 400 });
    const user = userEvent.setup();
    renderDialog();
    addFiles('a.ttl');
    await pick(user, selectField(dialog(), 'Target concept scheme'), 'Finance');
    const submit = within(dialog()).getByRole('button', { name: 'Import 1 file(s)' });
    await waitFor(() => expect(submit).toBeEnabled());
    await user.click(submit);
    const alert = await within(dialog()).findByRole('alert');
    expect(alert).toHaveTextContent('No files could be imported. See per-file errors below.');
    expect(within(dialog()).getByText('Parse error on line 3')).toBeInTheDocument();
    expect(toast).not.toHaveBeenCalled();
    expect(onOpenChange).not.toHaveBeenCalled();
    expect(footerClose()).toBeEnabled();
  });

  it('conflicts: the list, Check detailed list, and the choice threaded into the import', async () => {
    const conflicts = Array.from({ length: 6 }, (_, i) => ({
      iri: `urn:c:${i}`, label: `Concept ${i}`, existing_label: 'Other Glossary', existing_context: 'urn:other',
    }));
    mockBackend({ conflicts });
    const user = userEvent.setup();
    renderDialog();
    addFiles('a.ttl');
    await pick(user, selectField(dialog(), 'Target concept scheme'), 'Finance');
    const d = within(dialog());
    expect(await d.findByText('Concept IRI conflicts detected')).toBeInTheDocument();
    expect(d.queryByText(/reconciled later in the Review Board/)).toBeNull();
    expect(d.getAllByText('Already in Other Glossary')).toHaveLength(5);
    await user.click(d.getByRole('button', { name: 'Check detailed list (6)' }));
    expect(d.getAllByText('Already in Other Glossary')).toHaveLength(6);
    expect(d.getByText('Concept 0')).toHaveAttribute('title', 'urn:c:0');
    const update = d.getByRole('radio', { name: /Update existing/ });
    const skip = d.getByRole('radio', { name: /Import only new/ });
    expect(update).toBeChecked();
    await user.click(skip);
    expect(skip).toBeChecked();
    await user.click(d.getByRole('button', { name: 'Import 1 file(s)' }));
    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
    expect(fetchMock.mock.calls.some(([u]) => String(u).endsWith('/import?conflict_mode=skip'))).toBe(true);
  });

  it('a re-upload previews the diff, and a held import keeps the summary open', async () => {
    const user = userEvent.setup();
    renderDialog();
    addFiles('sales.ttl');
    await pick(user, selectField(dialog(), 'Target concept scheme'), 'Sales Ontology');
    const d = within(dialog());
    expect(await d.findByText('Changes from sales.ttl')).toBeInTheDocument();
    expect(d.getByText('Modifies 1, adds 1, removes 1 (2 unchanged).')).toBeInTheDocument();
    expect(d.getByText('Refund')).toBeInTheDocument();
    expect(d.getByText('used by 3')).toBeInTheDocument();
    await user.click(d.getByRole('button', { name: 'Import 1 file(s)' }));
    expect(await d.findByText('Upload submitted for approval (1 file(s))')).toBeInTheDocument();
    expect(d.getByText('Changes applied from sales.ttl')).toBeInTheDocument();
    expect(d.getByText('Pending approval')).toBeInTheDocument();
    expect(d.getByText('(req-1234)')).toBeInTheDocument();
    expect(onImported).toHaveBeenCalled();
    expect(toast).not.toHaveBeenCalled();
    // Done: only Close is left
    expect(d.queryByRole('button', { name: /^Import/ })).toBeNull();
    await user.click(footerClose());
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });
});
