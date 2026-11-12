import { useCallback, useEffect, useId, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Collapse, Loader, UnstyledButton } from '@mantine/core'
import {
  ArrowLeft,
  ArrowRight,
  ChevronDown,
  ChevronRight,
  Link as LinkIcon,
} from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { badgeToneStyle, type StatusTone } from '@/components/common/aura-status'
import { useApi } from '@/hooks/use-api'
import panel from '@/components/common/panel.module.css'
import classes from './concept-relations-panel.module.css'

interface NeighborItem {
  direction: 'outgoing' | 'incoming' | 'predicate'
  predicate: string
  display: string
  displayType: 'resource' | 'property' | 'literal'
  stepIri?: string | null
  stepIsResource?: boolean
}

interface ConceptRelationsPanelProps {
  conceptIri: string
  onNavigate: (iri: string) => void
  // When set, the relations list scrolls internally past this row count
  // instead of growing the page (rows are 28px high).
  maxVisibleRows?: number
  // Optional cap on how many neighbours to fetch from the backend.
  fetchLimit?: number
  // When true, render ONLY the relations list body (no collapsible card/header).
  // Used when embedded inside a shared "Relations / Graph" block that owns its
  // own header + view switch (concept detail). Default false keeps the
  // standalone card behaviour unchanged.
  embedded?: boolean
}

// Predicates whose values are already surfaced elsewhere on the page
// (title, type pill, definition, synonyms, examples). Hiding them keeps
// the relations panel focused on actual semantic relationships.
const PREDICATES_TO_HIDE = new Set<string>([
  'http://www.w3.org/1999/02/22-rdf-syntax-ns#type',
  'http://www.w3.org/2000/01/rdf-schema#label',
  'http://www.w3.org/2000/01/rdf-schema#comment',
  'http://www.w3.org/2004/02/skos/core#prefLabel',
  'http://www.w3.org/2004/02/skos/core#altLabel',
  'http://www.w3.org/2004/02/skos/core#hiddenLabel',
  'http://www.w3.org/2004/02/skos/core#definition',
  'http://www.w3.org/2004/02/skos/core#example',
  'http://www.w3.org/2004/02/skos/core#notation',
])

// Predicate NAMESPACES to hide wholesale. The ontos:* namespace is internal
// GOVERNANCE / PROVENANCE metadata (status, version, createdAt/By, publishedAt,
// ownership, conceptType, …) — none of it is a semantic relationship between
// concepts, and surfacing it here confused stewards (e.g. a raw "version →
// 1.0.0" or "status → draft" row that duplicates — and can contradict — the
// header badge + version-history panel). Status/version/ownership each have
// their own dedicated surface; the Relations panel stays focused on real
// broader/narrower/related/domain/range/lineage links.
const PREDICATE_NAMESPACES_TO_HIDE = ['http://ontos.app/ontology#']

// Each relationship family's Aura tone (wave 2 Task 15; were Tailwind colours).
// Falls back to neutral.
const PREDICATE_TONES: Array<[RegExp, StatusTone]> = [
  [/subClassOf$|broader$|broaderTransitive$|subPropertyOf$|broadMatch$/i, 'info'],
  [/narrower$|narrowerTransitive$|narrowMatch$/i, 'good'],
  [/related$|relatedMatch$|seeAlso$/i, 'gold'],
  [/domain$/i, 'accent'],
  [/range$/i, 'accent'],
  [/sameAs$|equivalentClass$|equivalentProperty$|exactMatch$|closeMatch$/i, 'cyan'],
  [/disjointWith$|complementOf$/i, 'critical'],
  [/inverseOf$/i, 'warning'],
  [/isDefinedBy$/i, 'neutral'],
]

const localName = (iri: string): string => {
  if (!iri) return ''
  const fragment = iri.split('#').pop()
  if (fragment && fragment !== iri) return fragment
  const path = iri.split('/').pop()
  return path || iri
}

const toneFor = (predicate: string): StatusTone => {
  for (const [re, tone] of PREDICATE_TONES) {
    if (re.test(predicate)) return tone
  }
  return 'neutral'
}

interface NormalizedRelation {
  key: string
  direction: 'outgoing' | 'incoming'
  predicate: string
  predicateShort: string
  targetLabel: string
  targetIri?: string | null
  isResource: boolean
}

export default function ConceptRelationsPanel({
  conceptIri,
  onNavigate,
  maxVisibleRows,
  fetchLimit = 500,
  embedded = false,
}: ConceptRelationsPanelProps) {
  const { get } = useApi()
  const { t } = useTranslation(['semantic-models', 'common'])

  const [neighbors, setNeighbors] = useState<NeighborItem[] | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [open, setOpen] = useState(true)
  const titleId = useId()
  const bodyId = useId()

  const ROW_HEIGHT_PX = 28
  const listMaxHeight = maxVisibleRows
    ? { maxHeight: ROW_HEIGHT_PX * maxVisibleRows }
    : undefined

  useEffect(() => {
    let cancelled = false
    const load = async () => {
      if (!conceptIri) {
        setNeighbors([])
        return
      }
      setIsLoading(true)
      try {
        const url = `/api/semantic-models/neighbors?iri=${encodeURIComponent(
          conceptIri,
        )}&limit=${fetchLimit}`
        const res = await get<NeighborItem[]>(url)
        if (cancelled) return
        setNeighbors(Array.isArray(res.data) ? res.data : [])
      } catch (err) {
        console.error('ConceptRelationsPanel: failed to load neighbors', err)
        if (!cancelled) setNeighbors([])
      } finally {
        if (!cancelled) setIsLoading(false)
      }
    }
    load()
    return () => {
      cancelled = true
    }
  }, [conceptIri, fetchLimit, get])

  // Normalise + dedupe + sort. Outgoing first, then incoming, then by
  // predicate local name for stable scanning.
  const relations = useMemo<NormalizedRelation[]>(() => {
    if (!neighbors) return []
    const seen = new Set<string>()
    const out: NormalizedRelation[] = []
    for (const n of neighbors) {
      // Predicate-direction items only appear when the IRI itself IS used as
      // a predicate. They are already covered by the inverse triples on the
      // other side, so we ignore them here to avoid double-counting.
      if (n.direction === 'predicate') continue
      if (PREDICATES_TO_HIDE.has(n.predicate)) continue
      if (PREDICATE_NAMESPACES_TO_HIDE.some((ns) => n.predicate.startsWith(ns))) continue
      // A literal whose predicate we hid still shouldn't appear; literals
      // we keep are domain-specific annotations (e.g. dc:identifier).

      const targetIri = n.stepIri || (n.displayType !== 'literal' ? n.display : null)
      const targetLabel =
        n.displayType === 'literal'
          ? n.display
          : localName(n.display) || n.display

      const key = `${n.direction}|${n.predicate}|${n.display}`
      if (seen.has(key)) continue
      seen.add(key)
      out.push({
        key,
        direction: n.direction,
        predicate: n.predicate,
        predicateShort: localName(n.predicate) || n.predicate,
        targetLabel,
        targetIri,
        isResource: !!n.stepIsResource,
      })
    }
    out.sort((a, b) => {
      if (a.direction !== b.direction) {
        return a.direction === 'outgoing' ? -1 : 1
      }
      if (a.predicateShort !== b.predicateShort) {
        return a.predicateShort.localeCompare(b.predicateShort)
      }
      return a.targetLabel.localeCompare(b.targetLabel)
    })
    return out
  }, [neighbors])

  const counts = useMemo(() => {
    let outgoing = 0
    let incoming = 0
    for (const r of relations) {
      if (r.direction === 'outgoing') outgoing += 1
      else incoming += 1
    }
    return { outgoing, incoming, total: relations.length }
  }, [relations])

  const renderRow = useCallback(
    (r: NormalizedRelation) => {
      const DirIcon = r.direction === 'outgoing' ? ArrowRight : ArrowLeft
      const dirTooltip =
        r.direction === 'outgoing'
          ? t('semantic-models:relations.outgoingTooltip', {
              defaultValue: 'This concept → target',
            })
          : t('semantic-models:relations.incomingTooltip', {
              defaultValue: 'Source → this concept',
            })
      return (
        <div
          key={r.key}
          data-testid={`relation-${r.direction}-${r.predicateShort}-${r.targetLabel}`}
          className={classes.row}
        >
          <Badge
            variant="outline"
            className={classes.predicate}
            style={badgeToneStyle(toneFor(r.predicate))}
            title={r.predicate}
          >
            {r.predicateShort}
          </Badge>
          <DirIcon className={classes.direction} aria-label={dirTooltip} />
          {r.isResource && r.targetIri ? (
            <UnstyledButton
              className={classes.target}
              onClick={() => onNavigate(r.targetIri!)}
              title={r.targetIri}
            >
              {r.targetLabel}
            </UnstyledButton>
          ) : (
            <span className={`${classes.target} ${classes.literal}`} title={r.targetLabel}>
              {r.targetLabel}
            </span>
          )}
        </div>
      )
    },
    [onNavigate, t],
  )

  // Just the relations list body — reused by both the standalone panel and the
  // embedded (shared Relations/Graph block) mode.
  const listBody = (
    <div
      className={classes.list}
      data-capped={maxVisibleRows ? '' : undefined}
      style={listMaxHeight}
      data-testid="concept-relations-list"
    >
      {isLoading && relations.length === 0 ? (
        <p className={classes.state}>
          <Loader size={12} color="currentColor" />
          {t('semantic-models:relations.loading', { defaultValue: 'Loading relations...' })}
        </p>
      ) : relations.length === 0 ? (
        <p className={classes.state}>
          {t('semantic-models:relations.empty', {
            defaultValue:
              'No concept-to-concept relations yet. Add broader / narrower / related links, or see the Linked Objects panel for assets and products linked to this concept.',
          })}
        </p>
      ) : (
        relations.map(renderRow)
      )}
    </div>
  )

  // Embedded: no frame/header/fold — the parent block owns those.
  if (embedded) {
    return listBody
  }

  // Standalone: a flush panel (components/common/panel.module.css) whose head
  // folds the list
  return (
    <section className={panel.pane} data-flush aria-labelledby={titleId}>
      <div className={panel.head}>
        <h3 id={titleId} className={panel.title}>
          <UnstyledButton
            className={classes.fold}
            aria-expanded={open}
            aria-controls={bodyId}
            onClick={() => setOpen((o) => !o)}
          >
            {open ? <ChevronDown aria-hidden /> : <ChevronRight aria-hidden />}
            <LinkIcon aria-hidden />
            {t('semantic-models:relations.title', {
              defaultValue: 'Relations',
            })}
            <Badge variant="secondary">{counts.total}</Badge>
            {counts.total > 0 && (
              <span className={classes.counts}>
                <span>
                  <ArrowRight aria-hidden />
                  {counts.outgoing}
                </span>
                <span>
                  <ArrowLeft aria-hidden />
                  {counts.incoming}
                </span>
              </span>
            )}
          </UnstyledButton>
        </h3>
      </div>
      <Collapse in={open} id={bodyId} transitionDuration={0}>
        {listBody}
      </Collapse>
    </section>
  )
}
