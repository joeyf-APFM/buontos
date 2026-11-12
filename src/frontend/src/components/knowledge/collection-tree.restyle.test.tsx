/**
 * Wave 2 Task 12a: the scheme tree on Mantine. No page renders it today (it
 * is only exported from components/knowledge), so these tests keep its
 * controls: expand and collapse, select, the row menu, and the empty state.
 */
import { describe, expect, it, vi } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import { renderWithMantine, userEvent } from '@/test/utils';
import type { KnowledgeCollection } from '@/types/ontology';
import { CollectionTree } from './collection-tree';

const scheme = (iri: string, label: string, extra: Partial<KnowledgeCollection> = {}): KnowledgeCollection => ({
  iri, label, collection_type: 'glossary', scope_level: 'enterprise', source_type: 'custom', is_editable: true,
  status: 'active', concept_count: 2, child_collections: [], ...extra,
} as KnowledgeCollection);

const TREE = [
  scheme('urn:finance', 'Finance', { child_collections: [scheme('urn:risk', 'Risk', { parent_collection_iri: 'urn:finance' })] }),
  scheme('urn:fibo', 'FIBO', { is_editable: false, source_type: 'imported', collection_type: 'ontology' }),
];

/** The row menu's items (hidden: in jsdom floating-ui hides a dropdown whose target it takes for clipped). */
async function menuOf(user: ReturnType<typeof userEvent.setup>, name: string) {
  const target = screen.getByRole('button', { name: `Actions for ${name}` });
  await user.click(target);
  const menu = await waitFor(() => {
    const found = document.querySelector<HTMLElement>(`[role="menu"][aria-labelledby="${target.id}"]`);
    expect(found).not.toBeNull();
    return found!;
  });
  return (await within(menu).findAllByRole('menuitem', { hidden: true })).map((i) => i.textContent);
}

describe('collection tree on Mantine', () => {
  it('collection tree keeps every control', async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    const onEdit = vi.fn();
    const onCreate = vi.fn();
    renderWithMantine(
      <CollectionTree
        collections={TREE}
        onSelectCollection={onSelect}
        onCreateCollection={onCreate}
        onEditCollection={onEdit}
        onDeleteCollection={vi.fn()}
        onImportToCollection={vi.fn()}
        onExportCollection={vi.fn()}
        canEdit
      />,
    );

    // Starts expanded; the toggle is named after its scheme
    expect(screen.getByText('Risk')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Collapse Finance' }));
    expect(screen.queryByText('Risk')).toBeNull();
    expect(screen.getByRole('button', { name: 'Expand Finance' })).toHaveAttribute('aria-expanded', 'false');

    await user.click(screen.getByText('FIBO'));
    expect(onSelect).toHaveBeenCalledWith(expect.objectContaining({ iri: 'urn:fibo' }));
    expect(screen.getByRole('img', { name: 'Read-only scheme' })).toBeInTheDocument();

    expect(await menuOf(user, 'Finance')).toEqual(['Edit', 'Export', 'Import', 'Delete']);
    await user.click(screen.getByRole('menuitem', { name: 'Edit', hidden: true }));
    expect(onEdit).toHaveBeenCalledWith(expect.objectContaining({ iri: 'urn:finance' }));
    expect(await menuOf(user, 'FIBO')).toEqual(['Export']);

    await user.click(screen.getByRole('button', { name: 'Create Scheme' }));
    expect(onCreate).toHaveBeenCalled();
  });

  it('collection tree empty state keeps Create Scheme', async () => {
    const user = userEvent.setup();
    const onCreate = vi.fn();
    renderWithMantine(<CollectionTree collections={[]} onSelectCollection={vi.fn()} onCreateCollection={onCreate} canEdit />);
    expect(screen.getByText('No schemes yet')).toBeInTheDocument();
    const creates = screen.getAllByRole('button', { name: 'Create Scheme' });
    expect(creates).toHaveLength(2);
    await user.click(creates[1]);
    expect(onCreate).toHaveBeenCalled();
  });
});
