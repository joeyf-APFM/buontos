import { useState, useEffect, useCallback, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert } from '@mantine/core';
import { AlertCircle, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ListViewSkeleton } from '@/components/common/list-view-skeleton';
import { PageHeader, PageLayout, Pane } from '@/mantine/page';
import type { KnowledgeCollection } from '@/types/ontology';
import useBreadcrumbStore from '@/stores/breadcrumb-store';
import { usePermissions } from '@/stores/permissions-store';
import { FeatureAccessLevel } from '@/types/feature-access-levels';
import { useToast } from '@/hooks/use-toast';
import {
  CollectionsTab,
  CollectionEditorDialog,
} from '@/components/knowledge';
import classes from './collections.module.css';

export default function CollectionsView() {
  const { t } = useTranslation(['semantic-models', 'common']);
  const { toast } = useToast();
  const { hasPermission } = usePermissions();

  const canWrite = hasPermission('semantic-models', FeatureAccessLevel.READ_WRITE);

  // Data state
  const [isLoading, setIsLoading] = useState(true);
  const [collections, setCollections] = useState<KnowledgeCollection[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [selectedCollection, setSelectedCollection] = useState<KnowledgeCollection | null>(null);

  // Dialog state
  const [collectionEditorOpen, setCollectionEditorOpen] = useState(false);
  const [editingCollection, setEditingCollection] = useState<KnowledgeCollection | null>(null);

  // Breadcrumbs
  const setStaticSegments = useBreadcrumbStore((state) => state.setStaticSegments);

  useEffect(() => {
    setStaticSegments([
      { label: t('semantic-models:title'), path: '/ontology' },
      { label: t('semantic-models:tabs.collections'), path: '/collections' },
    ]);
  }, [setStaticSegments, t]);

  // Fetch data. A reload that a newer one overtook drops its answer.
  const loadId = useRef(0);
  const fetchData = useCallback(async () => {
    const id = ++loadId.current;
    setIsLoading(true);
    try {
      const res = await fetch('/api/knowledge/collections?hierarchical=true');
      if (id !== loadId.current) return;
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body?.detail || t('semantic-models:collections.loadFailed', 'Could not load the schemes.'));
      }
      const data = await res.json();
      if (id !== loadId.current) return;
      setCollections(Array.isArray(data?.collections) ? data.collections : []);
      setLoadError(null);
    } catch (error) {
      if (id !== loadId.current) return;
      console.error('Failed to fetch collections:', error);
      setLoadError(error instanceof Error ? error.message : String(error));
    } finally {
      if (id === loadId.current) setIsLoading(false);
    }
  }, [t]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Collection handlers
  const handleCreateCollection = () => {
    setEditingCollection(null);
    setCollectionEditorOpen(true);
  };

  const handleEditCollection = (collection: KnowledgeCollection) => {
    setEditingCollection(collection);
    setCollectionEditorOpen(true);
  };

  const handleSaveCollection = async (data: any, isNew: boolean) => {
    try {
      const url = isNew
        ? '/api/knowledge/collections'
        : `/api/knowledge/collections/${encodeURIComponent(editingCollection!.iri)}`;
      const method = isNew ? 'POST' : 'PATCH';

      const response = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.detail || 'Failed to save scheme');
      }

      toast({
        title: t('common:toast.success'),
        description: isNew
          ? t('semantic-models:messages.collectionCreated')
          : t('semantic-models:messages.collectionUpdated'),
      });

      setCollectionEditorOpen(false);
      await fetchData();
    } catch (error: any) {
      toast({
        title: t('common:toast.error'),
        description: error.message,
        variant: 'destructive',
      });
      throw error;
    }
  };

  const handleDeleteCollection = async (collection: KnowledgeCollection) => {
    if (!confirm(t('semantic-models:messages.confirmDeleteCollection', { name: collection.label }))) {
      return;
    }

    try {
      const response = await fetch(
        `/api/knowledge/collections/${encodeURIComponent(collection.iri)}`,
        { method: 'DELETE' }
      );

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.detail || 'Failed to delete scheme');
      }

      toast({
        title: t('common:toast.success'),
        description: t('semantic-models:messages.collectionDeleted'),
      });

      await fetchData();
    } catch (error: any) {
      toast({
        title: t('common:toast.error'),
        description: error.message,
        variant: 'destructive',
      });
    }
  };

  const handleExportCollection = async (collection: KnowledgeCollection, format: 'turtle' | 'rdfxml') => {
    try {
      const response = await fetch(
        `/api/knowledge/collections/${encodeURIComponent(collection.iri)}/export?format=${format}`
      );

      if (!response.ok) {
        throw new Error('Export failed');
      }

      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${collection.label || 'collection'}.${format === 'turtle' ? 'ttl' : 'rdf'}`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (error: any) {
      toast({
        title: t('common:toast.error'),
        description: error.message,
        variant: 'destructive',
      });
    }
  };

  const listPane = t('semantic-models:collections.listPane', 'Scheme list');

  return (
    <PageLayout
      header={
        <>
          <PageHeader
            title={t('semantic-models:tabs.collections')}
            actions={
              canWrite && (
                <Button onClick={handleCreateCollection}>
                  <Plus aria-hidden />
                  {t('semantic-models:actions.createCollection')}
                </Button>
              )
            }
          />
          <p className={classes.subtitle}>
            {collections.length} {t('semantic-models:collections.title').toLowerCase()}
          </p>
        </>
      }
    >
      {isLoading ? (
        <Pane flush aria-label={listPane}>
          <div className={classes.body}>
            <ListViewSkeleton columns={6} rows={3} toolbarButtons={1} />
          </div>
        </Pane>
      ) : loadError ? (
        <Pane flush aria-label={listPane}>
          <div className={`${classes.body} ${classes.state}`}>
            <Alert
              color="red"
              variant="light"
              icon={<AlertCircle />}
              title={t('semantic-models:collections.loadFailed', 'Could not load the schemes.')}
              className={classes.alert}
            >
              {loadError}
            </Alert>
            <Button variant="outline" onClick={fetchData}>{t('common:retry')}</Button>
          </div>
        </Pane>
      ) : (
        <CollectionsTab
          collections={collections}
          selectedCollection={selectedCollection}
          onSelectCollection={setSelectedCollection}
          onEditCollection={handleEditCollection}
          onDeleteCollection={handleDeleteCollection}
          onExportCollection={handleExportCollection}
          canEdit={canWrite}
        />
      )}

      {/* Collection Editor Dialog */}
      <CollectionEditorDialog
        open={collectionEditorOpen}
        onOpenChange={setCollectionEditorOpen}
        collection={editingCollection}
        collections={collections}
        onSave={handleSaveCollection}
      />
    </PageLayout>
  );
}
