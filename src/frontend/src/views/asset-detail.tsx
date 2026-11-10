import { useState, useEffect, useCallback, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  ArrowLeft, AlertCircle, Pencil, Trash2, Network, GitBranch,
  LayoutGrid, Share2,
} from 'lucide-react';
import { Alert } from '@mantine/core';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { TabsDetailSkeleton } from '@/components/common/list-view-skeleton';
import { AssetDeleteDialog } from '@/components/assets/asset-delete-dialog';
import DomainBadgeList from '@/components/ui/domain-badge-list';
import { AssetRead } from '@/types/asset';
import { EntityTypeDefinition } from '@/types/ontology-schema';
import { AssetFormDialog } from '@/components/common/asset-form-dialog';
import { BusinessLineageGraph } from '@/components/common/business-lineage-graph';
import { ImpactAnalysisPanel } from '@/components/common/impact-analysis-panel';
import { BusinessLineageView } from '@/components/lineage';
import { LineageEditor } from '@/components/common/lineage-editor';
import { useTranslation } from 'react-i18next';
import { useApi } from '@/hooks/use-api';
import { RelativeDate } from '@/components/common/relative-date';
import { EntityTreePanel } from '@/components/common/entity-tree-panel';
import { OwnershipPanel } from '@/components/common/ownership-panel';
import { CommentSidebar } from '@/components/comments';
import { RatingPanel } from '@/components/ratings';
import EntityMetadataPanel from '@/components/metadata/entity-metadata-panel';
import EntityCostsPanel from '@/components/costs/entity-costs-panel';
import EntityQualityPanel from '@/components/quality/entity-quality-panel';
import ConceptSelectDialog from '@/components/semantic/concept-select-dialog';
import LinkedConceptChips from '@/components/semantic/linked-concept-chips';
import AssetMetricViewCard, { mayBeMetricView } from '@/components/assets/asset-metric-view-card';
import type { EntitySemanticLink } from '@/types/semantic-link';
import { useToast } from '@/hooks/use-toast';
import { usePermissions } from '@/stores/permissions-store';
import { FeatureAccessLevel } from '@/types/settings';
import useBreadcrumbStore from '@/stores/breadcrumb-store';
import { Breadcrumb, DetailsGrid, PageHeader, PageLayout, Pane, PaneStack, Tabs, type DetailsRow } from '@/mantine/page';
import classes from './asset-detail.module.css';

const STATUS_VARIANT: Record<string, 'default' | 'secondary' | 'outline' | 'destructive'> = {
  draft: 'outline',
  active: 'default',
  deprecated: 'secondary',
  archived: 'destructive',
};

function PropertyValue({ value }: { value: any }) {
  const { t } = useTranslation(['assets', 'common']);
  if (value === null || value === undefined) {
    return <span className={classes.null}>{t('assets:detail.nullValue')}</span>;
  }
  if (typeof value === 'boolean') {
    return <Badge variant={value ? 'default' : 'secondary'}>{value ? t('assets:detail.yes') : t('assets:detail.no')}</Badge>;
  }
  if (typeof value === 'object') {
    return <pre className={classes.json}>{JSON.stringify(value, null, 2)}</pre>;
  }
  return <span>{String(value)}</span>;
}

function PropertiesPane({ properties }: { properties?: Record<string, any> | null }) {
  const { t } = useTranslation(['assets', 'common']);
  if (!properties || Object.keys(properties).length === 0) {
    return null;
  }

  return (
    <Pane title={t('assets:detail.properties')}>
      <DetailsGrid
        rows={Object.entries(properties).map(([key, value]) => ({
          label: key.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()),
          value: <PropertyValue value={value} />,
        }))}
      />
    </Pane>
  );
}

/** Label / value rows, leaving out the empty ones. */
const rowsOf = (rows: (DetailsRow | false | null | undefined | '' | 0)[]): DetailsRow[] =>
  rows.filter((r): r is DetailsRow => !!r);

export default function AssetDetailView() {
  const { assetId } = useParams<{ assetId: string }>();
  const navigate = useNavigate();

  const [asset, setAsset] = useState<AssetRead | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [isCommentSidebarOpen, setIsCommentSidebarOpen] = useState(false);
  const [ontologyIri, setOntologyIri] = useState<string | null>(null);
  const [isLineageEditorOpen, setIsLineageEditorOpen] = useState(false);
  const [relViewMode, setRelViewMode] = useState<'table' | 'graph'>('table');
  const [semanticLinks, setSemanticLinks] = useState<EntitySemanticLink[]>([]);
  const [iriDialogOpen, setIriDialogOpen] = useState(false);

  const { get: apiGet, post: apiPost, delete: apiDelete } = useApi();
  const { t, i18n } = useTranslation(['assets', 'common']);
  const { toast } = useToast();
  const { hasPermission, isLoading: permissionsLoading } = usePermissions();
  const setStaticSegments = useBreadcrumbStore((state) => state.setStaticSegments);
  const setDynamicTitle = useBreadcrumbStore((state) => state.setDynamicTitle);

  const featureId = 'assets';
  const canWrite = !permissionsLoading && hasPermission(featureId, FeatureAccessLevel.READ_WRITE);
  const canAdmin = !permissionsLoading && hasPermission(featureId, FeatureAccessLevel.ADMIN);
  const canEditSemanticLinks = !permissionsLoading && hasPermission('semantic-models', FeatureAccessLevel.READ_WRITE);

  const entityType = asset?.asset_type_name || 'Asset';

  const ontologyTypeName = useMemo(() => {
    const typeMap: Record<string, string> = {
      'Business Term': 'BusinessTerm',
      'Logical Entity': 'LogicalEntity',
      'Logical Attribute': 'LogicalAttribute',
      'Delivery Channel': 'DeliveryChannel',
      'Table': 'Table',
      'View': 'View',
      'Column': 'Column',
      'ML Model': 'MLModel',
      'API Endpoint': 'APIEndpoint',
    };
    return typeMap[entityType] || entityType.replace(/\s+/g, '');
  }, [entityType]);

  const showLineageTab = true;

  const isBusinessTerm = ontologyTypeName === 'BusinessTerm';
  const isPolicy = ontologyTypeName === 'Policy';
  const isLogicalEntity = ontologyTypeName === 'LogicalEntity';

  const fetchAsset = useCallback(async () => {
    if (!assetId) return;
    setLoading(true);
    setError(null);
    try {
      const [assetRes, linksRes] = await Promise.all([
        apiGet<AssetRead>(`/api/assets/${assetId}`),
        apiGet<EntitySemanticLink[]>(`/api/semantic-links/entity/asset/${assetId}`),
      ]);
      if (assetRes.error) throw new Error(assetRes.error);
      setAsset(assetRes.data ?? null);
      setSemanticLinks(Array.isArray(linksRes.data) ? linksRes.data : []);
    } catch (err: any) {
      setError(err.message || t('assets:detail.loadError'));
    } finally {
      setLoading(false);
    }
  }, [assetId, apiGet]);

  useEffect(() => {
    fetchAsset();
  }, [fetchAsset]);

  const addSemanticLink = useCallback(async (iri: string) => {
    if (!assetId) return;
    try {
      const res = await apiPost<EntitySemanticLink>(`/api/semantic-links/`, {
        entity_id: assetId,
        entity_type: 'asset',
        iri,
      });
      if (res.error) throw new Error(res.error);
      // Optimistically refresh just the links rather than re-loading the whole asset
      const refreshed = await apiGet<EntitySemanticLink[]>(`/api/semantic-links/entity/asset/${assetId}`);
      setSemanticLinks(Array.isArray(refreshed.data) ? refreshed.data : []);
      setIriDialogOpen(false);
      toast({ title: t('common:toast.linked'), description: t('assets:detail.conceptLinked') });
    } catch (e: any) {
      toast({ title: t('common:states.error'), description: e?.message || t('assets:detail.linkConceptError'), variant: 'destructive' });
    }
  }, [assetId, apiPost, apiGet, toast]);

  const removeSemanticLink = useCallback(async (linkId: string) => {
    if (!assetId) return;
    try {
      const res = await apiDelete(`/api/semantic-links/${linkId}`);
      if (res.error) throw new Error(res.error);
      const refreshed = await apiGet<EntitySemanticLink[]>(`/api/semantic-links/entity/asset/${assetId}`);
      setSemanticLinks(Array.isArray(refreshed.data) ? refreshed.data : []);
      toast({ title: t('assets:detail.removed'), description: t('assets:detail.conceptLinkRemoved') });
    } catch (e: any) {
      toast({ title: t('common:states.error'), description: e?.message || t('assets:detail.removeLinkError'), variant: 'destructive' });
    }
  }, [assetId, apiDelete, apiGet, toast]);

  useEffect(() => {
    if (asset) {
      setStaticSegments([
        { label: t('assets:explorer.title'), path: '/assets' },
      ]);
      setDynamicTitle(asset.name);
      // Resolve ontology IRI for the asset type
      (async () => {
        try {
          const resp = await apiGet<EntityTypeDefinition[]>(`/api/ontology/entity-types?tier=asset&lang=${encodeURIComponent(i18n.language)}`);
          if (!resp.error && Array.isArray(resp.data)) {
            const match = resp.data.find(
              (t) => t.label === asset.asset_type_name || t.local_name === asset.asset_type_name
            );
            setOntologyIri(match?.iri ?? null);
          }
        } catch { /* non-critical */ }
      })();
    }
    return () => { setStaticSegments([]); setDynamicTitle(null); };
  }, [asset, setStaticSegments, setDynamicTitle]);


  const backButton = (
    <Button variant="outline" onClick={() => navigate(-1)} size="sm">
      <ArrowLeft /> {t('common:actions.back')}
    </Button>
  );

  if (loading) {
    // Asset Detail uses a tabbed layout (Overview / Relationships / Lineage /
    // Impact) above a hero title row. Match that structure.
    return (
      <div className={classes.state}>
        <TabsDetailSkeleton tabs={4} actionButtons={5} contentVariant="two-col" />
      </div>
    );
  }

  if (error || !asset) {
    return (
      <div className={classes.state}>
        <Breadcrumb />
        <div className={classes.stateBack}>{backButton}</div>
        <Alert color="red" variant="light" icon={<AlertCircle size={16} />} title={t('common:states.error')}>
          {error || t('assets:detail.notFound')}
        </Alert>
      </div>
    );
  }

  const domainLabel = asset.domains && asset.domains.length > 1 ? t('assets:detail.domains') : t('common:labels.domain');
  const detailRows = rowsOf([
    asset.location && { label: t('assets:table.location'), value: <span className={classes.location}>{asset.location}</span> },
    asset.platform && { label: t('assets:table.platform'), value: asset.platform },
    ((asset.domains && asset.domains.length > 0) || asset.domain_id) && {
      label: domainLabel,
      value: (
        <DomainBadgeList
          domains={asset.domains}
          domainIds={asset.domain_id ? [asset.domain_id] : []}
          primaryDomainId={asset.primary_domain_id ?? asset.domain_id}
          onDomainClick={(id) => navigate(`/settings/data-domains/${id}`)}
        />
      ),
    },
    asset.created_by && { label: t('common:labels.createdBy'), value: asset.created_by },
    { label: t('common:labels.created'), value: <RelativeDate date={asset.created_at} /> },
    { label: t('common:labels.updated'), value: <RelativeDate date={asset.updated_at} /> },
    asset.tags && asset.tags.length > 0 && {
      label: t('common:labels.tags'),
      value: (
        <span className={classes.chips}>
          {asset.tags.map((tag) => <Badge key={tag} variant="secondary">{tag}</Badge>)}
        </span>
      ),
    },
  ]);

  const properties = asset.properties;

  return (
    <>
      <PageLayout
        breadcrumb={<Breadcrumb items={[{ label: t('assets:explorer.title'), to: '/assets' }, { label: asset.name }]} />}
        header={
          <>
            <PageHeader
              title={asset.name}
              badges={
                <>
                  <Badge variant={STATUS_VARIANT[asset.status] ?? 'outline'}>{asset.status}</Badge>
                  <span className={classes.tag}>{entityType}</span>
                  {asset.platform && <span className={classes.platform}>{asset.platform}</span>}
                </>
              }
              actions={
                <>
                  {backButton}
                  <CommentSidebar
                    entityType="asset"
                    entityId={assetId!}
                    isOpen={isCommentSidebarOpen}
                    onToggle={() => setIsCommentSidebarOpen(!isCommentSidebarOpen)}
                  />
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => navigate(`/hierarchy?type=${ontologyTypeName}&id=${assetId}`)}
                  >
                    <Network /> {t('assets:detail.viewInHierarchy')}
                  </Button>
                  {showLineageTab && canWrite && (
                    <Button variant="outline" size="sm" onClick={() => setIsLineageEditorOpen(true)}>
                      <GitBranch /> {t('assets:detail.manageLineage')}
                    </Button>
                  )}
                  <Button variant="outline" size="sm" disabled={!canWrite} onClick={() => setIsEditOpen(true)}>
                    <Pencil /> {t('common:actions.edit')}
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className={classes.danger}
                    disabled={!canAdmin}
                    onClick={() => setIsDeleteDialogOpen(true)}
                  >
                    <Trash2 /> {t('common:actions.delete')}
                  </Button>
                </>
              }
            />
            {asset.description && <p className={classes.description}>{asset.description}</p>}
          </>
        }
      >
        <div className={classes.body}>
          <Tabs defaultValue="overview" classNames={{ tabSection: classes.tabIcon }}>
            <Tabs.List>
              <Tabs.Tab value="overview">{t('assets:detail.tabs.overview')}</Tabs.Tab>
              <Tabs.Tab value="relationships">{t('assets:detail.tabs.relationships')}</Tabs.Tab>
              {showLineageTab && (
                <Tabs.Tab value="lineage" leftSection={<GitBranch aria-hidden />}>
                  {t('assets:detail.tabs.lineage')}
                </Tabs.Tab>
              )}
              {(isPolicy || isBusinessTerm) && (
                <Tabs.Tab value="impact">{t('assets:detail.tabs.impact')}</Tabs.Tab>
              )}
            </Tabs.List>

            <Tabs.Panel value="overview">
              <PaneStack>
                {/* Core metadata: the explorer's details grid */}
                <Pane title={t('common:labels.details')}>
                  <DetailsGrid rows={detailRows} />

                  {/* Linked Business Concepts */}
                  {(semanticLinks.length > 0 || canEditSemanticLinks) && (
                    <div className={classes.section}>
                      <h3 className={classes.sectionTitle}>{t('assets:detail.linkedConcepts')}</h3>
                      <LinkedConceptChips
                        links={semanticLinks}
                        onRemove={canEditSemanticLinks ? removeSemanticLink : undefined}
                        trailing={canEditSemanticLinks ? (
                          <Button size="sm" variant="outline" onClick={() => setIriDialogOpen(true)}>{t('common:actions.add')}</Button>
                        ) : undefined}
                      />
                    </div>
                  )}
                </Pane>

                {/* Type-specific: BusinessTerm - Definition & Synonyms */}
                {isBusinessTerm && properties && (
                  <Pane title={t('assets:detail.businessDefinition')}>
                    <DetailsGrid
                      rows={rowsOf([
                        properties.definition && { label: t('assets:detail.definition'), value: properties.definition },
                        properties.synonyms && {
                          label: t('assets:detail.synonyms'),
                          value: (
                            <span className={classes.chips}>
                              {String(properties.synonyms).split(',').map((s) => (
                                <Badge key={s.trim()} variant="secondary">{s.trim()}</Badge>
                              ))}
                            </span>
                          ),
                        },
                        properties.examples && {
                          label: t('assets:detail.examples'),
                          value: <span className={classes.muted}>{properties.examples}</span>,
                        },
                      ])}
                    />
                  </Pane>
                )}

                {/* Type-specific: LogicalEntity - Domain & Supertype */}
                {isLogicalEntity && properties && (
                  <Pane title={t('assets:detail.logicalModel')}>
                    <DetailsGrid
                      rows={rowsOf([
                        properties.entityDomain && { label: t('common:labels.domain'), value: properties.entityDomain },
                        properties.entitySupertype && { label: t('assets:detail.supertype'), value: properties.entitySupertype },
                      ])}
                    />
                  </Pane>
                )}

                {/* Type-specific: Policy - Type & Enforcement */}
                {isPolicy && properties && (
                  <Pane title={t('assets:detail.policyDetails')}>
                    <DetailsGrid
                      rows={rowsOf([
                        properties.policyType && {
                          label: t('assets:detail.policyType'),
                          value: <Badge variant="outline">{properties.policyType}</Badge>,
                        },
                        properties.enforcementLevel && {
                          label: t('assets:detail.enforcement'),
                          value: <Badge variant="outline">{properties.enforcementLevel}</Badge>,
                        },
                        properties.policyContent && {
                          label: t('assets:detail.content'),
                          value: <span className={classes.preWrap}>{properties.policyContent}</span>,
                        },
                      ])}
                    />
                  </Pane>
                )}

                {/* A Unity Catalog metric view: its fields and their concept links */}
                {mayBeMetricView(asset) && (
                  <AssetMetricViewCard assetId={asset.id} assetTypeName={asset.asset_type_name} />
                )}

                {/* Properties (non-type-specific fields) */}
                {!isBusinessTerm && <PropertiesPane properties={properties} />}

                {/* Quick relationship summary on overview */}
                <EntityTreePanel
                  entityType={ontologyTypeName}
                  entityId={asset.id}
                  title={t('assets:detail.tabs.relationships')}
                  canEdit={canWrite}
                  pane
                />
              </PaneStack>
            </Tabs.Panel>

            <Tabs.Panel value="relationships">
              {/* The view toggle sits above the stack, which holds only panes */}
              <div className={classes.viewToggle}>
                <Button
                  variant={relViewMode === 'table' ? 'default' : 'outline'}
                  size="icon"
                  aria-label={t('assets:detail.tableView')}
                  aria-pressed={relViewMode === 'table'}
                  onClick={() => setRelViewMode('table')}
                >
                  <LayoutGrid />
                </Button>
                <Button
                  variant={relViewMode === 'graph' ? 'default' : 'outline'}
                  size="icon"
                  aria-label={t('assets:detail.graphView')}
                  aria-pressed={relViewMode === 'graph'}
                  onClick={() => setRelViewMode('graph')}
                >
                  <Share2 />
                </Button>
              </div>
              <PaneStack>
                {relViewMode === 'table' ? (
                  <EntityTreePanel
                    entityType={ontologyTypeName}
                    entityId={asset.id}
                    title={t('assets:detail.allRelationships')}
                    canEdit={canWrite}
                    pane
                  />
                ) : (
                  <Pane aria-label={t('assets:detail.relationshipGraph')} flush>
                    <BusinessLineageGraph
                      entityType={ontologyTypeName}
                      entityId={asset.id}
                      entityName={asset.name}
                      className={classes.graph}
                      source="relationships"
                    />
                  </Pane>
                )}
              </PaneStack>
            </Tabs.Panel>

            {showLineageTab && (
              <Tabs.Panel value="lineage">
                <PaneStack>
                  <Pane aria-label={t('assets:detail.tabs.lineage')} flush>
                    <BusinessLineageView
                      entityType={ontologyTypeName}
                      entityId={asset.id}
                      className={classes.graph}
                      bare
                    />
                  </Pane>
                </PaneStack>
              </Tabs.Panel>
            )}

            {(isPolicy || isBusinessTerm) && (
              <Tabs.Panel value="impact">
                <ImpactAnalysisPanel
                  entityType={ontologyTypeName}
                  entityId={asset.id}
                  maxDepth={4}
                />
              </Tabs.Panel>
            )}
          </Tabs>

          {/* The panes under the tabs, on every tab: the shared panels (Task 8),
              then the ratings, costs and quality panes */}
          <PaneStack>
            <OwnershipPanel objectType="asset" objectId={assetId!} canAssign={canWrite} />
            <EntityMetadataPanel entityId={assetId!} entityType="asset" />
            <RatingPanel
              entityType="asset"
              entityId={assetId!}
              title={t('assets:detail.ratingsReviews')}
              showDistribution
              allowSubmit
              pane
            />
            <EntityCostsPanel entityId={assetId!} entityType="asset" pane />
            <EntityQualityPanel entityId={assetId!} entityType="asset" pane />
          </PaneStack>
        </div>
      </PageLayout>

      {/* Edit dialog */}
      <AssetFormDialog
        isOpen={isEditOpen}
        onOpenChange={setIsEditOpen}
        onSuccess={() => fetchAsset()}
        assetTypeId={asset.asset_type_id}
        assetTypeName={asset.asset_type_name || 'Asset'}
        assetTypeIri={ontologyIri}
        asset={asset}
      />

      {/* Lineage Editor */}
      {showLineageTab && (
        <LineageEditor
          isOpen={isLineageEditorOpen}
          onOpenChange={setIsLineageEditorOpen}
          entityType={ontologyTypeName}
          entityId={asset.id}
          entityName={asset.name}
          onSuccess={() => fetchAsset()}
        />
      )}

      {/* Delete confirmation */}
      {assetId && (
        <AssetDeleteDialog
          open={isDeleteDialogOpen}
          onOpenChange={setIsDeleteDialogOpen}
          assetId={assetId}
          assetName={asset?.name || ''}
          onDeleted={() => navigate(-1)}
        />
      )}

      {/* Concept linker */}
      <ConceptSelectDialog
        isOpen={iriDialogOpen}
        onOpenChange={setIriDialogOpen}
        onSelect={addSemanticLink}
      />
    </>
  );
}
