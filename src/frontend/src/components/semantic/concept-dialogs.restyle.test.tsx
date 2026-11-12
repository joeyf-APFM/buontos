/**
 * Wave 2 Task 15: the concept detail page's dialogs on the kit Dialog (the
 * Request action picker, Save new version and Deprecate), and
 * ConceptSelectDialog on the kit too (rulings R36, R38). Stacking, Escape in
 * an open picker and focus return are measured in a real browser in
 * tests/e2e/concept-detail-dialogs.spec.ts (ruling R10); these tests check
 * the kit look, the fields and their names, the payloads, and that a
 * failure keeps the dialog with no success toast.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, screen, waitFor, within } from '@testing-library/react';
import { useRef, useState } from 'react';
import { renderWithMantine, userEvent } from '@/test/utils';
import { expectKitDialog, expectNoOldMarkup, optionNames, pick, selectField } from '@/test/kit-dialog';
import { RequestConceptActionDialog } from '@/components/concepts/request-concept-action-dialog';
import { PublishVersionDialog } from './publish-version-dialog';
import { DeprecateConceptDialog } from './deprecate-concept-dialog';
import ConceptSelectDialog from './concept-select-dialog';

const { toast, get, post } = vi.hoisted(() => ({ toast: vi.fn(), get: vi.fn(), post: vi.fn() }));
vi.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast }) }));
vi.mock('@/hooks/use-api', () => ({ useApi: () => ({ get, post }) }));

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

const IRI = 'urn:x:Customer';
const CONCEPTS = [
  { value: 'http://example.org/c#Account', label: 'Account', type: 'class' },
  { value: 'http://example.org/c#Party', label: 'Party', type: 'class' },
];

beforeEach(() => {
  toast.mockReset();
  get.mockReset();
  post.mockReset();
  get.mockResolvedValue({ data: CONCEPTS });
  post.mockResolvedValue({ data: {} });
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('RequestConceptActionDialog on the kit', () => {
  const transitions = [
    { status: 'certified', action: 'certify', labelKey: 'x:certify', defaultLabel: 'Certify' },
  ];

  it('is a kit Dialog with a named Select, and confirm runs the picked action', async () => {
    const user = userEvent.setup();
    const onTransition = vi.fn();
    const onOpenChange = vi.fn();
    const onSelect = vi.fn();
    renderWithMantine(
      <RequestConceptActionDialog
        open
        onOpenChange={onOpenChange}
        conceptLabel="Customer"
        currentStatus="published"
        transitions={transitions}
        newVersion={{ disabled: false, onSelect }}
        onTransition={onTransition}
      />,
    );
    const dialog = await screen.findByRole('dialog', { name: 'Request Action' });
    expectKitDialog(dialog);
    expectNoOldMarkup(dialog);
    const field = selectField(dialog, 'What do you want to request?');
    expect(field).toHaveValue('Certify');
    expect(await optionNames(user, field)).toEqual(['Certify', 'New Version']);
    await pick(user, field, 'New Version');
    expect(within(dialog).getByTestId('request-concept-action-body')).toHaveTextContent('The IRI stays the same');
    await user.click(within(dialog).getByRole('button', { name: 'Create New Version' }));
    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(onSelect).toHaveBeenCalledTimes(1);
    expect(onTransition).not.toHaveBeenCalled();
  });
});

describe('PublishVersionDialog on the kit', () => {
  it('is a kit Dialog with named fields; Save posts the change and closes', async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn(async () => json({ iri: IRI, new_version: 3, is_current: true }));
    vi.stubGlobal('fetch', fetchMock);
    const onOpenChange = vi.fn();
    const onPublished = vi.fn();
    renderWithMantine(
      <PublishVersionDialog open onOpenChange={onOpenChange} iri={IRI} currentDefinition="A buyer." onPublished={onPublished} />,
    );
    const dialog = await screen.findByRole('dialog', { name: 'Save new version' });
    expectKitDialog(dialog);
    expectNoOldMarkup(dialog);
    const definition = within(dialog).getByRole('textbox', { name: 'Definition' });
    expect(definition).toHaveValue('A buyer.');
    const save = within(dialog).getByRole('button', { name: 'Save new version' });
    // Unchanged: nothing to save
    expect(save).toBeDisabled();
    await user.clear(definition);
    await user.type(definition, 'A party that buys.');
    await user.type(within(dialog).getByRole('textbox', { name: /What changed/ }), 'Shorter');
    await user.click(save);
    await waitFor(() => expect(onPublished).toHaveBeenCalled());
    expect(JSON.parse(String((fetchMock.mock.calls[0] as unknown as [string, RequestInit])[1].body))).toEqual({
      iri: IRI, changes: { definition: 'A party that buys.' }, change_note: 'Shorter',
    });
    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(toast).toHaveBeenCalledWith(expect.objectContaining({ description: 'New version saved' }));
  });

  it('a failed save keeps the dialog open with no success toast', async () => {
    const user = userEvent.setup();
    vi.stubGlobal('fetch', vi.fn(async () => json({ detail: 'Version store is down' }, 500)));
    const onOpenChange = vi.fn();
    renderWithMantine(
      <PublishVersionDialog open onOpenChange={onOpenChange} iri={IRI} currentDefinition="A buyer." onPublished={vi.fn()} />,
    );
    const dialog = await screen.findByRole('dialog', { name: 'Save new version' });
    await user.type(within(dialog).getByRole('textbox', { name: 'Definition' }), ' Changed.');
    await user.click(within(dialog).getByRole('button', { name: 'Save new version' }));
    await waitFor(() => expect(toast).toHaveBeenCalledWith(expect.objectContaining({ variant: 'destructive', description: 'Version store is down' })));
    expect(toast).not.toHaveBeenCalledWith(expect.objectContaining({ description: 'New version saved' }));
    expect(onOpenChange).not.toHaveBeenCalledWith(false);
  });
});

describe('DeprecateConceptDialog on the kit', () => {
  function Host({ onSuccess = vi.fn() }: { onSuccess?: () => void }) {
    const [open, setOpen] = useState(true);
    return <DeprecateConceptDialog isOpen={open} onOpenChange={setOpen} conceptIri={IRI} onSuccess={onSuccess} />;
  }

  it('is a kit alertdialog; Add successor opens the kit picker, whose pick lands as a removable chip', async () => {
    const user = userEvent.setup();
    const onSuccess = vi.fn();
    renderWithMantine(<Host onSuccess={onSuccess} />);
    const dialog = await screen.findByRole('alertdialog', { name: 'Deprecate concept' });
    expectKitDialog(dialog);
    expectNoOldMarkup(dialog);
    expect(within(dialog).getByText('None selected')).toBeInTheDocument();

    await user.click(within(dialog).getByRole('button', { name: '+ Add successor' }));
    const picker = await screen.findByRole('dialog', { name: 'Select Business Concept' });
    expectKitDialog(picker);
    await user.click((await within(picker).findAllByRole('button', { name: 'Select' }))[0]);
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Select Business Concept' })).toBeNull());
    const chip = within(dialog).getByText('Account');
    expect(chip).toHaveAttribute('title', 'http://example.org/c#Account');

    // Remove takes it out again; a second pick stays
    await user.click(within(dialog).getByRole('button', { name: 'Remove Account' }));
    expect(within(dialog).getByText('None selected')).toBeInTheDocument();
    await user.click(within(dialog).getByRole('button', { name: '+ Add successor' }));
    const again = await screen.findByRole('dialog', { name: 'Select Business Concept' });
    await user.click((await within(again).findAllByRole('button', { name: 'Select' }))[1]);
    await waitFor(() => expect(within(dialog).getByText('Party')).toBeInTheDocument());

    await user.click(within(dialog).getByRole('button', { name: 'Deprecate' }));
    await waitFor(() => expect(onSuccess).toHaveBeenCalled());
    expect(post).toHaveBeenCalledWith('/api/semantic-models/concepts/deprecate', { iri: IRI, replaced_by: ['http://example.org/c#Party'] });
  });

  it('a failed deprecate keeps the dialog open with an error toast', async () => {
    const user = userEvent.setup();
    post.mockResolvedValue({ error: 'Not allowed' });
    const onSuccess = vi.fn();
    renderWithMantine(<Host onSuccess={onSuccess} />);
    const dialog = await screen.findByRole('alertdialog', { name: 'Deprecate concept' });
    await user.click(within(dialog).getByRole('button', { name: 'Deprecate' }));
    await waitFor(() => expect(toast).toHaveBeenCalledWith(expect.objectContaining({ variant: 'destructive', description: 'Not allowed' })));
    expect(onSuccess).not.toHaveBeenCalled();
    expect(screen.getByRole('alertdialog', { name: 'Deprecate concept' })).toBeInTheDocument();
  });
});

describe('ConceptSelectDialog on the kit', () => {
  it('is a kit Dialog: the search, the rows and their Select', async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    renderWithMantine(<ConceptSelectDialog isOpen onOpenChange={vi.fn()} onSelect={onSelect} />);
    const dialog = await screen.findByRole('dialog', { name: 'Select Business Concept' });
    expectKitDialog(dialog);
    expect(within(dialog).getByRole('textbox')).toHaveAttribute('placeholder', 'Search business concepts...');
    const party = await within(dialog).findByText('Party');
    expect(party).toHaveAttribute('title', 'Party');
    expect(within(dialog).getByText('http://example.org/c#Party')).toHaveAttribute('title', 'http://example.org/c#Party');
    expectNoOldMarkup(dialog);
    await user.click(within(dialog).getAllByRole('button', { name: 'Select' })[1]);
    expect(onSelect).toHaveBeenCalledWith('http://example.org/c#Party');
  });

  it('drops a stale search answer', async () => {
    const user = userEvent.setup();
    let release: (v: unknown) => void = () => {};
    get.mockImplementation(async (url: string) => {
      if (url.includes('q=Acc')) return { data: [CONCEPTS[0]] };
      if (url.includes('q=A&')) return new Promise((resolve) => { release = resolve; });
      return { data: CONCEPTS };
    });
    renderWithMantine(<ConceptSelectDialog isOpen onOpenChange={vi.fn()} onSelect={vi.fn()} />);
    const dialog = await screen.findByRole('dialog', { name: 'Select Business Concept' });
    await within(dialog).findByText('Party');
    const search = within(dialog).getByRole('textbox');
    await user.type(search, 'A');
    // The "A" request is held; "Acc" answers first
    await waitFor(() => expect(get.mock.calls.some(([u]) => String(u).includes('q=A&'))).toBe(true), { timeout: 2000 });
    await user.type(search, 'cc');
    await waitFor(() => expect(within(dialog).queryByText('Party')).toBeNull(), { timeout: 2000 });
    release({ data: CONCEPTS });
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(within(dialog).queryByText('Party')).toBeNull();
    expect(within(dialog).getByText('Account')).toBeInTheDocument();
  });

  it('gives focus back to returnFocusTo, an opener that unmounted (BusinessConceptsDisplay)', async () => {
    const user = userEvent.setup();
    function Opener() {
      const [open, setOpen] = useState(false);
      const [picked, setPicked] = useState(false);
      const ref = useRef<HTMLButtonElement>(null);
      return (
        <>
          {/* As in BusinessConceptsDisplay: the empty state's Add gives way to the list's Add */}
          {picked ? (
            <button key="list" ref={ref} type="button" onClick={() => setOpen(true)}>Add more</button>
          ) : (
            <button key="empty" ref={ref} type="button" onClick={() => setOpen(true)}>Add Concept</button>
          )}
          <ConceptSelectDialog
            isOpen={open}
            onOpenChange={setOpen}
            onSelect={() => { setPicked(true); setOpen(false); }}
            returnFocusTo={ref}
          />
        </>
      );
    }
    renderWithMantine(<Opener />);
    await user.click(screen.getByRole('button', { name: 'Add Concept' }));
    const dialog = await screen.findByRole('dialog', { name: 'Select Business Concept' });
    await user.click((await within(dialog).findAllByRole('button', { name: 'Select' }))[0]);
    await waitFor(() => expect(screen.getByRole('button', { name: 'Add more' })).toHaveFocus());
  });
});
