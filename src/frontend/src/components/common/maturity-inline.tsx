import { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { HoverCard } from '@mantine/core';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import {
  CheckCircle2, XCircle, AlertTriangle, Loader2, RefreshCw,
} from 'lucide-react';
import { MaturityBadge } from '@/components/common/maturity-badge';
import type { MaturityReport, LevelResult } from '@/types/maturity';
import classes from './maturity-inline.module.css';

interface MaturityInlineProps {
  entityType: 'DataProduct' | 'DataContract';
  entityId: string;
  /** Render as a compact column (for header badges area) vs inline row */
  compact?: boolean;
}

const API_PREFIX: Record<string, string> = {
  DataProduct: '/api/data-products',
  DataContract: '/api/data-contracts',
};

const GATE_ICON: Record<string, typeof CheckCircle2> = {
  pass: CheckCircle2,
  fail: XCircle,
  warn: AlertTriangle,
};

export function MaturityInline({ entityType, entityId, compact = false }: MaturityInlineProps) {
  const { t } = useTranslation('common');
  const [report, setReport] = useState<MaturityReport | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isEvaluating, setIsEvaluating] = useState(false);
  const { toast } = useToast();

  const prefix = API_PREFIX[entityType] || API_PREFIX.DataProduct;

  const fetchReport = useCallback(async () => {
    setIsLoading(true);
    try {
      const res = await fetch(`${prefix}/${entityId}/maturity`);
      if (res.ok) setReport(await res.json());
    } catch { /* silent */ }
    setIsLoading(false);
  }, [entityId, prefix]);

  const evaluate = useCallback(async () => {
    setIsEvaluating(true);
    try {
      const res = await fetch(`${prefix}/${entityId}/maturity/evaluate`, { method: 'POST' });
      if (res.ok) {
        const data = await res.json();
        setReport(data);
        const passed = data.gates_passed ?? 0;
        const total = data.gates_total ?? 0;
        const level = data.achieved_level_name || t('common:maturity.notAssessed');
        toast({
          title: t('common:maturity.evaluatedTitle'),
          description: t('common:maturity.evaluatedDescription', { level, passed, total }),
        });
      } else {
        toast({ title: t('common:maturity.evaluationFailed'), description: t('common:maturity.serverReturned', { status: res.status }), variant: 'destructive' });
      }
    } catch (e) {
      toast({ title: t('common:maturity.evaluationFailed'), description: String(e), variant: 'destructive' });
    }
    setIsEvaluating(false);
  }, [entityId, prefix, toast]);

  useEffect(() => { fetchReport(); }, [fetchReport]);

  if (isLoading) {
    return <Loader2 className={`${classes.loading} ${classes.spin}`} />;
  }

  if (!report) {
    return <span className={classes.muted}>—</span>;
  }

  const achievedLevel = report.levels.find(l => l.achieved && l.level_order === report.achieved_level_order);
  const levelName = report.achieved_level_name || t('common:maturity.notAssessed');
  const passed = report.gates_passed ?? 0;
  const total = report.gates_total ?? 0;

  if (compact) {
    // Beside a title: "Maturity <level> ↻", the label drawn first (its
    // place in the markup, after the level, keeps the badge's name)
    return (
      <HoverCard openDelay={200} position="bottom-end" withinPortal shadow="md">
        <HoverCard.Target>
          <div className={classes.compact} role="button" tabIndex={0}>
            <span className={classes.level}>{levelName}</span>
            <button
              type="button"
              className={classes.refresh}
              onClick={(e) => { e.preventDefault(); e.stopPropagation(); evaluate(); }}
              title={t('common:maturity.reEvaluate')}
            >
              {isEvaluating ? <Loader2 className={classes.spin} /> : <RefreshCw />}
            </button>
            <span className={classes.label}>{t('common:maturity.label')}</span>
          </div>
        </HoverCard.Target>
        <HoverCard.Dropdown className={classes.card}>
          <HoverDetail report={report} levelName={levelName} passed={passed} total={total} />
        </HoverCard.Dropdown>
      </HoverCard>
    );
  }

  return (
    <div className={classes.inline}>
      <HoverCard openDelay={200} position="bottom-start" withinPortal shadow="md">
        <HoverCard.Target>
          <button type="button" className={classes.badgeButton}>
            <MaturityBadge
              levelName={report.achieved_level_name}
              levelIcon={achievedLevel?.level_icon}
              levelColor={achievedLevel?.level_color}
              levelOrder={report.achieved_level_order}
              totalLevels={report.total_levels}
            />
          </button>
        </HoverCard.Target>
        <HoverCard.Dropdown className={classes.card}>
          <HoverDetail report={report} levelName={levelName} passed={passed} total={total} />
        </HoverCard.Dropdown>
      </HoverCard>
      <span className={classes.count}>
        {passed}/{total}
      </span>
      <Button
        variant="ghost" size="icon"
        className={classes.evaluate}
        onClick={evaluate}
        disabled={isEvaluating}
        title={t('common:maturity.reEvaluate')}
      >
        {isEvaluating ? <Loader2 className={classes.spin} /> : <RefreshCw />}
      </Button>
    </div>
  );
}

function HoverDetail({ report, levelName, passed, total }: {
  report: MaturityReport; levelName: string; passed: number; total: number;
}) {
  const { t } = useTranslation('common');
  return (
    <div className={classes.detail}>
      <div className={classes.detailHead}>
        <p className={classes.detailTitle}>{t('common:maturity.labelWithLevel', { level: levelName })}</p>
        <span className={classes.muted}>
          {t('common:maturity.gatesCount', { passed, total })}
        </span>
      </div>
      <div className={classes.levels}>
        {report.levels.map((level: LevelResult) => (
          <LevelRow key={level.level_order} level={level} />
        ))}
      </div>
      {report.evaluated_at && (
        <p className={classes.evaluated}>
          {t('common:maturity.evaluatedAt', { date: new Date(report.evaluated_at).toLocaleString() })}
        </p>
      )}
    </div>
  );
}

function LevelRow({ level }: { level: LevelResult }) {
  const hasFails = level.gates.some(g => !g.passed && g.required);
  const hasWarns = level.gates.some(g => !g.passed && !g.required);
  const status = hasFails ? 'fail' : hasWarns ? 'warn' : 'pass';
  const Icon = GATE_ICON[status];
  const passed = level.gates.filter(g => g.passed).length;

  return (
    <div className={classes.levelRow}>
      <Icon className={classes.gate} data-status={status} />
      <span className={classes.order}>{level.level_order}</span>
      <span className={classes.levelName} data-achieved={level.achieved || undefined}>
        {level.level_name}
      </span>
      <span className={classes.small}>
        {passed}/{level.gates.length}
      </span>
    </div>
  );
}
