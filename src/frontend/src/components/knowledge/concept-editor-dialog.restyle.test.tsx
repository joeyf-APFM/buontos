/**
 * Wave 2 Task 13a: the concept editor (ConceptEditorDialog) on the kit Dialog,
 * with Mantine fields. The picker on top of it, and Escape in its Selects,
 * are also checked in a real browser in tests/e2e/concepts-explore.spec.ts
 * (ruling R10); these tests check the structure, the fields' names, Escape in
 * a Select, and a failed save.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, screen, waitFor, within } from '@testing-library/react';
import { renderWithMantine, userEvent } from '@/test/utils';
import { expectKitDialog, expectNoOldMarkup, optionNames, selectField } from '@/test/kit-dialog';
import type { KnowledgeCollection, OntologyConcept } from '@/types/ontology';
import { ConceptEditorDialog } from './concept-editor-dialog';

// The picker stays Radix (R38); it's checked in a real browser. Here it only records its props.
const picker = vi.hoisted(() => ({ props: null as null | Record<string, unknown> }));
vi.mock('@/components/semantic/concept-select-dialog', () => ({
  default: (props: Record<string, unknown>) => {
    picker.props = props;
    return null;
  },
}));

const taxonomy = (iri: string, label: string) =>
  ({ iri, label, collection_type: 'taxonomy', is_editable: true }) as unknown as KnowledgeCollection;
const PRODUCTS = taxonomy('urn:taxonomy:products', 'Product Taxonomy');
const REGIONS = taxonomy('urn:taxonomy:regions', 'Region Taxonomy');

const PROPERTY = {
  iri: 'urn:x:hasOwner',
  label: 'has owner',
  concept_type: 'property',
  property_type: 'object',
  status: 'draft',
  source_context: 'core',
  parent_concepts: [],
  child_concepts: [],
  synonyms: ['owned by'],
  examples: ['Acme has owner Rita'],
} as unknown as OntologyConcept;

function renderEditor(props: Partial<React.ComponentProps<typeof ConceptEditorDialog>> = {}) {
  const onSave = vi.fn(async () => {});
  const onOpenChange = vi.fn();
  renderWithMantine(
    <ConceptEditorDialog
      open
      onOpenChange={onOpenChange}
      concept={null}
      collection={PRODUCTS}
      collections={[PRODUCTS, REGIONS]}
      initialConceptType="concept"
      onSave={onSave}
      {...props}
    />,
  );
  return { onSave, onOpenChange };
}

afterEach(() => {
  cleanup();
  picker.props = null;
});

describe('concept editor on the kit Dialog', () => {
  it('concept editor renders on the kit Dialog with Mantine fields', async () => {
    renderEditor();
    const dialog = await screen.findByRole('dialog', { name: 'Create Entry' });
    expectKitDialog(dialog);
    expectNoOldMarkup(dialog);
    expect(dialog).toHaveAccessibleDescription('Add a new entry to a scheme.');
    // Named fields: the Scheme Select, Label and Definition
    const scheme = selectField(dialog, 'Scheme');
    expect(scheme).toHaveValue('Product Taxonomy');
    expect(within(dialog).getByRole('textbox', { name: 'Label' })).toHaveFocus();
    expect(within(dialog).getByRole('textbox', { name: 'Definition' })).toBeInTheDocument();
    // Synonyms and examples: named inputs and Add buttons
    expect(within(dialog).getByRole('textbox', { name: 'Synonyms' })).toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: 'Add synonym' })).toBeInTheDocument();
    expect(within(dialog).getByRole('textbox', { name: 'Examples' })).toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: 'Add example' })).toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: 'Add Parent' })).toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: 'Cancel' })).toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: 'Create' })).toBeDisabled();
  });

  it('concept editor: editing a property shows its block, its values, and named remove buttons', async () => {
    const user = userEvent.setup();
    renderEditor({ concept: PROPERTY, collection: undefined, initialConceptType: undefined });
    const dialog = await screen.findByRole('dialog', { name: /Edit Entry/ });
    expectKitDialog(dialog);
    expect(dialog).toHaveAccessibleDescription('urn:x:hasOwner');
    expect(within(dialog).getByText('Draft')).toBeInTheDocument();
    const propertyType = selectField(dialog, 'Property Type');
    // Each option: its name over its meaning
    expect(await optionNames(user, propertyType)).toEqual([
      'Object PropertyRelates to other concepts',
      'Datatype PropertyRelates to literal values',
      'Annotation PropertyMetadata annotation',
    ]);
    expect(within(dialog).getByRole('textbox', { name: 'Domain' })).toBeInTheDocument();
    expect(within(dialog).getByRole('textbox', { name: 'Range' })).toBeInTheDocument();
    await user.click(within(dialog).getByRole('button', { name: 'Remove owned by' }));
    expect(within(dialog).queryByText('owned by')).toBeNull();
    await user.click(within(dialog).getByRole('button', { name: 'Remove Acme has owner Rita' }));
    expect(within(dialog).queryByText('Acme has owner Rita')).toBeNull();
  });

  it('concept editor: Escape in the Scheme Select closes only the Select, and the label survives', async () => {
    const user = userEvent.setup();
    const { onOpenChange } = renderEditor();
    const dialog = await screen.findByRole('dialog', { name: 'Create Entry' });
    await user.type(within(dialog).getByRole('textbox', { name: 'Label' }), 'Doohickeys');
    const scheme = selectField(dialog, 'Scheme');
    await user.click(scheme);
    await waitFor(() => expect(scheme).toHaveAttribute('aria-controls'));
    await user.keyboard('{Escape}');
    await waitFor(() => expect(scheme).not.toHaveAttribute('aria-controls'));
    expect(onOpenChange).not.toHaveBeenCalled();
    expect(within(dialog).getByRole('textbox', { name: 'Label' })).toHaveValue('Doohickeys');
    // A second Escape closes the editor
    await user.keyboard('{Escape}');
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it('concept editor: a failed save keeps it open, with no unhandled rejection', async () => {
    const user = userEvent.setup();
    const onSave = vi.fn(async () => {
      throw new Error('Label taken');
    });
    const { onOpenChange } = renderEditor({ onSave });
    const dialog = await screen.findByRole('dialog', { name: 'Create Entry' });
    await user.type(within(dialog).getByRole('textbox', { name: 'Label' }), 'Doohickeys');
    await user.click(within(dialog).getByRole('button', { name: 'Create' }));
    await waitFor(() => expect(onSave).toHaveBeenCalled());
    await waitFor(() => expect(within(dialog).getByRole('button', { name: 'Create' })).toBeEnabled());
    expect(onOpenChange).not.toHaveBeenCalledWith(false);
  });

  it('concept editor: the parent picker gives focus back to Add Parent', async () => {
    const user = userEvent.setup();
    renderEditor();
    const dialog = await screen.findByRole('dialog', { name: 'Create Entry' });
    const addParent = within(dialog).getByRole('button', { name: 'Add Parent' });
    await user.click(addParent);
    const returnFocusTo = picker.props?.returnFocusTo as React.RefObject<HTMLElement> | undefined;
    expect(returnFocusTo?.current).toBe(addParent);
  });

  it('concept editor: with no preset scheme, a concept gets the first fitting scheme', async () => {
    const user = userEvent.setup();
    const onSave = vi.fn(async () => {});
    // No `collection`, and the type (concept) is the dialog's default, so the
    // fitting schemes don't change while it settles
    renderEditor({ collection: undefined, onSave });
    const dialog = await screen.findByRole('dialog', { name: 'Create Entry' });
    await waitFor(() => expect(selectField(dialog, 'Scheme')).toHaveValue('Product Taxonomy'));
    await user.type(within(dialog).getByRole('textbox', { name: 'Label' }), 'Doohickeys');
    await user.click(within(dialog).getByRole('button', { name: 'Create' }));
    await waitFor(() => expect(onSave).toHaveBeenCalled());
    expect(onSave.mock.calls[0]).toEqual([
      expect.objectContaining({ collection_iri: 'urn:taxonomy:products', concept_type: 'concept' }),
      true,
    ]);
  });
});
