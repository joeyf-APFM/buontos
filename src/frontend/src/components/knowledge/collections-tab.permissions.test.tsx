/**
 * Wave 2 Task 11c fix round 1 (R45): the selected collection's metadata panel
 * may edit only for a user who may edit collections (the tab's `canEdit`)
 * and write on data-domains (the metadata routes' feature).
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup } from '@testing-library/react';
import { renderWithMantine } from '@/test/utils';
import usePermissionsStore from '@/stores/permissions-store';
import { FeatureAccessLevel } from '@/types/settings';
import type { KnowledgeCollection } from '@/types/ontology';

const { metadataProps } = vi.hoisted(() => ({ metadataProps: [] as Array<{ canEdit?: boolean }> }));
vi.mock('@/components/metadata/entity-metadata-panel', () => ({
  default: (props: { canEdit?: boolean }) => { metadataProps.push(props); return null; },
}));

import { CollectionsTab } from './collections-tab';

const COLLECTION = {
  iri: 'urn:collection:sales', label: 'Sales glossary', collection_type: 'glossary', scope_level: 'enterprise',
  is_editable: true, status: 'draft', concept_count: 0,
} as unknown as KnowledgeCollection;

function render(canEdit: boolean, domains: FeatureAccessLevel) {
  cleanup();
  usePermissionsStore.setState({
    permissions: { 'semantic-models': FeatureAccessLevel.READ_WRITE, 'data-domains': domains },
    availableRoles: [], appliedRoleId: null, isLoading: false, _initAttempted: true, _isInitializing: false,
  });
  metadataProps.length = 0;
  renderWithMantine(
    <CollectionsTab
      collections={[COLLECTION]}
      selectedCollection={COLLECTION}
      onSelectCollection={vi.fn()}
      onEditCollection={vi.fn()}
      onDeleteCollection={vi.fn()}
      onExportCollection={vi.fn()}
      canEdit={canEdit}
    />,
  );
  return metadataProps[metadataProps.length - 1]?.canEdit;
}

afterEach(() => { cleanup(); vi.clearAllMocks(); });

describe('collections tab metadata permission', () => {
  it('collections tab: the metadata panel edits only with collection edit and data-domains write', () => {
    expect(render(true, FeatureAccessLevel.READ_WRITE)).toBe(true);
    expect(render(true, FeatureAccessLevel.READ_ONLY)).toBe(false);
    expect(render(false, FeatureAccessLevel.READ_WRITE)).toBe(false);
  });
});
