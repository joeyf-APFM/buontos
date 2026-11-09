import { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, Button, Menu, Pagination, Select, TextInput, UnstyledButton } from '@mantine/core';
import { useDebouncedValue } from '@mantine/hooks';
import { useTranslation } from 'react-i18next';
import { Plus } from 'lucide-react';
import { AssetFormDialog } from '@/components/common/asset-form-dialog';
import { usePermissions } from '@/stores/permissions-store';
import { FeatureAccessLevel } from '@/types/settings';
import type { AssetStatus, AssetTypeRead, DataBranch } from '@/types/asset';
import type { EntityTypeDefinition } from '@/types/ontology-schema';
import { useHelixStore } from '@/mantine/helix/helix-store';
import {
  fetchAsset, fetchAssetTypes, fetchAssets, fetchOntologyAssetTypes, type AssetSummary, type TreeNode,
} from './api';
import { AssetTree, type TreeSelection } from './asset-tree';
import { AssetTable } from './asset-table';
import { DetailsPanel } from './details-panel';
import classes from './explorer.module.css';

const PAGE_SIZE = 50;
const STATUSES: AssetStatus[] = ['active', 'draft', 'deprecated', 'retired'];
const BRANCHES: Record<string, DataBranch> = { 'branch:uc': 'uc', 'branch:internal': 'internal', 'branch:external': 'external' };

/** The data branch a node sits in, for presetting new assets. */
const branchOf = ({ node, ancestors }: TreeSelection): DataBranch | undefined =>
  BRANCHES[(ancestors[0] ?? node).key];

/** Type and type-group nodes stand for one asset type; new assets there are of that type. */
const nodeTypeName = (node: TreeNode) => (node.kind === 'type' || node.kind === 'group' ? node.assetTypeName : undefined);

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
  const [nameInput, setNameInput] = useState('');
  const [name] = useDebouncedValue(nameInput.trim(), 250);
  const [typeFilter, setTypeFilter] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<string | null>(null);
  const [conceptFilter, setConceptFilter] = useState<string | null>(null);
  const [listToken, setListToken] = useState(0);
  const [treeToken, setTreeToken] = useState(0);
  const [selectedAsset, setSelectedAsset] = useState<AssetSummary | null>(null);
  const [nodeStatus, setNodeStatus] = useState<{ key: string; status: AssetStatus } | null>(null);
  const [assetTypes, setAssetTypes] = useState<AssetTypeRead[]>([]);
  const [ontologyTypes, setOntologyTypes] = useState<EntityTypeDefinition[]>([]);
  const [createType, setCreateType] = useState<AssetTypeRead | null>(null);

  const onSelectNode = useCallback(
    (next: TreeSelection) => {
      setSelection(next);
      setNameInput('');
      setTypeFilter(null);
      setStatusFilter(null);
      setConceptFilter(null);
      setSelectedAsset(null);
      setContext(next.node.label);
    },
    [setContext],
  );

  const onSelectAsset = (asset: AssetSummary) => {
    setSelectedAsset(asset);
    setContext(asset.location ?? asset.name);
  };

  const closeDetails = () => {
    setSelectedAsset(null);
    setContext(node?.label ?? null);
  };

  // The page number belongs to one node and filter: any change starts again at page 1
  const nodeKey = node?.key;
  const listKey = JSON.stringify([nodeKey, name, typeFilter, statusFilter]);
  const [pageState, setPageState] = useState({ listKey: '', number: 1 });
  const pageNumber = pageState.listKey === listKey ? pageState.number : 1;
  const setPageNumber = (number: number) => setPageState({ listKey, number });

  // The assets under the selected node, with the request they answer
  const query = useMemo(
    () => ({
      node: nodeKey ?? '',
      name: name || undefined,
      types: typeFilter ? [typeFilter] : undefined,
      status: statusFilter ?? undefined,
      skip: (pageNumber - 1) * PAGE_SIZE,
      limit: PAGE_SIZE,
    }),
    [nodeKey, name, typeFilter, statusFilter, pageNumber],
  );
  const requestKey = JSON.stringify([query, listToken]);
  const [answer, setAnswer] = useState<{ requestKey: string; page: Page; error: string | null } | null>(null);
  useEffect(() => {
    if (!query.node) return;
    let cancelled = false;
    fetchAssets(query)
      .then((result) => !cancelled && setAnswer({ requestKey, page: result, error: null }))
      .catch((e: Error) => !cancelled && setAnswer({ requestKey, page: { items: [], total: 0 }, error: e.message }));
    return () => {
      cancelled = true;
    };
  }, [query, requestKey]);
  const loading = answer?.requestKey !== requestKey;
  const page = answer?.page ?? { items: [], total: 0 };
  const error = !loading ? answer.error : null;

  // An asset node's own status, for the header badge
  const nodeAssetId = node?.kind === 'asset' ? node.assetId : undefined;
  useEffect(() => {
    if (!nodeKey || !nodeAssetId) return;
    let cancelled = false;
    fetchAsset(nodeAssetId)
      .then((a) => !cancelled && setNodeStatus({ key: nodeKey, status: a.status }))
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [nodeKey, nodeAssetId, treeToken]);

  // Asset types, for the Type filter and New asset; ontology types for the create form
  useEffect(() => {
    if (!canRead) return;
    fetchAssetTypes().then(setAssetTypes).catch(() => {});
  }, [canRead]);
  useEffect(() => {
    if (!canWrite) return;
    fetchOntologyAssetTypes(i18n.language).then(setOntologyTypes).catch(() => {});
  }, [canWrite, i18n.language]);

  // Concepts are labels only, so the Concept filter narrows the loaded page
  const conceptOptions = useMemo(() => {
    const labels = new Set(page.items.flatMap((a) => a.concepts));
    if (conceptFilter) labels.add(conceptFilter);
    return [...labels].sort((a, b) => a.localeCompare(b));
  }, [page.items, conceptFilter]);
  const rows = conceptFilter ? page.items.filter((a) => a.concepts.includes(conceptFilter)) : page.items;

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
                  /
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
                title={t('conceptOnPage')}
                data={conceptOptions}
                value={conceptFilter}
                onChange={setConceptFilter}
                searchable
                clearable
              />
              <span className={classes.count}>{t('count', { count: conceptFilter ? rows.length : page.total })}</span>
            </div>

            <div className={classes.tableWrap}>
              <AssetTable
                items={rows}
                loading={loading}
                error={error}
                onRetry={() => setListToken((n) => n + 1)}
                selectedId={selectedAsset?.id ?? null}
                onSelect={onSelectAsset}
              />
            </div>
            {pages > 1 && (
              <div className={classes.pager}>
                <Pagination size="xs" total={pages} value={pageNumber} onChange={setPageNumber} />
              </div>
            )}
          </>
        )}
      </section>

      {selectedAsset && !helixOpen && <DetailsPanel asset={selectedAsset} onClose={closeDetails} />}

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
