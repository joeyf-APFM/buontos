import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Button, Menu, Pagination, Select, TextInput, UnstyledButton } from '@mantine/core';
import { useTranslation } from 'react-i18next';
import { Plus } from 'lucide-react';
import { AssetFormDialog } from '@/components/common/asset-form-dialog';
import { usePermissions } from '@/stores/permissions-store';
import { FeatureAccessLevel } from '@/types/settings';
import type { AssetRead, AssetStatus, AssetTypeRead, DataBranch } from '@/types/asset';
import type { EntityTypeDefinition } from '@/types/ontology-schema';
import { useHelixStore } from '@/mantine/helix/helix-store';
import {
  fetchAsset, fetchAssetTypes, fetchAssets, fetchOntologyAssetTypes, searchConcepts,
  type AssetSummary, type ConceptOption, type TreeNode,
} from './api';
import { AssetTree, type TreeSelection } from './asset-tree';
import { AssetTable } from './asset-table';
import { useExpansions } from './use-expansions';
import { DetailsPanel } from './details-panel';
import classes from './explorer.module.css';

const PAGE_SIZE = 50;
const EMPTY_PAGE: Page = { items: [], total: 0 };
const STATUSES: AssetStatus[] = ['active', 'draft', 'deprecated', 'retired'];
const BRANCHES: Record<string, DataBranch> = { 'branch:uc': 'uc', 'branch:internal': 'internal', 'branch:external': 'external' };

/** The data branch a node sits in, for presetting new assets. */
const branchOf = ({ node, ancestors }: TreeSelection): DataBranch | undefined =>
  BRANCHES[(ancestors[0] ?? node).key];

/** Type nodes stand for one asset type; new assets there are of that type. */
const nodeTypeName = (node: TreeNode) => (node.kind === 'type' ? node.assetTypeName : undefined);

interface Page {
  items: AssetSummary[];
  total: number;
}

/** The Asset Explorer: the asset tree, the assets under the selected node, and a row's details. */
export default function ExplorerPage() {
  const { t, i18n } = useTranslation('asset-explorer');
  const { hasPermission, isLoading: permissionsLoading } = usePermissions();
  const canRead = !permissionsLoading && hasPermission('assets', FeatureAccessLevel.READ_ONLY);
  const canWrite = !permissionsLoading && hasPermission('assets', FeatureAccessLevel.READ_WRITE);

  const helixOpen = useHelixStore((s) => s.isOpen);
  const { setContext, clearContext } = useHelixStore((s) => s.actions);
  // What you were looking at here stops being Helix's context when you leave
  useEffect(() => clearContext, [clearContext]);

  const [selection, setSelection] = useState<TreeSelection | null>(null);
  const node = selection?.node ?? null;
  const nodeKey = node?.key;
  const [nameInput, setNameInput] = useState('');
  const [typeFilter, setTypeFilter] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<string | null>(null);
  const [concept, setConcept] = useState<ConceptOption | null>(null);
  const [conceptSearch, setConceptSearch] = useState('');
  const [conceptOptions, setConceptOptions] = useState<ConceptOption[]>([]);
  const [listToken, setListToken] = useState(0);
  const [treeToken, setTreeToken] = useState(0);
  const [selectedAsset, setSelectedAsset] = useState<AssetSummary | null>(null);
  /** Counts tree selections, so reselecting a node still starts with every row closed. */
  const [selectionCount, setSelectionCount] = useState(0);
  const [editing, setEditing] = useState<AssetRead | null>(null);
  const [editError, setEditError] = useState<string | null>(null);
  const [editPendingId, setEditPendingId] = useState<string | null>(null);
  // For async answers: which asset is selected now, and the node's Helix
  // context (its label; for a column, its full name once the asset is in)
  const selectedIdRef = useRef<string | null>(null);
  const nodeContextRef = useRef<string | null>(null);
  /** What Helix should see when no row is selected. */
  const nodeContext = () => nodeContextRef.current;
  // After a save: the edited asset, and the list refresh that has to include it
  const afterSave = useRef<{ id: string; listToken: number } | null>(null);
  const [nodeStatus, setNodeStatus] = useState<{ key: string; status: AssetStatus } | null>(null);
  const [assetTypes, setAssetTypes] = useState<AssetTypeRead[]>([]);
  const [ontologyTypes, setOntologyTypes] = useState<EntityTypeDefinition[]>([]);
  const [createType, setCreateType] = useState<AssetTypeRead | null>(null);

  const onSelectNode = useCallback(
    (next: TreeSelection) => {
      setSelection(next);
      setSelectionCount((n) => n + 1);
      setNameInput('');
      setTypeFilter(null);
      setStatusFilter(null);
      setConcept(null);
      setConceptSearch('');
      setSelectedAsset(null);
      selectedIdRef.current = null;
      nodeContextRef.current = next.node.label;
      setContext(next.node.label);
    },
    [setContext],
  );

  const onSelectAsset = (asset: AssetSummary) => {
    setSelectedAsset(asset);
    selectedIdRef.current = asset.id;
    setEditError(null);
    setContext(asset.location ?? asset.name);
  };

  const closeDetails = () => {
    setSelectedAsset(null);
    selectedIdRef.current = null;
    setEditError(null);
    setContext(nodeContext());
  };

  // The name filter, 250ms after typing stops. It belongs to the node it was
  // typed under, so a new node starts unfiltered at once.
  const [typedName, setTypedName] = useState<{ nodeKey?: string; name: string }>({ name: '' });
  useEffect(() => {
    const timer = setTimeout(() => setTypedName({ nodeKey, name: nameInput.trim() }), 250);
    return () => clearTimeout(timer);
  }, [nameInput, nodeKey]);
  const name = typedName.nodeKey === nodeKey ? typedName.name : '';

  // The page number belongs to one node and filter: any change starts again at page 1
  const listKey = JSON.stringify([nodeKey, name, typeFilter, statusFilter, concept?.value]);
  const [pageState, setPageState] = useState({ listKey: '', number: 1 });
  const pageNumber = pageState.listKey === listKey ? pageState.number : 1;
  const setPageNumber = (number: number) => setPageState({ listKey, number });

  // Open rows (child rows, column sub-grids) belong to one tree selection, filter and page
  const { expansions, toggle, more, retry } = useExpansions(JSON.stringify([listKey, pageNumber, selectionCount]));
  const filterActive = !!(name || typeFilter || statusFilter || concept);

  // The assets under the selected node, with the request they answer
  const query = useMemo(
    () => ({
      node: nodeKey ?? '',
      name: name || undefined,
      types: typeFilter ? [typeFilter] : undefined,
      status: statusFilter ?? undefined,
      conceptIri: concept?.value,
      skip: (pageNumber - 1) * PAGE_SIZE,
      limit: PAGE_SIZE,
    }),
    [nodeKey, name, typeFilter, statusFilter, concept, pageNumber],
  );
  const requestKey = JSON.stringify([query, listToken]);
  const [answer, setAnswer] = useState<{ requestKey: string; listKey: string; page: Page; error: string | null } | null>(null);
  useEffect(() => {
    if (!query.node) return;
    let cancelled = false;
    fetchAssets(query)
      .then((result) => {
        if (cancelled) return;
        setAnswer({ requestKey, listKey, page: result, error: null });
        // An edited asset that has left the node (say, a new branch or type)
        // takes the details panel with it
        const saved = afterSave.current;
        if (saved && listToken >= saved.listToken) {
          afterSave.current = null;
          if (selectedIdRef.current === saved.id && !result.items.some((a) => a.id === saved.id)) {
            selectedIdRef.current = null;
            setSelectedAsset(null);
            setContext(nodeContextRef.current);
          }
        }
      })
      .catch((e: Error) => !cancelled && setAnswer({ requestKey, listKey, page: EMPTY_PAGE, error: e.message }));
    return () => {
      cancelled = true;
    };
  }, [query, requestKey, listKey, listToken, setContext]);
  const loading = answer?.requestKey !== requestKey;
  // While loading, the previous rows stay only when just the page changed
  const current = !!answer && (answer.requestKey === requestKey || answer.listKey === listKey);
  const page = current ? answer.page : EMPTY_PAGE;
  const error = !loading ? answer.error : null;

  // An asset node's own status, for the header badge. A column's Helix
  // context is its full name, which only the asset itself has (columns' tree
  // labels may be short).
  const nodeAssetId = node?.kind === 'asset' ? node.assetId : undefined;
  const nodeIsColumn = node?.assetTypeName === 'Column';
  useEffect(() => {
    if (!nodeKey || !nodeAssetId) return;
    let cancelled = false;
    fetchAsset(nodeAssetId)
      .then((a) => {
        if (cancelled) return;
        setNodeStatus({ key: nodeKey, status: a.status });
        if (nodeIsColumn && a.location) {
          nodeContextRef.current = a.location;
          if (!selectedIdRef.current) setContext(a.location);
        }
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [nodeKey, nodeAssetId, nodeIsColumn, treeToken, setContext]);

  // Asset types, for the Type filter and New asset; ontology types for the create form
  useEffect(() => {
    if (!canRead) return;
    fetchAssetTypes().then(setAssetTypes).catch(() => {});
  }, [canRead]);
  useEffect(() => {
    if (!canWrite) return;
    fetchOntologyAssetTypes(i18n.language).then(setOntologyTypes).catch(() => {});
  }, [canWrite, i18n.language]);

  // Concept options come from the concept search, 250ms after typing stops
  useEffect(() => {
    const q = conceptSearch.trim();
    if (!q) return;
    let cancelled = false;
    const timer = setTimeout(() => {
      searchConcepts(q)
        .then((found) => !cancelled && setConceptOptions(found))
        .catch(() => !cancelled && setConceptOptions([]));
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [conceptSearch]);
  const conceptData = useMemo(() => {
    // One option per IRI (Select rejects duplicate values), the chosen one included
    const byIri = new Map<string, ConceptOption>(concept ? [[concept.value, concept]] : []);
    conceptOptions.forEach(({ value, label }) => byIri.has(value) || byIri.set(value, { value, label: label || value }));
    return [...byIri.values()];
  }, [conceptOptions, concept]);

  if (permissionsLoading) return null;
  if (!canRead) {
    return (
      <div className={classes.noAccess}>
        <Alert color="red">{t('noAccess')}</Alert>
      </div>
    );
  }

  const fixedType = node && nodeTypeName(node) ? assetTypes.find((ty) => ty.name === nodeTypeName(node)) : undefined;
  const ontologyIri = (typeName: string) =>
    ontologyTypes.find((o) => o.label === typeName || o.local_name === typeName)?.iri ?? null;
  const status = nodeStatus && nodeStatus.key === nodeKey ? nodeStatus.status : null;
  const pages = Math.ceil(page.total / PAGE_SIZE);
  const crumbs: { label: string; node?: TreeNode }[] = selection
    ? [
        ...(selection.section !== 'data' ? [{ label: t(`tree.sections.${selection.section}`) }] : []),
        ...selection.ancestors.map((a) => ({ label: a.label, node: a })),
      ]
    : [];
  const selectAncestor = (ancestor: TreeNode) => {
    const { ancestors, section } = selection!;
    onSelectNode({ node: ancestor, ancestors: ancestors.slice(0, ancestors.indexOf(ancestor)), section });
  };

  // The panel shows the row as the latest answer has it (after an edit, that
  // answer is the refresh); while a refresh loads, the row as saved
  const shownAsset = selectedAsset && ((!loading && page.items.find((a) => a.id === selectedAsset.id)) || selectedAsset);

  // The edit form needs the full asset. One fetch at a time per asset, and
  // its answer counts only while that asset is still selected.
  const editAsset = (asset: AssetSummary) => {
    if (editPendingId === asset.id) return;
    setEditError(null);
    setEditPendingId(asset.id);
    const stillSelected = () => selectedIdRef.current === asset.id;
    fetchAsset(asset.id)
      .then((full) => stillSelected() && setEditing(full))
      .catch((e: Error) => stillSelected() && setEditError(e.message))
      .finally(() => setEditPendingId((id) => (id === asset.id ? null : id)));
  };

  // After a save: show the saved fields at once, then refresh the list (which
  // may no longer hold the asset) and the tree counts
  const onEdited = (saved: AssetRead) => {
    if (shownAsset) {
      const updated: AssetSummary = {
        ...shownAsset,
        name: saved.name,
        description: saved.description,
        asset_type_id: saved.asset_type_id,
        asset_type_name: saved.asset_type_name,
        location: saved.location,
        status: saved.status,
        data_branch: saved.data_branch,
        domains: saved.domains ?? shownAsset.domains,
        primary_domain_id: saved.primary_domain_id,
        updated_at: saved.updated_at,
      };
      setSelectedAsset(updated);
      setContext(updated.location ?? updated.name);
      afterSave.current = { id: updated.id, listToken: listToken + 1 };
    }
    setListToken((n) => n + 1);
    setTreeToken((n) => n + 1);
  };

  const newAssetButton = (
    <Button leftSection={<Plus size={13} />} onClick={fixedType ? () => setCreateType(fixedType) : undefined}>
      {t('newAsset')}
    </Button>
  );

  return (
    <div className={classes.page}>
      <AssetTree selectedKey={nodeKey ?? null} onSelect={onSelectNode} refreshToken={treeToken} />

      <section className={classes.main}>
        {node && (
          <>
            <nav className={classes.crumb} aria-label={t('breadcrumb')}>
              {crumbs.map((c, i) => (
                <span key={i}>
                  {c.node ? (
                    <UnstyledButton className={classes.crumbLink} onClick={() => selectAncestor(c.node!)}>
                      {c.label}
                    </UnstyledButton>
                  ) : (
                    c.label
                  )}{' '}
                  /{' '}
                </span>
              ))}
              <span>{node.label}</span>
            </nav>

            <div className={classes.header}>
              <h4 className={classes.title}>{node.label}</h4>
              {node.kind === 'asset' && node.assetTypeName && <span className={classes.tag}>{node.assetTypeName}</span>}
              {status && (
                <span className={classes.tag}>
                  {t(`status.${status}`, status)}
                </span>
              )}
              {canWrite && (
                <div className={classes.headerEnd}>
                  {fixedType ? (
                    newAssetButton
                  ) : (
                    <Menu position="bottom-end" shadow="md">
                      <Menu.Target>{newAssetButton}</Menu.Target>
                      <Menu.Dropdown mah={320} style={{ overflowY: 'auto' }}>
                        <Menu.Label>{t('chooseType')}</Menu.Label>
                        {assetTypes.map((ty) => (
                          <Menu.Item key={ty.id} onClick={() => setCreateType(ty)}>
                            {ty.name}
                          </Menu.Item>
                        ))}
                      </Menu.Dropdown>
                    </Menu>
                  )}
                </div>
              )}
            </div>

            <div className={classes.bar}>
              <TextInput
                className={classes.filter}
                aria-label={t('filter.label')}
                placeholder={t('filter.placeholder')}
                value={nameInput}
                onChange={(e) => setNameInput(e.currentTarget.value)}
              />
              <Select
                className={classes.barSelect}
                aria-label={t('filter.type')}
                placeholder={t('filter.allTypes')}
                data={assetTypes.map((ty) => ty.name)}
                value={typeFilter}
                onChange={setTypeFilter}
                searchable
                clearable
              />
              <Select
                className={classes.barSelect}
                aria-label={t('filter.status')}
                placeholder={t('filter.allStatuses')}
                data={STATUSES.map((s) => ({ value: s, label: t(`status.${s}`) }))}
                value={statusFilter}
                onChange={setStatusFilter}
                clearable
              />
              <Select
                className={classes.barSelect}
                aria-label={t('filter.concept')}
                placeholder={t('filter.allConcepts')}
                data={conceptData}
                value={concept?.value ?? null}
                onChange={(_value, option) => setConcept(option ? { value: option.value, label: option.label } : null)}
                searchable
                searchValue={conceptSearch}
                onSearchChange={setConceptSearch}
                filter={({ options }) => options}
                nothingFoundMessage={t('filter.conceptSearch')}
                clearable
              />
              {(!loading || current) && <span className={classes.count}>{t('count', { count: page.total })}</span>}
            </div>

            {filterActive && <div className={classes.gridHint}>{t('grid.filterHint')}</div>}
            <div className={classes.tableWrap}>
              <AssetTable
                items={page.items}
                loading={loading}
                error={error}
                onRetry={() => setListToken((n) => n + 1)}
                selectedId={selectedAsset?.id ?? null}
                onSelect={onSelectAsset}
                expansions={expansions}
                onToggle={toggle}
                onMore={more}
                onRetryExpansion={retry}
              />
            </div>
            {pages > 1 && (
              <div className={classes.pager}>
                <Pagination size="sm" total={pages} value={pageNumber} onChange={setPageNumber} />
              </div>
            )}
          </>
        )}
      </section>

      {shownAsset && !helixOpen && (
        <DetailsPanel
          asset={shownAsset}
          onClose={closeDetails}
          onEdit={canWrite ? () => editAsset(shownAsset) : undefined}
          editPending={editPendingId === shownAsset.id}
          editError={editError}
        />
      )}

      {editing && (
        <AssetFormDialog
          isOpen
          onOpenChange={(open) => !open && setEditing(null)}
          onSuccess={onEdited}
          assetTypeId={editing.asset_type_id}
          assetTypeName={editing.asset_type_name ?? ''}
          assetTypeIri={editing.asset_type_name ? ontologyIri(editing.asset_type_name) : null}
          asset={editing}
        />
      )}

      {createType && (
        <AssetFormDialog
          isOpen
          onOpenChange={(open) => !open && setCreateType(null)}
          onSuccess={() => {
            setListToken((n) => n + 1);
            setTreeToken((n) => n + 1);
          }}
          assetTypeId={createType.id}
          assetTypeName={createType.name}
          assetTypeIri={ontologyIri(createType.name)}
          defaultDataBranch={selection ? branchOf(selection) : undefined}
        />
      )}
    </div>
  );
}
