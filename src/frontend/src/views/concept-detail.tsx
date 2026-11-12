import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import i18n from 'i18next';
import { Alert, Collapse, Loader, Skeleton, Textarea, UnstyledButton } from '@mantine/core';
import {
  ArrowLeft,
  AlertCircle,
  ChevronDown,
  ChevronRight,
  Pencil,
  Trash2,
  Network,
  Send,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { PrincipalPicker } from '@/components/common/principal-picker';
import { badgeToneStyle } from '@/components/common/aura-status';
import { statusTone } from '@/components/knowledge/concept-tones';
import type {
  KnowledgeCollection,
  OntologyConcept,
} from '@/types/ontology';
import useBreadcrumbStore from '@/stores/breadcrumb-store';
import { useToast } from '@/hooks/use-toast';
import { useApi } from '@/hooks/use-api';
import { usePermissions } from '@/stores/permissions-store';
import { FeatureAccessLevel } from '@/types/feature-access-levels';
import { useKnowledgeGraphStore } from '@/stores/knowledge-graph-store';
import { resolveLabel, resolveComment } from '@/lib/ontology-utils';
import { systemRdfNamespaceDisplayLabel } from '@/lib/system-rdf-namespace-labels';
import { createSchemeLookup } from '@/lib/scheme-lookup';
import ConceptRelationsPanel from '@/components/semantic/concept-relations-panel';
import LinkedObjectsPanel from '@/components/semantic/linked-objects-panel';
import ConceptNeighborhoodGraph from '@/components/semantic/concept-neighborhood-graph';
import { ConceptEditorDialog } from '@/components/knowledge/concept-editor-dialog';
import { OwnershipPanel } from '@/components/common/ownership-panel';
import EntityMetadataPanel from '@/components/metadata/entity-metadata-panel';
import { PublishVersionDialog } from '@/components/semantic/publish-version-dialog';
import { VersionHistoryPanel } from '@/components/semantic/version-history-panel';
import { DeprecateConceptDialog } from '@/components/semantic/deprecate-concept-dialog';
import { TurtleSerializationPanel } from '@/components/semantic/turtle-serialization-panel';
import ApprovalWizardDialog from '@/components/workflows/approval-wizard-dialog';
import {
  RequestConceptActionDialog,
  type ConceptNewVersionOption,
  type ConceptTransitionItem,
} from '@/components/concepts/request-concept-action-dialog';
import { ConceptSummaryPanel } from '@/components/concepts/concept-summary-panel';
import { CommentSidebar } from '@/components/comments';
import { DetailsGrid, Dialog, PageHeader, PageLayout, Pane, PaneStack, type DetailsRow } from '@/mantine/page';
import panel from '@/components/common/panel.module.css';
import common from '@/components/common/detail-page.module.css';
import form from '@/components/common/dialog-form.module.css';
import classes from './concept-detail.module.css';

// Bound list-like sections to ~10 rows of vertical real-estate via internal
// scrolling, so the page stays compact regardless of how many relations or
// linked objects a concept has.
const MAX_VISIBLE_ROWS = 10;

// Lifecycle transitions valid from each status, mirroring the backend
// VALID_TRANSITIONS (semantic_models_manager). Each maps to a by-iri action
// endpoint. draft->under_review is "submit-review"; the rest match their verb.
const STATUS_TRANSITIONS: Record<string, { action: string; to: string; labelKey: string; defaultLabel: string }[]> = {
  draft: [{ action: 'submit-review', to: 'under_review', labelKey: 'semantic-models:lifecycle.submitReview', defaultLabel: 'Submit for review' }],
  under_review: [
    { action: 'approve', to: 'approved', labelKey: 'semantic-models:lifecycle.approve', defaultLabel: 'Approve' },
    { action: 'request-changes', to: 'draft', labelKey: 'semantic-models:lifecycle.requestChanges', defaultLabel: 'Request changes' },
  ],
  approved: [{ action: 'publish', to: 'published', labelKey: 'semantic-models:lifecycle.publish', defaultLabel: 'Publish' }],
  published: [
    { action: 'certify', to: 'certified', labelKey: 'semantic-models:lifecycle.certify', defaultLabel: 'Certify' },
    { action: 'deprecate', to: 'deprecated', labelKey: 'semantic-models:lifecycle.deprecate', defaultLabel: 'Deprecate' },
  ],
  certified: [
    { action: 'deprecate', to: 'deprecated', labelKey: 'semantic-models:lifecycle.deprecate', defaultLabel: 'Deprecate' },
    { action: 'archive', to: 'archived', labelKey: 'semantic-models:lifecycle.archive', defaultLabel: 'Archive' },
  ],
  deprecated: [{ action: 'archive', to: 'archived', labelKey: 'semantic-models:lifecycle.archive', defaultLabel: 'Archive' }],
  archived: [],
};

// Ordered lifecycle chain (forward direction only)
const LIFECYCLE_CHAIN = ['draft', 'under_review', 'approved', 'published', 'certified', 'deprecated', 'archived'];

/**
 * Compute all forward-reachable statuses from a given current status.
 * Returns them as an ordered list with metadata about the next step vs downstream.
 */
function reachableStatuses(currentStatus: string): Array<{
  status: string;
  action: string;
  labelKey: string;
  defaultLabel: string;
  isNextStep: boolean;
}> {
  const chain = LIFECYCLE_CHAIN;
  const idx = chain.indexOf(currentStatus);
  if (idx < 0 || idx === chain.length - 1) return []; // no transitions from archived or unknown status

  const result: Array<{
    status: string;
    action: string;
    labelKey: string;
    defaultLabel: string;
    isNextStep: boolean;
  }> = [];
  const directTransitions = STATUS_TRANSITIONS[currentStatus] ?? [];

  // Iterate from the next status onwards; for each, check if it's reachable
  for (let i = idx + 1; i < chain.length; i++) {
    const targetStatus = chain[i];
    // A status is reachable if there's a path to it via the forward chain
    // (all intermediate steps exist in STATUS_TRANSITIONS)
    let isReachable = true;
    for (let j = idx; j < i; j++) {
      const transitions = STATUS_TRANSITIONS[chain[j]] ?? [];
      if (!transitions.some((tr) => tr.to === chain[j + 1])) {
        isReachable = false;
        break;
      }
    }
    if (isReachable) {
      // Find the transition data from directTransitions if it's the immediate next
      const directTr = directTransitions.find((tr) => tr.to === targetStatus);
      result.push({
        status: targetStatus,
        action: directTr?.action ?? '', // will be computed on walk if empty
        labelKey: directTr?.labelKey ?? `semantic-models:status.${targetStatus}`,
        defaultLabel: directTr?.defaultLabel ?? targetStatus,
        isNextStep: i === idx + 1,
      });
    }
  }
  return result;
}

export default function ConceptDetailView() {
  const params = useParams();
  const rawIri = params['*'] ?? '';
  const navigate = useNavigate();
  const { t } = useTranslation(['semantic-models', 'common']);
  const { get } = useApi();
  const { toast } = useToast();
  const { hasPermission } = usePermissions();
  const bumpRefreshNonce = useKnowledgeGraphStore((s) => s.bumpRefreshNonce);
  const knowledgeGraphRefreshNonce = useKnowledgeGraphStore((s) => s.refreshNonce);
  // Nonce values produced by THIS page's own actions. Those actions already
  // refetch the concept themselves right after bumping, so the cross-view
  // refresh subscription below skips them to avoid a double fetch.
  const selfBumpedNoncesRef = useRef<Set<number>>(new Set());
  const bumpKnowledgeGraphRefresh = useCallback(
    (reason?: string) => {
      bumpRefreshNonce(reason);
      selfBumpedNoncesRef.current.add(useKnowledgeGraphStore.getState().refreshNonce);
    },
    [bumpRefreshNonce],
  );

  const setStaticSegments = useBreadcrumbStore((s) => s.setStaticSegments);
  const setDynamicTitle = useBreadcrumbStore((s) => s.setDynamicTitle);

  // The :iri segment is URL-encoded; double-decoding is harmless because
  // valid IRIs do not contain literal '%' characters in their canonical form.
  const conceptIri = useMemo(() => {
    if (!rawIri) return '';
    try {
      return decodeURIComponent(rawIri);
    } catch {
      return rawIri;
    }
  }, [rawIri]);

  const canWrite = hasPermission('semantic-models', FeatureAccessLevel.READ_WRITE);
  // The metadata routes check data-domains
  const canWriteDomains = hasPermission('data-domains', FeatureAccessLevel.READ_WRITE);

  const [concept, setConcept] = useState<OntologyConcept | null>(null);
  const [collections, setCollections] = useState<KnowledgeCollection[]>([]);
  // True once the collections fetch settled (success or failure), so the
  // read-only versioning note doesn't flash before the scheme is known.
  const [collectionsLoaded, setCollectionsLoaded] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  // A failed load (with Retry) is told apart from a concept that isn't there
  const [error, setError] = useState<string | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [editorOpen, setEditorOpen] = useState(false);
  // "Save new version" dialog (versioning contract §4) + a nonce that forces the
  // version-history panel to refetch after a successful publish.
  const [publishOpen, setPublishOpen] = useState(false);
  const [versionRefreshNonce, setVersionRefreshNonce] = useState(0);
  // Real current version from the engine (contract §1). Single integer (v2),
  // NOT semver — replaces the old hardcoded "v1.0.0" badge. Null while loading
  // or if the concept has no version rows yet.
  const [currentVersion, setCurrentVersion] = useState<number | null>(null);
  const [neighbourhoodOpen, setNeighbourhoodOpen] = useState(true);
  const relationsBodyId = useId();
  // Relations and the neighbourhood graph are the same /neighbors data rendered
  // two ways, so they share ONE block with a List (relations) / Graph switch.
  // Defaults to the relations list (per wireframe); graph is opt-in.
  const [relationsView, setRelationsView] = useState<'list' | 'graph'>('list');
  const [deprecateOpen, setDeprecateOpen] = useState(false);
  const [requestDialogOpen, setRequestDialogOpen] = useState(false);
  const [submitReviewOpen, setSubmitReviewOpen] = useState(false);
  const [reviewerEmail, setReviewerEmail] = useState<string | null>(null);
  const [reviewNotes, setReviewNotes] = useState('');
  // Informational preview: does an approval workflow gate this concept's
  // draft->under_review transition? Fetched when the submit-review dialog
  // opens. `null` = not yet loaded; `submitPreviewLoading` distinguishes
  // "in flight" from "loaded but empty" so the banner never flashes a jump.
  const [submitPreview, setSubmitPreview] = useState<{
    governed: boolean;
    workflow_names: string[];
    workflow_count: number;
  } | null>(null);
  const [submitPreviewLoading, setSubmitPreviewLoading] = useState(false);
  // Approval-wizard launch state. When a `for_request_status_change` approval
  // workflow is configured for concepts, the wizard runs BEFORE the submit and
  // its onComplete replays the real submit API. When none is configured we fall
  // through to the plain submit-review dialog (with its S3 governance banner).
  // Mirrors request-product-action-dialog.tsx.
  const [wizardWorkflowId, setWizardWorkflowId] = useState<string | null>(null);
  const [wizardOpen, setWizardOpen] = useState(false);
  const [requestChangesOpen, setRequestChangesOpen] = useState(false);
  const [requestChangesComment, setRequestChangesComment] = useState('');
  const [isCommentSidebarOpen, setIsCommentSidebarOpen] = useState(false);
  // The dialogs the Request dialog hands over to give focus back to Request:
  // their opener (a button in the Request dialog) is gone by then
  const requestButtonRef = useRef<HTMLButtonElement>(null);
  const selectedLanguage = i18n.language?.split('-')[0] || 'en';

  // Fetch the focused concept by IRI. This is intentionally separated from
  // the (lazier) neighbourhood load so the header renders ASAP.
  // Each load's turn: an answer for an IRI the page has moved on from is dropped
  const loadSeq = useRef(0);
  const fetchConcept = useCallback(async () => {
    if (!conceptIri) return;
    const seq = ++loadSeq.current;
    setIsLoading(true);
    setError(null);
    setNotFound(false);
    try {
      // Query-param form (``?iri=``) is required because some HTTP proxies
      // collapse ``%2F%2F`` in path segments, mangling IRIs like
      // ``http://ontos.example.org/...`` before they reach the backend.
      const res = await get<{ concept?: OntologyConcept }>(
        `/api/semantic-models/concepts/by-iri?iri=${encodeURIComponent(conceptIri)}`,
      );
      if (seq !== loadSeq.current) return;
      // A 404 ("Concept not found") or an answer without one: nothing to retry
      if ((res.error && /not found/i.test(res.error)) || (!res.error && !res.data?.concept)) {
        setNotFound(true);
        setConcept(null);
        return;
      }
      if (res.error || !res.data?.concept) {
        setError(res.error || t('semantic-models:details.loadError'));
        setConcept(null);
        return;
      }
      setConcept(res.data.concept);
    } catch (err: any) {
      if (seq !== loadSeq.current) return;
      setError(err?.message || t('semantic-models:details.loadError'));
      setConcept(null);
    } finally {
      if (seq === loadSeq.current) setIsLoading(false);
    }
  }, [conceptIri, get, t]);

  // Collections are needed for source-context lookup (editability check) and
  // for the create/edit concept dialog. The relations panel itself loads
  // its data straight from the neighbours API and does not need a global
  // concept list.
  const fetchSupporting = useCallback(async () => {
    try {
      const res = await get<{ collections?: KnowledgeCollection[] }>(
        '/api/knowledge/collections?hierarchical=true',
      );
      if (res.data?.collections) {
        setCollections(res.data.collections);
      }
    } catch (err) {
      console.error('ConceptDetailView: failed to load collections', err);
    } finally {
      setCollectionsLoaded(true);
    }
  }, [get]);

  useEffect(() => {
    fetchConcept();
  }, [fetchConcept]);

  // React to knowledge-graph refresh broadcasts from OTHER views/dialogs (e.g.
  // the workflow approval-response dialog bumps 'concept-approval-decision'),
  // so a reviewer staying on this page sees the new status. The value seen at
  // mount is ignored (the mount fetch above covers it) and bumps made by this
  // page's own actions are skipped (they refetch themselves). The refetch is
  // quiet: the full-page loader only shows while no concept is loaded yet.
  const lastSeenRefreshNonceRef = useRef(knowledgeGraphRefreshNonce);
  useEffect(() => {
    if (knowledgeGraphRefreshNonce === lastSeenRefreshNonceRef.current) return;
    lastSeenRefreshNonceRef.current = knowledgeGraphRefreshNonce;
    if (selfBumpedNoncesRef.current.delete(knowledgeGraphRefreshNonce)) return;
    fetchConcept();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only the nonce drives this refetch
  }, [knowledgeGraphRefreshNonce]);

  // Fetch the real current version from the engine (contract §1) so the badge
  // shows the actual integer, not a hardcoded string. Refetches after a publish
  // (versionRefreshNonce bumps). Degrades silently: if the endpoint is absent or
  // the concept has no version rows, the badge falls back to hiding itself.
  useEffect(() => {
    if (!conceptIri) return;
    let cancelled = false;
    (async () => {
      const res = await get<{ current_version?: number | null }>(
        `/api/semantic-models/concepts/version?iri=${encodeURIComponent(conceptIri)}`,
      );
      if (cancelled) return;
      const cv = res.data?.current_version;
      setCurrentVersion(typeof cv === 'number' ? cv : null);
    })();
    return () => { cancelled = true; };
  }, [conceptIri, versionRefreshNonce, get]);

  useEffect(() => {
    fetchSupporting();
  }, [fetchSupporting]);

  // When the submit-review dialog opens, ask the backend whether an approval
  // workflow is attached so the dialog can tell the user what will happen.
  // Reset on close so a stale banner never shows on the next open. Guarded by
  // a cancelled flag against races (rapid open/close or IRI change).
  useEffect(() => {
    if (!submitReviewOpen) {
      setSubmitPreview(null);
      setSubmitPreviewLoading(false);
      return;
    }
    if (!conceptIri) return;
    let cancelled = false;
    setSubmitPreviewLoading(true);
    (async () => {
      const res = await get<{
        governed: boolean;
        workflow_names: string[];
        workflow_count: number;
      }>(
        `/api/knowledge/concepts/by-iri/submit-review/preview?iri=${encodeURIComponent(conceptIri)}`,
      );
      if (cancelled) return;
      if (res.data) {
        setSubmitPreview({
          governed: !!res.data.governed,
          workflow_names: res.data.workflow_names ?? [],
          workflow_count: res.data.workflow_count ?? 0,
        });
      } else {
        setSubmitPreview(null);
      }
      setSubmitPreviewLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [submitReviewOpen, conceptIri, get]);

  // Keep breadcrumbs in sync with the concept the URL is pointing at.
  useEffect(() => {
    setStaticSegments([
      { label: t('semantic-models:title', 'Concepts'), path: '/concepts' },
      { label: t('semantic-models:tabs.explore', 'Explore'), path: '/concepts/browser' },
    ]);
    if (concept) {
      setDynamicTitle(resolveLabel(concept, selectedLanguage));
    } else {
      setDynamicTitle(null);
    }
    return () => {
      setStaticSegments([]);
      setDynamicTitle(null);
    };
  }, [concept, setStaticSegments, setDynamicTitle, selectedLanguage, t]);

  // Exact match on the scheme's source key, across nested child schemes too.
  const findScheme = useMemo(() => createSchemeLookup(collections), [collections]);
  const collection = useMemo(
    () => findScheme(concept?.source_context),
    [findScheme, concept],
  );
  // The scheme record's current label, so a rename shows here; falls back to
  // the prettified key when no scheme record matches.
  const schemeLabel = concept?.source_context
    ? collection?.label || systemRdfNamespaceDisplayLabel(concept.source_context, t)
    : undefined;

  // Whether the concept *itself* can be modified (label, definition, status,
  // relations within the concept document). Restricted to draft concepts in
  // an editable collection, since imported ontologies (databricks-ontology,
  // SKOS, etc.) are read-only by design.
  const isEditable = useMemo(() => {
    if (!concept) return false;
    const isDraftStatus = !concept.status || concept.status === 'draft';
    return !!(canWrite && collection?.is_editable && isDraftStatus);
  }, [canWrite, collection, concept]);

  // Publishing a NEW version is NOT restricted to draft: it is precisely what
  // you do to an already-published/certified concept when its definition needs
  // to change (mint v2, keep the IRI, keep history). It only requires write
  // permission on an editable collection. Retired concepts are the exception
  // (a tombstone should not sprout new versions).
  const canPublishVersion = useMemo(() => {
    if (!concept) return false;
    const isRetired = concept.status === 'retired';
    return !!(canWrite && collection?.is_editable && !isRetired);
  }, [canWrite, collection, concept]);

  // "Save new version" stays VISIBLE but DISABLED while the concept is still a
  // draft or under review: v1 must be approved before a v2 can be minted
  // (drafts get v1 by default from the backend). Enabled once the concept is
  // approved/published/certified/deprecated.
  const versionLockedForDraft =
    concept?.status === 'draft' || concept?.status === 'under_review';

  // Versioning is a governed-scheme feature: concepts from a read-only source
  // (imported RDF, system ontologies) keep their history visible but cannot
  // mint versions. Explained in the panel rather than silently hidden.
  const versioningReadOnly = collectionsLoaded && !collection?.is_editable;

  // Linking Ontos entities to a concept and assigning ownership are stored
  // *on our side* (semantic_links / ownership tables), not in the source
  // ontology. So they only require write permission on semantic-models --
  // they should work even for concepts that come from a read-only ontology.
  const canLinkEntities = canWrite;

  // Navigation between concepts (from in-graph clicks, link clicks, etc.)
  // updates the URL in place, which re-mounts the data effects via the new
  // :iri param. We use replace=false so browser-back works as expected.
  const handleNavigateToConcept = useCallback(
    (iri: string) => {
      if (!iri) return;
      navigate(`/concepts/browser/${encodeURIComponent(iri)}`);
    },
    [navigate],
  );

  const handleSaveConcept = async (data: any, isNew: boolean) => {
    if (!concept) return;
    try {
      const url = isNew
        ? '/api/knowledge/concepts'
        : `/api/knowledge/concepts/by-iri?iri=${encodeURIComponent(concept.iri)}`;
      const method = isNew ? 'POST' : 'PATCH';
      const response = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      if (!response.ok) {
        const err = await response.json().catch(() => ({} as any));
        throw new Error(err?.detail || t('semantic-models:messages.saveFailed'));
      }
      toast({
        title: t('common:toast.success'),
        description: t('semantic-models:messages.conceptUpdated'),
      });
      setEditorOpen(false);
      bumpKnowledgeGraphRefresh('concept-update');
      await fetchConcept();
      await fetchSupporting();
    } catch (err: any) {
      toast({
        title: t('common:toast.error'),
        description: err?.message,
        variant: 'destructive',
      });
      throw err;
    }
  };

  const handleDelete = async () => {
    if (!concept) return;
    try {
      const response = await fetch(
        `/api/knowledge/concepts/by-iri?iri=${encodeURIComponent(concept.iri)}`,
        { method: 'DELETE' },
      );
      if (!response.ok) {
        const err = await response.json().catch(() => ({} as any));
        throw new Error(err?.detail || t('semantic-models:messages.deleteConceptFailed'));
      }
      toast({
        title: t('common:toast.success'),
        description: t('semantic-models:messages.conceptDeleted'),
      });
      bumpKnowledgeGraphRefresh('concept-delete');
      navigate('/concepts/browser', { replace: true });
    } catch (err: any) {
      toast({
        title: t('common:toast.error'),
        description: err?.message,
        variant: 'destructive',
      });
    }
  };

  // Run a lifecycle status transition via its by-iri action endpoint, then
  // refresh so the status badge + available transitions update.
  const [statusBusy, setStatusBusy] = useState(false);

  // Walk the status chain one step at a time from current to target.
  // If 'deprecate' is encountered along the way, stop and open the deprecate dialog.
  // If 'submit-review' is target, open the reviewer dialog instead.
  const handleStatusTransition = async (targetStatus: string, action?: string) => {
    if (!concept) return;

    // Special case: reviewer "Request changes" (send-back ping-pong). Opens a
    // small dialog to capture the comment, then posts to request-changes
    // (under_review -> draft). Distinct from the owner's Withdraw.
    if (action === 'request-changes') {
      setRequestChangesComment('');
      setRequestChangesOpen(true);
      return;
    }

    // Special case: if target is 'under_review', check for a configured approval
    // wizard first. A `for_request_status_change` workflow authored for the
    // `ontology_concept` entity runs BEFORE the submit; its completion replays
    // the real submit API. If none is configured we fall through to the plain
    // submit-review dialog (which carries the S3 governance/process banner).
    // The lookup is done inline (not via useApprovalWizardTrigger) so we can
    // scope it to the concept entity via ?entity_type= without changing the
    // shared hook's product behavior — the hook does not forward entity_type.
    if (targetStatus === 'under_review') {
      setReviewerEmail(null);
      setReviewNotes('');
      let workflowId: string | null = null;
      try {
        const res = await get<{ id?: string }>(
          '/api/workflows/for-trigger/for_request_status_change?entity_type=ontology_concept',
        );
        // Mirror the hook's null-on-error contract: 404 (no workflow) and any
        // other error both mean "no wizard, go direct".
        workflowId = res.data?.id ?? null;
      } catch {
        workflowId = null;
      }
      if (workflowId) {
        setWizardWorkflowId(workflowId);
        setWizardOpen(true);
      } else {
        setWizardWorkflowId(null);
        setSubmitReviewOpen(true);
      }
      return;
    }

    // Special case: if target is 'deprecated', open the dialog instead of walking blindly
    if (targetStatus === 'deprecated') {
      setDeprecateOpen(true);
      return;
    }

    setStatusBusy(true);
    try {
      const chain = LIFECYCLE_CHAIN;
      const currentIdx = chain.indexOf(concept.status || 'draft');
      const targetIdx = chain.indexOf(targetStatus);

      if (currentIdx < 0 || targetIdx < 0 || targetIdx <= currentIdx) {
        throw new Error('Invalid target status');
      }

      // Walk from current to target, one step at a time
      let currentStatus: string = concept.status || 'draft';
      for (let i = currentIdx; i < targetIdx; i++) {
        const nextStatus = chain[i + 1];
        const transitions = STATUS_TRANSITIONS[currentStatus] ?? [];
        const transition = transitions.find((tr) => tr.to === nextStatus);

        if (!transition) {
          throw new Error(`No transition available from ${currentStatus} to ${nextStatus}`);
        }

        // If we encounter deprecate along the way, stop and open the dialog
        if (transition.action === 'deprecate' && targetStatus !== 'deprecated') {
          setDeprecateOpen(true);
          setStatusBusy(false);
          return;
        }

        // Execute the transition
        const response = await fetch(
          `/api/knowledge/concepts/by-iri/${transition.action}?iri=${encodeURIComponent(concept.iri)}`,
          { method: 'POST' },
        );
        if (!response.ok) {
          const err = await response.json().catch(() => ({} as any));
          throw new Error(err?.detail || `Failed to transition to ${nextStatus}`);
        }
        currentStatus = nextStatus;
      }

      toast({
        title: t('common:toast.success'),
        description: t('semantic-models:messages.statusChanged', 'Status updated'),
      });
      bumpKnowledgeGraphRefresh('concept-status');
      await fetchConcept();
    } catch (err: any) {
      toast({
        title: t('common:toast.error'),
        description: err?.message,
        variant: 'destructive',
      });
      // Re-sync to the TRUE backend status even on failure
      await fetchConcept();
    } finally {
      setStatusBusy(false);
    }
  };

  // Reusable submit-review POST. Extracted so BOTH the plain submit-review
  // dialog and the approval-wizard onComplete can replay the exact same real
  // submit API without duplicating the fetch. `body` carries the optional
  // reviewer/notes fields; callers own their own busy-state + dialog closing.
  const submitReviewRequest = useCallback(
    async (body: Record<string, unknown>): Promise<void> => {
      if (!concept) return;
      const response = await fetch(
        `/api/knowledge/concepts/by-iri/submit-review?iri=${encodeURIComponent(concept.iri)}`,
        { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) },
      );
      if (!response.ok) {
        const err = await response.json().catch(() => ({} as any));
        throw new Error(err?.detail || 'Failed to submit for review');
      }
      const result = await response.json();
      const governed = result?.governed;
      toast({
        title: t('common:toast.success'),
        description: governed
          ? t('semantic-models:messages.submitReviewGoverned', 'Submitted for review — awaiting approval.')
          : t('semantic-models:messages.submitReview', 'Submitted for review'),
      });
      bumpKnowledgeGraphRefresh('concept-status');
      await fetchConcept();
    },
    [concept, toast, t, bumpKnowledgeGraphRefresh, fetchConcept],
  );

  const handleSubmitReview = async () => {
    if (!concept) return;
    setStatusBusy(true);
    try {
      const body: Record<string, unknown> = {};
      if (reviewerEmail) body.reviewer_email = reviewerEmail;
      if (reviewNotes.trim()) body.notes = reviewNotes;
      await submitReviewRequest(body);
      setSubmitReviewOpen(false);
    } catch (err: any) {
      toast({
        title: t('common:toast.error'),
        description: err?.message,
        variant: 'destructive',
      });
    } finally {
      setStatusBusy(false);
    }
  };

  // Wizard onComplete: the approval workflow ran to completion, so replay the
  // real concept submit. Wizard-collected fields are threaded into the submit
  // body under `wizard_data` (parallels request-product-action-dialog.tsx) so
  // downstream process workflows can reference them; reviewer/notes remain
  // optional (the wizard, not the plain dialog, owned this path's input).
  const handleWizardComplete = async (
    _agreementId: string | null,
    _pdfStoragePath: string | null,
    wizardFields?: Record<string, unknown>,
  ) => {
    if (!concept) return;
    setStatusBusy(true);
    try {
      const body: Record<string, unknown> = {};
      if (wizardFields && Object.keys(wizardFields).length > 0) {
        body.wizard_data = wizardFields;
      }
      await submitReviewRequest(body);
      setWizardOpen(false);
      setWizardWorkflowId(null);
    } catch (err: any) {
      toast({
        title: t('common:toast.error'),
        description: err?.message,
        variant: 'destructive',
      });
    } finally {
      setStatusBusy(false);
    }
  };

  const handleRequestChanges = async () => {
    if (!concept) return;
    setStatusBusy(true);
    try {
      const body: any = {};
      if (requestChangesComment.trim()) body.comments = requestChangesComment.trim();
      const response = await fetch(
        `/api/knowledge/concepts/by-iri/request-changes?iri=${encodeURIComponent(concept.iri)}`,
        { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) },
      );
      if (!response.ok) {
        const err = await response.json().catch(() => ({} as any));
        throw new Error(err?.detail || 'Failed to request changes');
      }
      toast({
        title: t('common:toast.success'),
        description: t('semantic-models:messages.changesRequested', 'Sent back to the owner with your comment.'),
      });
      setRequestChangesOpen(false);
      bumpKnowledgeGraphRefresh('concept-status');
      await fetchConcept();
    } catch (err: any) {
      toast({ title: t('common:toast.error'), description: err?.message, variant: 'destructive' });
    } finally {
      setStatusBusy(false);
    }
  };

  const handleWithdrawReview = async () => {
    if (!concept) return;
    setStatusBusy(true);
    try {
      const response = await fetch(
        `/api/knowledge/concepts/by-iri/withdraw-review?iri=${encodeURIComponent(concept.iri)}`,
        { method: 'POST' },
      );
      if (!response.ok) {
        const err = await response.json().catch(() => ({} as any));
        throw new Error(err?.detail || 'Failed to withdraw review');
      }
      toast({
        title: t('common:toast.success'),
        description: t('semantic-models:messages.withdrawReview', 'Review withdrawn'),
      });
      bumpKnowledgeGraphRefresh('concept-status');
      await fetchConcept();
    } catch (err: any) {
      toast({
        title: t('common:toast.error'),
        description: err?.message,
        variant: 'destructive',
      });
    } finally {
      setStatusBusy(false);
    }
  };

  const backButton = (
    <Button variant="outline" size="sm" onClick={() => navigate('/concepts/browser')}>
      <ArrowLeft aria-hidden />
      {t('semantic-models:details.backToList', 'Back to Concepts')}
    </Button>
  );

  // Mirrors the rendered concept detail: the header line, then the panes
  if (isLoading && !concept) {
    return (
      <div className={classes.skeleton} aria-busy="true">
        <div className={classes.skeletonHead}>
          <Button variant="outline" size="sm" onClick={() => navigate(-1)}>
            <ArrowLeft aria-hidden />
            {t('semantic-models:details.backToList', 'Back to Concepts')}
          </Button>
          <Skeleton height={28} width={200} />
        </div>
        <Skeleton height={20} width="60%" />
        <Skeleton height={120} />
        <Skeleton height={96} />
        <Skeleton height={96} />
      </div>
    );
  }

  if (error || notFound || !concept) {
    return (
      <div className={classes.state}>
        <div className={classes.stateBack}>{backButton}</div>
        {error ? (
          <Alert color="red" variant="light" icon={<AlertCircle size={16} />} title={t('common:toast.error')}>
            <span className={classes.alertMessage}>{error}</span>
            <div className={classes.alertActions}>
              <Button variant="outline" size="sm" onClick={() => void fetchConcept()}>
                {t('common:retry')}
              </Button>
            </div>
          </Alert>
        ) : (
          <Alert color="gray" variant="light" icon={<AlertCircle size={16} />}>
            {t('semantic-models:details.notFound', 'Concept not found')}
          </Alert>
        )}
      </div>
    );
  }

  const conceptTitle = resolveLabel(concept, selectedLanguage);
  const conceptDefinition = resolveComment(concept, selectedLanguage);
  const isProperty = concept.concept_type === 'property';
  const hasDomainRange = isProperty && (concept.domain || concept.range);

  // All forward-reachable statuses from the current status. Offered to writers
  // on concepts whose collection is editable (imported/read-only ontologies have
  // no lifecycle). Certify is admin-gated server-side; a non-admin gets a clear
  // 403 toast rather than the option being hidden.
  const currentStatus = concept.status || 'draft';
  // Only offer the DIRECT next-step transitions (single hop). Multi-hop
  // shortcuts were removed: they let users skip the review decision (and now
  // hit the approval-bypass gate anyway). Full lifecycle visibility is provided
  // by the StatusProgressBar below instead.
  const nextStepStatuses =
    canWrite && collection?.is_editable
      ? reachableStatuses(currentStatus).filter((s) => s.isNextStep)
      : [];
  const requestTransitions: ConceptTransitionItem[] = nextStepStatuses;
  const requestNewVersion: ConceptNewVersionOption | null = canPublishVersion
    ? {
        disabled: versionLockedForDraft,
        disabledReason: t(
          'semantic-models:versionHistory.saveNewVersionDraftLocked',
          'Available after this concept is approved (v1 must be approved before a new version).',
        ),
        onSelect: () => setPublishOpen(true),
      }
    : null;
  const hasRequestActions = requestTransitions.length > 0 || requestNewVersion != null;

  // A concept named by its IRI's last segment, the full IRI in its title
  const conceptChip = (iri: string) => (
    <UnstyledButton key={iri} className={classes.chip} title={iri} onClick={() => handleNavigateToConcept(iri)}>
      {iri.split(/[/#]/).pop() || iri}
    </UnstyledButton>
  );

  // Details: scheme/source/imported/created; the type and raw IRI are Advanced only
  const detailRows: DetailsRow[] = [
    ...(collection?.label
      ? [{ label: t('semantic-models:fields.scheme', 'Concept scheme'), value: <span className={panel.grow} title={collection.label}>{collection.label}</span> }]
      : []),
    // Without a scheme record the "Concept scheme" row above is absent, so
    // this row carries the (prettified) source key instead.
    ...(concept.source_context && !collection?.label
      ? [{ label: t('semantic-models:fields.source', 'Source'), value: <span className={panel.grow} title={schemeLabel}>{schemeLabel}</span> }]
      : []),
    ...(concept.source_file
      ? [{ label: t('semantic-models:fields.sourceFile', 'Imported from'), value: <span className={panel.grow} title={concept.source_file}>{concept.source_file}</span> }]
      : []),
    ...(concept.created_at
      ? [{ label: t('semantic-models:fields.created', 'Created'), value: new Date(concept.created_at).toLocaleDateString() }]
      : []),
  ];
  const advancedRows: DetailsRow[] = [
    { label: t('semantic-models:fields.type', 'Type'), value: <span className={classes.code}>{concept.concept_type}</span> },
    { label: 'IRI', value: <span className={classes.code} title={concept.iri}>{concept.iri}</span> },
  ];

  const parents = concept.parent_concepts ?? [];
  const children = concept.child_concepts ?? [];

  return (
    <PageLayout
      header={
        <PageHeader
          title={conceptTitle}
          badges={
            !isProperty && concept.status ? (
              <Badge variant="outline" style={badgeToneStyle(statusTone(concept.status))}>
                {t(`semantic-models:status.${concept.status}`, concept.status as string)}
              </Badge>
            ) : undefined
          }
          wrapActions
          actions={
            <>
              {backButton}
              {/* Single "Request" entry point (mirrors data products): opens the
                  action-picker dialog offering the direct next lifecycle step(s)
                  (Request review on a draft, wizard / dialog flow unchanged; then
                  approve / request changes / publish / certify / deprecate /
                  archive for users who may run them today) plus "New version".
                  "Save new version" is available for any non-retired editable
                  concept, NOT just drafts, and stays disabled while the concept is
                  draft / under review. Properties have no lifecycle actions or
                  version publishing. */}
              {!isProperty && hasRequestActions && (
                <Button
                  ref={requestButtonRef}
                  variant="outline"
                  size="sm"
                  disabled={statusBusy}
                  onClick={() => setRequestDialogOpen(true)}
                >
                  <Send aria-hidden />
                  {t('semantic-models:lifecycle.request', 'Request')}
                </Button>
              )}
              {currentStatus === 'under_review' && canWrite && (
                <Button variant="outline" size="sm" disabled={statusBusy} onClick={handleWithdrawReview}>
                  {t('semantic-models:lifecycle.withdrawReview', 'Withdraw Review')}
                </Button>
              )}
              {/* Edit/Delete stay draft-only (isEditable). */}
              {isEditable && (
                <>
                  <Button variant="outline" size="sm" onClick={() => setEditorOpen(true)}>
                    <Pencil aria-hidden />
                    {t('common:actions.edit')}
                  </Button>
                  <Button variant="outline" size="sm" className={common.danger} onClick={handleDelete}>
                    <Trash2 aria-hidden />
                    {t('common:actions.delete')}
                  </Button>
                </>
              )}
              <CommentSidebar
                entityType="ontology_concept"
                entityId={concept.iri}
                isOpen={isCommentSidebarOpen}
                onToggle={() => setIsCommentSidebarOpen(!isCommentSidebarOpen)}
              />
            </>
          }
        />
      }
    >
      {/* One column of panes (mirrors the Data Contracts detail page), in this
          order: Summary, Definition, Owners, Details, Hierarchy, Linked
          entities, Version history, Relations / neighbourhood graph, Turtle
          (Advanced only), Metadata (always last in Simple + Advanced). */}
      <div className={classes.body} data-testid="concept-panels">
        <PaneStack>
          <Pane title={t('semantic-models:summary.title', 'Summary')}>
            <ConceptSummaryPanel concept={concept} currentVersion={currentVersion} schemeLabel={schemeLabel} />
          </Pane>

          {/* Definition + property domain/range in one compact pane, so short
              definitions don't get an entire page section to themselves. */}
          {(conceptDefinition || hasDomainRange) && (
            <Pane title={t('semantic-models:fields.definition', 'Definition')}>
              <div data-panel="definition">
                {conceptDefinition && <p className={classes.definition}>{conceptDefinition}</p>}
                {hasDomainRange && (
                  <div className={classes.domainRange}>
                    {concept.domain && (
                      <span className={classes.pair}>
                        <span className={classes.pairLabel}>{t('semantic-models:fields.domain')}:</span>
                        {conceptChip(concept.domain)}
                      </span>
                    )}
                    {concept.range && (
                      <span className={classes.pair}>
                        <span className={classes.pairLabel}>{t('semantic-models:fields.range')}:</span>
                        {conceptChip(concept.range)}
                      </span>
                    )}
                  </div>
                )}
              </div>
            </Pane>
          )}

          <Pane aria-label={t('business-owners:panel.title', 'Owners')}>
            <div data-panel="ownership">
              <OwnershipPanel flush objectType="business_term" objectId={concept.iri} canAssign={canLinkEntities} />
            </div>
          </Pane>

          <Pane title={t('semantic-models:details.title', 'Details')}>
            <div data-panel="details">
              {detailRows.length > 0 && <DetailsGrid rows={detailRows} />}
              {/* Advanced only: the ontology layer (type + raw IRI). */}
              <div className="adv-only">
                <DetailsGrid rows={advancedRows} />
              </div>
            </div>
          </Pane>

          {/* Hierarchy: broader (parents) / narrower (children) concepts.
              Relations live in the shared "Relations / Graph" block below
              (they were the same /neighbors data rendered twice). */}
          <Pane title={t('semantic-models:hierarchy.title', 'Hierarchy')}>
            <div data-panel="hierarchy">
              {parents.length === 0 && children.length === 0 ? (
                <p className={classes.muted}>
                  {t('semantic-models:hierarchy.none', 'No broader or narrower concepts.')}
                </p>
              ) : (
                <div className={classes.hierarchy}>
                  {parents.length > 0 && (
                    <div className={classes.hierarchyRow}>
                      <span className={classes.hierarchyLabel}>{t('semantic-models:hierarchy.parent', 'Parent')}</span>
                      <div className={classes.chips}>{parents.map(conceptChip)}</div>
                    </div>
                  )}
                  {children.length > 0 && (
                    <div className={classes.hierarchyRow}>
                      <span className={classes.hierarchyLabel}>{t('semantic-models:hierarchy.children', 'Children')}</span>
                      <div className={classes.chips}>{children.map(conceptChip)}</div>
                    </div>
                  )}
                </div>
              )}
            </div>
          </Pane>

          <Pane aria-label={t('semantic-models:linkedObjects.title', 'Linked Entities')}>
            <div data-panel="linked-assets">
              <LinkedObjectsPanel
                conceptIri={concept.iri}
                conceptLabel={conceptTitle}
                canAssign={canLinkEntities}
                onChanged={fetchConcept}
                maxVisibleRows={MAX_VISIBLE_ROWS}
              />
            </div>
          </Pane>

          {/* Version history: live, drives versioning contract §1 + §2. Shown
              for every concept type. On a read-only (imported / non-editable)
              scheme it stays visible but read-only, with a note instead of
              silently hiding the version controls. */}
          <Pane aria-label={t('semantic-models:versionHistory.title', 'Version history')}>
            <div id="concept-version-history" data-panel="version-history">
              <VersionHistoryPanel
                conceptIri={concept.iri}
                refreshNonce={versionRefreshNonce}
                readOnlyNote={
                  versioningReadOnly
                    ? t(
                        'semantic-models:versionHistory.readOnlyNote',
                        'Versioning applies to governed (editable) concept schemes. This concept comes from a read-only source, so new versions cannot be saved here.',
                      )
                    : undefined
                }
              />
            </div>
          </Pane>

          {/* Relations + neighbourhood graph: ONE block, two views over the
              same /neighbors data. List = relations; Graph = node-link. */}
          <Pane aria-label={t('semantic-models:relations.title', { defaultValue: 'Relations' })}>
            <div className={panel.pane} data-flush data-panel="relations">
              <div className={panel.head}>
                <h3 className={panel.title}>
                  <UnstyledButton
                    className={classes.fold}
                    aria-expanded={neighbourhoodOpen}
                    aria-controls={relationsBodyId}
                    onClick={() => setNeighbourhoodOpen((open) => !open)}
                  >
                    {neighbourhoodOpen ? <ChevronDown aria-hidden /> : <ChevronRight aria-hidden />}
                    <Network aria-hidden />
                    {t('semantic-models:relations.title', { defaultValue: 'Relations' })}
                  </UnstyledButton>
                </h3>
                {neighbourhoodOpen && (
                  <div className={panel.actions}>
                    <div
                      role="tablist"
                      aria-label={t('semantic-models:relations.viewLabel', 'Relations view')}
                      className={classes.switch}
                    >
                      {(['list', 'graph'] as const).map((view) => (
                        <UnstyledButton
                          key={view}
                          role="tab"
                          aria-selected={relationsView === view}
                          className={classes.switchTab}
                          onClick={() => setRelationsView(view)}
                        >
                          {view === 'list'
                            ? t('semantic-models:neighborhood.list', 'List')
                            : t('semantic-models:neighborhood.graph', 'Graph')}
                        </UnstyledButton>
                      ))}
                    </div>
                  </div>
                )}
              </div>
              <Collapse in={neighbourhoodOpen} id={relationsBodyId} transitionDuration={0}>
                {relationsView === 'list' ? (
                  <ConceptRelationsPanel
                    conceptIri={concept.iri}
                    onNavigate={handleNavigateToConcept}
                    maxVisibleRows={MAX_VISIBLE_ROWS}
                    embedded
                  />
                ) : (
                  <ConceptNeighborhoodGraph concept={concept} onNavigate={handleNavigateToConcept} view="graph" />
                )}
              </Collapse>
            </div>
          </Pane>

          {/* Advanced only: RDF (Turtle) serialization — sits directly above
              Metadata so toggling Advanced only inserts it there and never
              reshuffles Version history / Relations above it. */}
          <Pane aria-label={t('semantic-models:advanced.turtle', 'RDF (Turtle)')} className="adv-only">
            <div data-panel="turtle">
              <TurtleSerializationPanel conceptIri={concept.iri} />
            </div>
          </Pane>

          {/* Metadata (notes / links / documents) — ALWAYS the last pane (in
              both Simple and Advanced view). */}
          <Pane aria-label={t('metadata:title', 'Metadata')}>
            <div data-panel="metadata">
              <EntityMetadataPanel flush entityType="concept" entityId={concept.iri} canEdit={canWrite && canWriteDomains} />
            </div>
          </Pane>
        </PaneStack>

        {concept.created_at && (
          <p className={classes.footer}>
            {t('semantic-models:details.created')}: {new Date(concept.created_at).toLocaleDateString()}
          </p>
        )}

        {isLoading && (
          <div className={classes.refreshing} role="status">
            <Loader size={12} color="currentColor" /> {t('semantic-models:details.refreshing')}
          </div>
        )}
      </div>

      <ConceptEditorDialog
        open={editorOpen}
        onOpenChange={setEditorOpen}
        concept={concept}
        collection={collection ?? undefined}
        collections={collections.filter((c) => c.is_editable)}
        onSave={handleSaveConcept}
      />

      <PublishVersionDialog
        open={publishOpen}
        onOpenChange={setPublishOpen}
        iri={concept.iri}
        currentDefinition={conceptDefinition || ''}
        returnFocusTo={requestButtonRef}
        onPublished={async () => {
          bumpKnowledgeGraphRefresh('concept-version');
          setVersionRefreshNonce((n) => n + 1);
          await fetchConcept();
        }}
      />

      <DeprecateConceptDialog
        isOpen={deprecateOpen}
        onOpenChange={setDeprecateOpen}
        conceptIri={concept.iri}
        returnFocusTo={requestButtonRef}
        onSuccess={async () => {
          toast({
            title: t('common:toast.success'),
            description: t('semantic-models:messages.statusChanged', 'Status updated'),
          });
          bumpKnowledgeGraphRefresh('concept-status');
          await fetchConcept();
        }}
      />

      {!isProperty && (
        <RequestConceptActionDialog
          open={requestDialogOpen}
          onOpenChange={setRequestDialogOpen}
          conceptLabel={conceptTitle}
          currentStatus={currentStatus}
          transitions={requestTransitions}
          newVersion={requestNewVersion}
          onTransition={(status, action) => {
            void handleStatusTransition(status, action);
          }}
          busy={statusBusy}
        />
      )}

      {/* Approval wizard — opens instead of the plain submit-review dialog when
          a `for_request_status_change` approval workflow is configured for the
          `ontology_concept` entity. On completion it replays the concept
          submit-review API (see handleWizardComplete). */}
      {wizardWorkflowId && (
        <ApprovalWizardDialog
          isOpen={wizardOpen}
          onOpenChange={(open) => {
            setWizardOpen(open);
            // Dismissed mid-flow: drop the resolved id so a fresh lookup runs on
            // the next submit attempt (config may have changed since).
            if (!open) setWizardWorkflowId(null);
          }}
          entityType="ontology_concept"
          entityId={concept.iri}
          entityName={conceptTitle}
          preselectedWorkflowId={wizardWorkflowId}
          autoStartWithPreselected
          onComplete={handleWizardComplete}
          onNoWorkflow={() => {
            // Workflow vanished between lookup and open — fall back to the
            // plain submit-review dialog so the user isn't blocked.
            setWizardWorkflowId(null);
            setSubmitReviewOpen(true);
          }}
        />
      )}

      <Dialog
        opened={submitReviewOpen}
        onClose={() => setSubmitReviewOpen(false)}
        size="sm"
        title={t('semantic-models:submitReview.title', 'Submit for Review')}
        description={t('semantic-models:submitReview.description', 'Assign an optional reviewer and add notes.')}
        returnFocusTo={requestButtonRef}
        footer={
          <>
            <Button type="button" variant="outline" onClick={() => setSubmitReviewOpen(false)} disabled={statusBusy}>
              {t('common:actions.cancel', 'Cancel')}
            </Button>
            <Button type="button" onClick={handleSubmitReview} disabled={statusBusy}>
              {statusBusy && <Loader size={12} color="currentColor" />}
              {t('semantic-models:submitReview.submit', 'Submit')}
            </Button>
          </>
        }
      >
        <div className={form.form}>
          {/* Informational banner: does an approval workflow gate this
              submission? Purely advisory — the fields/button are unchanged. */}
          {submitPreview === null ? (
            submitPreviewLoading ? (
              <p className={form.muted}>
                {t('semantic-models:submitReview.checking', 'Checking for approval workflow…')}
              </p>
            ) : null
          ) : submitPreview.governed ? (
            <Alert color="blue" variant="light" icon={<AlertCircle size={16} />}>
              {submitPreview.workflow_count > 1
                ? t(
                    'semantic-models:submitReview.governedBannerMulti',
                    'This concept is governed by {{count}} approval workflows. Submitting will start that approval — it moves to Under Review and awaits approver sign-off.',
                    { count: submitPreview.workflow_count },
                  )
                : t(
                    'semantic-models:submitReview.governedBanner',
                    "This concept is governed by the '{{workflow}}' approval workflow. Submitting will start that approval — it moves to Under Review and awaits approver sign-off.",
                    { workflow: submitPreview.workflow_names[0] ?? '' },
                  )}
            </Alert>
          ) : (
            <p className={form.muted}>
              {t(
                'semantic-models:submitReview.ungovernedBanner',
                'No approval workflow is attached. Submitting moves this concept straight to Under Review; any user with write access can then approve it.',
              )}
            </p>
          )}
          <div>
            <label htmlFor="reviewer-email" className={form.label}>
              {t('semantic-models:submitReview.reviewer', 'Reviewer (optional)')}
            </label>
            <PrincipalPicker
              id="reviewer-email"
              accepts={['user', 'group']}
              value={reviewerEmail}
              onChange={(next) => setReviewerEmail(next ?? null)}
              placeholder={t('semantic-models:submitReview.reviewerPlaceholder', 'Select a reviewer...')}
            />
          </div>
          <Textarea
            id="review-notes"
            label={t('semantic-models:submitReview.notes', 'Notes (optional)')}
            value={reviewNotes}
            onChange={(e) => setReviewNotes(e.currentTarget.value)}
            placeholder={t('semantic-models:submitReview.notesPlaceholder', 'Add context or instructions...')}
            minRows={4}
            autosize
          />
        </div>
      </Dialog>

      {/* Reviewer "Request changes" — send the concept back to the owner with a
          comment (the ping-pong send-back), works with or without a workflow. */}
      <Dialog
        opened={requestChangesOpen}
        onClose={() => setRequestChangesOpen(false)}
        size="sm"
        title={t('semantic-models:requestChanges.title', 'Request changes')}
        description={t('semantic-models:requestChanges.description', 'Send this concept back to the owner as a draft, with your comment.')}
        returnFocusTo={requestButtonRef}
        footer={
          <>
            <Button type="button" variant="outline" onClick={() => setRequestChangesOpen(false)} disabled={statusBusy}>
              {t('common:actions.cancel', 'Cancel')}
            </Button>
            <Button type="button" onClick={handleRequestChanges} disabled={statusBusy}>
              {statusBusy && <Loader size={12} color="currentColor" />}
              {t('semantic-models:requestChanges.submit', 'Send back')}
            </Button>
          </>
        }
      >
        <Textarea
          id="request-changes-comment"
          label={t('semantic-models:requestChanges.comment', 'Comment for the owner')}
          value={requestChangesComment}
          onChange={(e) => setRequestChangesComment(e.currentTarget.value)}
          placeholder={t('semantic-models:requestChanges.placeholder', 'What should change before this can be approved?')}
          minRows={3}
          autosize
        />
      </Dialog>
    </PageLayout>
  );
}
