import { useState, useEffect, useCallback, useMemo } from 'react';
import { UnstyledButton } from '@mantine/core';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Loader2, AlertCircle, RefreshCw, ExternalLink } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import type { LineageGraph } from '@/types/ontology-schema';
import { BusinessLineageView } from '@/components/lineage';
import { Pane, PaneStack } from '@/mantine/page';
import classes from './impact-analysis-panel.module.css';

interface ImpactAnalysisPanelProps {
  entityType: string;
  entityId: string;
  maxDepth?: number;
}

const TYPE_ROUTE_MAP: Record<string, string> = {
  DataProduct: '/data-products',
  DataContract: '/data-contracts',
  DataDomain: '/data-domains',
};

function getEntityRoute(entityType: string, entityId: string): string {
  const base = TYPE_ROUTE_MAP[entityType];
  if (base) return `${base}/${entityId}`;
  return `/assets/${entityId}`;
}

export function ImpactAnalysisPanel({
  entityType,
  entityId,
  maxDepth = 4,
}: ImpactAnalysisPanelProps) {
  const navigate = useNavigate();
  const { t } = useTranslation('common');
  const [graphData, setGraphData] = useState<LineageGraph | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchImpact = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/business-lineage/${entityType}/${entityId}/impact?max_depth=${maxDepth}`
      );
      if (!res.ok) throw new Error(t('common:impactAnalysis.failedStatus', { status: res.status }));
      setGraphData(await res.json());
    } catch (e: any) {
      setError(e.message || t('common:impactAnalysis.failedLoad'));
    } finally {
      setIsLoading(false);
    }
  }, [entityType, entityId, maxDepth, t]);

  useEffect(() => { fetchImpact(); }, [fetchImpact]);

  const groupedImpact = useMemo(() => {
    if (!graphData) return {};
    const groups: Record<string, { entity_id: string; name: string; status?: string | null }[]> = {};
    for (const node of graphData.nodes) {
      if (node.is_center) continue;
      if (!groups[node.entity_type]) groups[node.entity_type] = [];
      groups[node.entity_type].push({
        entity_id: node.entity_id,
        name: node.name,
        status: node.status,
      });
    }
    return groups;
  }, [graphData]);

  const affectedCount = graphData ? graphData.nodes.length - 1 : 0;

  const title = t('common:impactAnalysis.summary');

  if (isLoading) {
    return (
      <Pane title={title}>
        <div className={classes.state}>
          <Loader2 className={classes.spin} />
          <span>{t('common:impactAnalysis.analyzing')}</span>
        </div>
      </Pane>
    );
  }

  if (error) {
    return (
      <Pane title={title}>
        <div className={classes.error}>
          <AlertCircle className={classes.errorIcon} />
          <p>{error}</p>
          <Button variant="outline" size="sm" onClick={fetchImpact}>
            <RefreshCw /> {t('common:retry')}
          </Button>
        </div>
      </Pane>
    );
  }

  return (
    <PaneStack>
      {/* Summary */}
      <Pane
        title={title}
        actions={
          <Badge variant={affectedCount > 0 ? 'secondary' : 'outline'}>
            {t('common:impactAnalysis.affectedCount', { count: affectedCount })}
          </Badge>
        }
      >
        {affectedCount === 0 ? (
          <p className={classes.empty}>
            {t('common:impactAnalysis.noDownstream', { type: entityType })}
          </p>
        ) : (
          <div className={classes.groups}>
            {Object.entries(groupedImpact).map(([type, entities]) => (
              <div key={type}>
                <h4 className={classes.groupTitle}>
                  {type.replace(/([A-Z])/g, ' $1').trim()} ({entities.length})
                </h4>
                <div className={classes.chips}>
                  {entities.map((e) => (
                    <UnstyledButton
                      key={e.entity_id}
                      className={classes.chip}
                      onClick={() => navigate(getEntityRoute(type, e.entity_id))}
                    >
                      {e.name}
                      <ExternalLink aria-hidden />
                    </UnstyledButton>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </Pane>

      {/* Graph visualization: its own library, in a pane */}
      {affectedCount > 0 && (
        <Pane aria-label={t('common:impactAnalysis.graph')} flush>
          <BusinessLineageView
            entityType={entityType}
            entityId={entityId}
            direction="downstream"
            maxDepth={maxDepth}
            showToolbar={false}
            className={classes.graph}
            bare
          />
        </Pane>
      )}
    </PaneStack>
  );
}
