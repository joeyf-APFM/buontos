import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { KnowledgeCollection } from '@/types/ontology';
import { CollectionEditorDialog, isNestableParent } from './collection-editor-dialog';

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

/** Opens a Mantine Select by its name and returns its options' texts and its group labels. */
async function openSelect(name: string) {
  const field = screen.getByRole('textbox', { name });
  await userEvent.click(field);
  await waitFor(() => expect(field).toHaveAttribute('aria-controls'));
  const list = document.getElementById(field.getAttribute('aria-controls')!)!;
  return {
    options: within(list).getAllByRole('option', { hidden: true }).map((o) => o.textContent),
    groups: [...list.querySelectorAll('[class*="groupLabel"]')].map((g) => g.textContent),
  };
}

const makeCollection = (overrides: Partial<KnowledgeCollection>): KnowledgeCollection => ({
  iri: 'urn:glossary:x',
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

describe('isNestableParent', () => {
  it('accepts an editable user scheme', () => {
    expect(isNestableParent(makeCollection({ created_by: 'urn:user:alice@example.com' }))).toBe(true);
  });

  it('rejects read-only schemes', () => {
    expect(isNestableParent(makeCollection({ is_editable: false }))).toBe(false);
  });

  it('rejects system (auto-registered) sources even if flagged editable', () => {
    expect(isNestableParent(makeCollection({ created_by: 'urn:user:system' }))).toBe(false);
  });
});

describe('CollectionEditorDialog', () => {
  it('uses Title Case for the create title', () => {
    render(
      <CollectionEditorDialog open onOpenChange={() => {}} collection={null} collections={[]} onSave={async () => {}} />,
    );
    expect(screen.getByText('Create Scheme')).toBeTruthy();
  });

  it('uses Title Case for the edit title', () => {
    render(
      <CollectionEditorDialog
        open
        onOpenChange={() => {}}
        collection={makeCollection({})}
        collections={[]}
        onSave={async () => {}}
      />,
    );
    expect(screen.getByText('Edit Scheme')).toBeTruthy();
  });

  it('uses Scheme wording for the parent field and its root option', async () => {
    render(
      <CollectionEditorDialog open onOpenChange={() => {}} collection={null} collections={[]} onSave={async () => {}} />,
    );
    expect(screen.getByText('Parent Scheme')).toBeTruthy();
    expect(screen.getByRole('textbox', { name: 'Parent Scheme' })).toHaveValue('None (root scheme)');
    expect((await openSelect('Parent Scheme')).options).toEqual(['None (root scheme)']);
  });

  it('defaults the Type of a new scheme to glossary', () => {
    render(
      <CollectionEditorDialog open onOpenChange={() => {}} collection={null} collections={[]} onSave={async () => {}} />,
    );
    expect(screen.getByRole('textbox', { name: 'Type' })).toHaveValue('semantic-models:collections.glossary');
  });

  it('preselects initialCollectionType when creating and saves it', async () => {
    const onSave = vi.fn(async () => {});
    render(
      <CollectionEditorDialog
        open
        onOpenChange={() => {}}
        collection={null}
        collections={[]}
        onSave={onSave}
        initialCollectionType="ontology"
      />,
    );
    expect(screen.getByRole('textbox', { name: 'Type' })).toHaveValue('semantic-models:collections.ontology');
    fireEvent.change(screen.getByRole('textbox', { name: 'common:labels.name' }), { target: { value: 'Core' } });
    fireEvent.click(screen.getByRole('button', { name: 'common:actions.create' }));
    await waitFor(() => expect(onSave).toHaveBeenCalled());
    expect((onSave.mock.calls[0] as any[])[0].collection_type).toBe('ontology');
  });

  it('ignores initialCollectionType when editing', () => {
    render(
      <CollectionEditorDialog
        open
        onOpenChange={() => {}}
        collection={makeCollection({ collection_type: 'taxonomy' })}
        collections={[]}
        onSave={async () => {}}
        initialCollectionType="ontology"
      />,
    );
    // The Type select is create-only; the remaining selects are scope and parent.
    expect(screen.queryByRole('textbox', { name: 'Type' })).toBeNull();
    expect(screen.queryByRole('option', { name: 'semantic-models:collections.ontology', hidden: true })).toBeNull();
  });

  it('groups parent options by type without dash prefixes and keeps exclusions', async () => {
    const editing = makeCollection({ iri: 'urn:edit', label: 'Being edited' });
    render(
      <CollectionEditorDialog
        open
        onOpenChange={() => {}}
        collection={editing}
        collections={[
          makeCollection({
            iri: 'urn:ro',
            label: 'Read-only root',
            is_editable: false,
            child_collections: [
              makeCollection({ iri: 'urn:kid', label: 'Nested child', parent_collection_iri: 'urn:ro' }),
            ],
          }),
          makeCollection({ iri: 'urn:sys', label: 'System', created_by: 'urn:user:system' }),
          makeCollection({ iri: 'urn:tax', label: 'Tax', collection_type: 'taxonomy' }),
          editing,
        ]}
        onSave={async () => {}}
      />,
    );
    const { options, groups } = await openSelect('Parent Scheme');
    expect(groups).toEqual(['Glossaries', 'Taxonomies']);
    // The editable child of a read-only parent is offered, flat, with its
    // parent's name after it (this file's t mock leaves {{parent}} as it is)
    expect(options).toEqual(['None (root scheme)', 'Nested childin {{parent}}', 'Tax']);
    expect(options).not.toContain('Read-only root');
    expect(options).not.toContain('System');
    expect(options).not.toContain('Being edited');
    expect(document.body.textContent).not.toMatch(/[\u2014\u2013]/);
  });
});
