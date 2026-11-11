import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, fireEvent, within } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import type { KnowledgeCollection } from '@/types/ontology';
import { renderWithMantine } from '@/test/utils';
import { pick, selectField } from '@/test/kit-dialog';
import dialogKit from '@/mantine/page/dialog.module.css';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, options?: any) => {
      if (typeof options === 'string') return options;
      if (options && typeof options === 'object' && 'defaultValue' in options) {
        return (options.defaultValue as string)
          .replace('{{count}}', String(options.count ?? ''))
          .replace('{{files}}', String(options.files ?? ''));
      }
      return key;
    },
    i18n: { language: 'en', changeLanguage: vi.fn() },
  }),
}));

import { ImportConceptsDialog } from './import-concepts-dialog';

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
  make({ iri: 'urn:coll:b', label: 'Locked', is_editable: false }),
];

const NO_EDITABLE_MSG = 'No editable schemes available. Create one first.';
const READ_ONLY_HINT = /Only editable schemes can receive imports/;

beforeEach(() => {
  global.fetch = vi.fn(async () => ({
    ok: true,
    status: 200,
    json: async () => ({ success: true, triples_imported: 42 }),
  })) as unknown as typeof fetch;
});

function renderDialog(props: Partial<React.ComponentProps<typeof ImportConceptsDialog>> = {}) {
  return renderWithMantine(
    <ImportConceptsDialog
      open
      onOpenChange={vi.fn()}
      collections={COLLECTIONS}
      onImported={vi.fn()}
      {...props}
    />
  );
}

describe('ImportConceptsDialog (multi-file + scheme strategy)', () => {
  it('renders both scheme-strategy options and the reconcile note', () => {
    renderDialog();
    expect(screen.getByText('One scheme')).toBeInTheDocument();
    expect(screen.getByText('One scheme per file')).toBeInTheDocument();
    // conflicts reconciled later, NOT here
    expect(screen.getByText(/reconciled later in the Review Board/i)).toBeInTheDocument();
  });

  it('accepts multiple files and lists them', () => {
    renderDialog();
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    const f1 = new File(['@prefix : <urn:x#> .'], 'a.ttl', { type: 'text/turtle' });
    const f2 = new File(['@prefix : <urn:y#> .'], 'b.ttl', { type: 'text/turtle' });
    fireEvent.change(input, { target: { files: [f1, f2] } });
    expect(screen.getByText('a.ttl')).toBeInTheDocument();
    expect(screen.getByText('b.ttl')).toBeInTheDocument();
  });

  it('explains one-scheme-per-file and drops the target selector when chosen', () => {
    renderDialog();
    // Target selector is visible for the default (merge) strategy.
    expect(screen.getByText('Target concept scheme')).toBeInTheDocument();
    fireEvent.click(screen.getByText('One scheme per file'));
    // Now shows the per-file note and hides the target selector (each file
    // creates its own scheme, so no target selection is needed).
    expect(
      screen.getByText(/each file creates a new scheme named after the file/i)
    ).toBeInTheDocument();
    expect(screen.queryByText('Target concept scheme')).not.toBeInTheDocument();
  });
});

describe('ImportConceptsDialog (target scheme select)', () => {
  const targetSelect = () => selectField(screen.getByRole('dialog'), 'Target concept scheme');
  /** Opens the target list and returns it (Mantine renders the options only while it's open). */
  const openTarget = async (user: ReturnType<typeof userEvent.setup>) => {
    await user.click(targetSelect());
    return document.getElementById(targetSelect().getAttribute('aria-controls') ?? '') as HTMLElement;
  };

  it('keeps the form in the kit body, which pads it so focus rings are not clipped', () => {
    renderDialog();
    const form = screen.getByRole('dialog').querySelector('form')!;
    expect(form.parentElement).toHaveClass(dialogKit.body);
  });

  it('groups editable schemes by type, alphabetically, with no dash prefixes', async () => {
    const user = userEvent.setup();
    renderDialog({
      collections: [
        make({ iri: 'urn:o', label: 'Ontology B', collection_type: 'ontology' }),
        make({
          iri: 'urn:g',
          label: 'zeta glossary',
          child_collections: [
            make({ iri: 'urn:g:child', label: 'Alpha child', parent_collection_iri: 'urn:g' }),
          ],
        }),
        make({ iri: 'urn:t', label: 'Tax', collection_type: 'taxonomy' }),
      ],
    });
    const list = await openTarget(user);
    const labels = [...list.querySelectorAll('[class*="groupLabel"]')].map((el) => el.textContent);
    expect(labels).toEqual(['Glossaries', 'Taxonomies', 'Ontologies']);
    // Create-new stays first; within a type, alphabetical, the parent as muted text
    expect(within(list).getAllByRole('option', { hidden: true }).map((o) => o.textContent)).toEqual([
      '＋ Create a new scheme…',
      // the parent's "in {{parent}}" (this file's t stub leaves it unfilled)
      expect.stringMatching(/^Alpha childin /),
      'zeta glossary',
      'Tax',
      'Ontology B',
    ]);
    expect(list.textContent).not.toMatch(/[\u2014\u2013]/);
  });

  it('selecting a scheme sets its iri', async () => {
    const user = userEvent.setup();
    renderDialog();
    await pick(user, targetSelect(), 'Finance');
    expect(targetSelect()).toHaveValue('Finance');
  });

  it('shows the read-only hint only when a read-only scheme exists', () => {
    const { unmount } = renderDialog();
    expect(screen.getByText(READ_ONLY_HINT)).toBeInTheDocument();
    unmount();
    renderDialog({ collections: [make({ iri: 'urn:coll:a', label: 'Finance' })] });
    expect(screen.queryByText(READ_ONLY_HINT)).not.toBeInTheDocument();
  });

  it('detects a read-only scheme nested in the tree', () => {
    renderDialog({
      collections: [
        make({
          iri: 'urn:p',
          label: 'Parent',
          child_collections: [make({ iri: 'urn:c', label: 'Bundled', is_editable: false })],
        }),
      ],
    });
    expect(screen.getByText(READ_ONLY_HINT)).toBeInTheDocument();
  });

  it('hides the hint for the per-file strategy', () => {
    renderDialog();
    fireEvent.click(screen.getByText('One scheme per file'));
    expect(screen.queryByText(READ_ONLY_HINT)).not.toBeInTheDocument();
  });

  it('does not show the empty message when only a child scheme is editable', async () => {
    renderDialog({
      collections: [
        make({
          iri: 'urn:p',
          label: 'Read-only parent',
          is_editable: false,
          child_collections: [
            make({ iri: 'urn:c', label: 'Editable child', parent_collection_iri: 'urn:p' }),
          ],
        }),
      ],
    });
    expect(screen.queryByText(NO_EDITABLE_MSG)).not.toBeInTheDocument();
    const list = await openTarget(userEvent.setup());
    expect(within(list).getByRole('option', { name: /^Editable child/, hidden: true })).toBeInTheDocument();
  });

  it('shows the empty message when no scheme is editable', () => {
    renderDialog({ collections: [make({ iri: 'urn:b', label: 'Locked', is_editable: false })] });
    expect(screen.getByText(NO_EDITABLE_MSG)).toBeInTheDocument();
  });
});
