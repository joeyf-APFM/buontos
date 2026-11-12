import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert, Loader, UnstyledButton } from '@mantine/core';
import { AlertCircle, History } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useApi } from '@/hooks/use-api';
import { usePagination, PaginationControls } from '@/components/common/paginated-list';
import panel from '@/components/common/panel.module.css';
import classes from './version-history-panel.module.css';

// ---------------------------------------------------------------------------
// VersionHistoryPanel — drives the signed-off versioning contract §1 (version
// info + history) and §2 (per-version detail).
//
// Simple view: entries read as "Edited by {who} on {date}"; the top one is
// "Current", older ones "Previous version". NO version integers, NO IRIs.
// Clicking an older entry loads the frozen definition of that version and shows
// it as "Previous definition: …" — the whole point of the panel.
//
// Advanced view (`.adv-only`): also surfaces v{n}, is_current, and status.
// ---------------------------------------------------------------------------

interface VersionEntry {
  version: number;
  is_current: boolean;
  status?: string | null;
  created_at?: string | null;
  created_by?: string | null;
}

interface VersionInfo {
  iri: string;
  label: string;
  current_version?: number | null;
  status?: string | null;
  versions: VersionEntry[];
  replaces_iri?: string | null;
  replaced_by_iris: string[];
}

interface VersionDetail {
  // The /version/detail endpoint returns the frozen text as `definition`.
  // (Older reads used comment/comments; keep them as fallbacks.)
  definition?: string;
  comment?: string;
  comments?: Record<string, string>;
  [key: string]: unknown;
}

interface VersionHistoryPanelProps {
  conceptIri: string;
  /** Bumped by the parent after a publish, to force a refetch. */
  refreshNonce?: number;
  /**
   * When set, the panel is read-only (e.g. the concept lives in a non-editable
   * scheme) and this short note explains why no new versions can be saved.
   */
  readOnlyNote?: string;
}

const EMPTY_INFO = (iri: string): VersionInfo => ({
  iri,
  label: iri,
  current_version: null,
  versions: [],
  replaced_by_iris: [],
});

function formatDate(iso?: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleDateString();
}

export function VersionHistoryPanel({
  conceptIri,
  refreshNonce = 0,
  readOnlyNote,
}: VersionHistoryPanelProps) {
  const { t } = useTranslation(['semantic-models', 'common']);
  const { get } = useApi();

  const [info, setInfo] = useState<VersionInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Which version's frozen definition is expanded, and the cache of loaded
  // definitions keyed by version so re-clicking is instant.
  const [expandedVersion, setExpandedVersion] = useState<number | null>(null);
  const [detailByVersion, setDetailByVersion] = useState<Record<number, string>>({});
  const [detailLoading, setDetailLoading] = useState<number | null>(null);

  // Each load's turn: an answer for a concept the page has moved on from is dropped
  const loadSeq = useRef(0);
  const fetchInfo = useCallback(async () => {
    if (!conceptIri) return;
    const seq = ++loadSeq.current;
    setLoading(true);
    setError(null);
    try {
      const res = await get<VersionInfo>(
        `/api/semantic-models/concepts/version?iri=${encodeURIComponent(conceptIri)}`,
      );
      if (seq !== loadSeq.current) return;
      // A concept with no version rows (or one the version engine doesn't
      // track, e.g. some imported properties -> 404) simply has no history:
      // show the empty "no previous versions" state, not "unavailable".
      if (res.error && /not found/i.test(res.error)) {
        setInfo(EMPTY_INFO(conceptIri));
        return;
      }
      if (res.error || !res.data) {
        setError(res.error || 'Failed to load version history');
        setInfo(null);
        return;
      }
      setInfo({ ...res.data, versions: Array.isArray(res.data.versions) ? res.data.versions : [] });
    } catch (err: any) {
      if (seq !== loadSeq.current) return;
      setError(err?.message || 'Failed to load version history');
      setInfo(null);
    } finally {
      if (seq === loadSeq.current) setLoading(false);
    }
  }, [conceptIri, get]);

  useEffect(() => {
    fetchInfo();
    // Reset transient expand state whenever the concept or nonce changes.
    setExpandedVersion(null);
    setDetailByVersion({});
  }, [fetchInfo, refreshNonce]);

  const loadDefinition = useCallback(
    async (version: number) => {
      if (version in detailByVersion) return;
      setDetailLoading(version);
      try {
        const res = await get<VersionDetail>(
          `/api/semantic-models/concepts/version/detail?iri=${encodeURIComponent(
            conceptIri,
          )}&version=${version}`,
        );
        const detail = res.data;
        const text =
          detail?.definition ||
          detail?.comment ||
          (detail?.comments && Object.values(detail.comments)[0]) ||
          '';
        setDetailByVersion((prev) => ({ ...prev, [version]: String(text) }));
      } catch {
        setDetailByVersion((prev) => ({ ...prev, [version]: '' }));
      } finally {
        setDetailLoading(null);
      }
    },
    [conceptIri, detailByVersion, get],
  );

  const handleToggle = useCallback(
    (entry: VersionEntry) => {
      // The current version has no "previous definition" to reveal.
      if (entry.is_current) return;
      if (expandedVersion === entry.version) {
        setExpandedVersion(null);
        return;
      }
      setExpandedVersion(entry.version);
      void loadDefinition(entry.version);
    },
    [expandedVersion, loadDefinition],
  );

  const title = t('semantic-models:versionHistory.title', 'Version history');

  // Newest-first. is_current entry sorts to the top regardless of ordering.
  // Computed unconditionally (empty when not loaded) so the pagination hook
  // below is always called in the same order — Rules of Hooks.
  const versions = info ? [...info.versions].sort((a, b) => b.version - a.version) : [];
  const onlyOne = versions.length <= 1;

  // Cap long histories at 10 per page rather than rendering an unbounded list.
  const {
    pageItems: pagedVersions,
    page: versionPage,
    setPage: setVersionPage,
    pageCount: versionPageCount,
  } = usePagination(versions, 10);

  // A flush panel (components/common/panel.module.css): the page's Pane frames it
  const frame = (body: ReactNode) => (
    <div className={panel.pane} data-flush>
      <div className={panel.head}>
        <h3 className={panel.title}>
          <History aria-hidden />
          {title}
        </h3>
      </div>
      <div className={panel.body}>{body}</div>
    </div>
  );

  if (loading) {
    return frame(
      <p className={classes.loading}>
        <Loader size={12} color="currentColor" />
        {t('common:loading', 'Loading…')}
      </p>,
    );
  }

  if (error || !info) {
    return frame(
      <Alert color="red" variant="light" icon={<AlertCircle size={16} />} title={t(
        'semantic-models:versionHistory.unavailable',
        'Version history is unavailable.',
      )}>
        {error && <span className={classes.alertMessage}>{error}</span>}
        <div className={classes.alertActions}>
          <Button variant="outline" size="sm" onClick={() => void fetchInfo()}>
            {t('common:retry')}
          </Button>
        </div>
      </Alert>,
    );
  }

  return frame(
    <>
      {readOnlyNote && (
        <p className={classes.note} data-testid="version-history-readonly-note">
          {readOnlyNote}
        </p>
      )}

      {onlyOne ? (
        <p className={classes.muted}>
          {t('semantic-models:versionHistory.none', 'No previous versions yet.')}
        </p>
      ) : (
        <ul className={classes.list}>
          {pagedVersions.map((entry) => {
            const who =
              entry.created_by ||
              t('semantic-models:versionHistory.unknownEditor', 'someone');
            const when = formatDate(entry.created_at);
            const isExpanded = expandedVersion === entry.version;
            const frozen = detailByVersion[entry.version];

            return (
              <li key={entry.version}>
                <UnstyledButton
                  disabled={entry.is_current}
                  onClick={() => handleToggle(entry)}
                  className={classes.entry}
                  aria-expanded={entry.is_current ? undefined : isExpanded}
                >
                  <span className={classes.dot} data-current={entry.is_current || undefined} />
                  <span className={classes.text}>
                    <span>
                      {t(
                        'semantic-models:versionHistory.editedBy',
                        'Edited by {{who}} on {{when}}',
                        { who, when },
                      )}
                    </span>
                    {/* Advanced-only mechanics: version integer + status. */}
                    <span className={`adv-only ${classes.mechanics}`}>
                      v{entry.version}
                      {entry.is_current
                        ? ' · current'
                        : ''}
                      {entry.status ? ` · ${entry.status}` : ''}
                    </span>
                    {/* Frozen previous definition, on expand. */}
                    {isExpanded && (
                      <span className={classes.frozen}>
                        {detailLoading === entry.version ? (
                          <span className={classes.loading}>
                            <Loader size={12} color="currentColor" />
                            {t('common:loading', 'Loading…')}
                          </span>
                        ) : frozen ? (
                          <>
                            <span className={classes.strong}>
                              {t(
                                'semantic-models:versionHistory.previousDefinition',
                                'Previous definition:',
                              )}
                            </span>{' '}
                            <span className={classes.frozenText}>{frozen}</span>
                          </>
                        ) : (
                          <span className={classes.muted}>
                            {t(
                              'semantic-models:versionHistory.noDefinition',
                              'No definition recorded for this version.',
                            )}
                          </span>
                        )}
                      </span>
                    )}
                  </span>
                  <Badge
                    variant={entry.is_current ? 'secondary' : 'outline'}
                    className={classes.chip}
                  >
                    {entry.is_current
                      ? t('semantic-models:versionHistory.current', 'Current')
                      : t(
                          'semantic-models:versionHistory.previous',
                          'Previous version',
                        )}
                  </Badge>
                </UnstyledButton>
              </li>
            );
          })}
        </ul>
      )}

      {!onlyOne && (
        <PaginationControls
          page={versionPage}
          pageCount={versionPageCount}
          onPageChange={setVersionPage}
        />
      )}
    </>,
  );
}

export default VersionHistoryPanel;
