import { useState, useEffect, useMemo, useRef } from 'react';
import { Link, useParams, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { reviewStatusLabel } from '@/lib/status-labels';
import { Column, ColumnDef } from "@tanstack/react-table";
import { AlertCircle, ArrowLeft, X, ArrowUpDown, Pencil, Check, Copy } from 'lucide-react';
import { ActionIcon, Alert, Loader, Modal, Select, TextInput, UnstyledButton } from '@mantine/core';
import { useApi } from '@/hooks/use-api';
import { useToast } from "@/hooks/use-toast";
import useBreadcrumbStore from '@/stores/breadcrumb-store';
import {
    DataAssetReviewRequest, ReviewedAsset, ReviewRequestStatus,
    ReviewedAssetStatus,
    DataAssetReviewRequestUpdate,
    DataAssetReviewRequestUpdateStatus
} from '@/types/data-asset-review';
import { appEntityAssetLink } from '@/lib/app-entity-asset';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { DataTable } from "@/components/ui/data-table";
import {
  CardSkeleton,
  DetailHeaderSkeleton,
  TableSkeleton,
} from '@/components/common/list-view-skeleton';
import { Toaster } from "@/components/ui/toaster";
import { RelativeDate } from '@/components/common/relative-date';
import { DetailsGrid, PageHeader, PageLayout, Pane, PaneStack, type DetailsRow } from '@/mantine/page';
import { Z_INDEX } from '@/mantine/z-index';
import { useLayeredEscape } from '@/mantine/use-layered-escape';
import { focusIsFree } from '@/mantine/focus-free';
import classes from './data-asset-review-details.module.css';

// Import Asset Review Editor Component
import AssetReviewEditor from '@/components/data-asset-reviews/asset-review-editor';

// Concept diff panel for knowledge-concept reviews
interface ConceptDiffPanelProps {
  request: DataAssetReviewRequest;
  asset: ReviewedAsset;
}

function ConceptDiffPanel({ request, asset }: ConceptDiffPanelProps) {
  const iri = asset.asset_fqn?.replace('knowledge-concept://', '') || '';
  const diffData = (request as any)?.details?.diff || (request as any)?.notes;

  return (
    <div className={classes.diff}>
      <div className={classes.diffIri}>{iri}</div>
      {diffData && typeof diffData === 'object' && (
        <div>
          {diffData.definition && (
            <div className={classes.diffRow}>
              <span className={classes.diffLabel}>Definition:</span>
              <div className={classes.diffDefinition}>{diffData.definition}</div>
            </div>
          )}
          {diffData.prefLabel && (
            <div className={classes.diffRow}>
              <span className={classes.diffLabel}>Label:</span> {diffData.prefLabel}
            </div>
          )}
          {diffData.reference_count != null && (
            <div className={classes.diffRow}>
              <span className={classes.diffLabel}>Used by:</span> {diffData.reference_count} places
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/** A header label that sorts its column, in the grid's header-label look. */
function SortButton({ column, label }: { column: Column<ReviewedAsset, unknown>; label: string }) {
    return (
        <UnstyledButton className={classes.sort} onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}>
            {label}
            <ArrowUpDown aria-hidden className={classes.sortIcon} data-active={column.getIsSorted() ? '' : undefined} />
        </UnstyledButton>
    );
}

// Helper function to check API response (reuse if available globally)
const checkApiResponse = <T,>(response: { data?: T | { detail?: string }, error?: string | null | undefined }, name: string): T => {
    // ... (implementation as in data-asset-reviews.tsx)
    if (response.error) throw new Error(`${name} fetch failed: ${response.error}`);
    if (response.data && typeof response.data === 'object' && 'detail' in response.data && typeof response.data.detail === 'string') {
        throw new Error(`${name} fetch failed: ${response.data.detail}`);
    }
    if (response.data === null || response.data === undefined) {
        throw new Error(`${name} fetch returned null or undefined data.`);
    }
    return response.data as T;
};

export default function DataAssetReviewDetails() {
    const { t } = useTranslation(['data-asset-reviews', 'common']);
    const { requestId } = useParams<{ requestId: string }>();
    const navigate = useNavigate();
    const api = useApi();
    const { get, put, patch } = api;
    const { toast } = useToast();
    const setDynamicTitle = useBreadcrumbStore((state) => state.setDynamicTitle);
    const setStaticSegments = useBreadcrumbStore((state) => state.setStaticSegments);

    const [request, setRequest] = useState<DataAssetReviewRequest | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [isUpdatingStatus, setIsUpdatingStatus] = useState(false);
    const [selectedAsset, setSelectedAsset] = useState<ReviewedAsset | null>(null);
    const [selectedAssetIndex, setSelectedAssetIndex] = useState<number>(0);
    const [isEditorOpen, setIsEditorOpen] = useState(false);
    const [isEditingTitle, setIsEditingTitle] = useState(false);
    const [titleDraft, setTitleDraft] = useState('');
    const [isSavingTitle, setIsSavingTitle] = useState(false);
    // The asset the editor is on (its id), for focus once it closes: set on
    // opening and on "Save & Next"
    const editorAsset = useRef<string | null>(null);
    // The editor's content, so focus left in it after it closes counts as free
    const editorContent = useRef<HTMLDivElement | null>(null);

    // Navigation helpers for asset review
    const requestAssets = request?.assets;
    const pendingAssets = useMemo(() =>
        (Array.isArray(requestAssets) ? requestAssets : []).filter(a => a.status === ReviewedAssetStatus.PENDING),
        [requestAssets]
    );
    
    const currentAssetIndexInPending = useMemo(() => {
        if (!selectedAsset) return -1;
        return pendingAssets.findIndex(a => a.id === selectedAsset.id);
    }, [pendingAssets, selectedAsset]);
    
    const hasNextAsset = currentAssetIndexInPending >= 0 && currentAssetIndexInPending < pendingAssets.length - 1;
    
    const goToNextAsset = () => {
        if (hasNextAsset) {
            const nextAsset = pendingAssets[currentAssetIndexInPending + 1];
            setSelectedAsset(nextAsset);
            editorAsset.current = nextAsset.id ?? null;
            setSelectedAssetIndex(currentAssetIndexInPending + 2); // 1-based
        }
    };

    // Fetch request details
    const fetchRequestDetails = async () => {
        if (!requestId) {
            setError(t('data-asset-reviews:details.requestIdMissing'));
            setLoading(false);
            setStaticSegments([{ label: t('data-asset-reviews:title'), path: '/data-asset-reviews'}]);
            setDynamicTitle(null);
            return;
        }
        setLoading(true);
        setError(null);
        setStaticSegments([{ label: t('data-asset-reviews:title'), path: '/data-asset-reviews'}]);
        setDynamicTitle(t('data-asset-reviews:details.loadingReview'));
        try {
            const response = await get<DataAssetReviewRequest>(`/api/data-asset-reviews/${requestId}`);
            const requestData = checkApiResponse(response, 'Review Request Details');
            setRequest(requestData);
            setDynamicTitle(requestData.title || t('data-asset-reviews:details.reviewTitleShort', { id: requestData.id.substring(0, 8) }));
        } catch (err) {
            const errorMessage = err instanceof Error ? err.message : t('data-asset-reviews:details.fetchFailed');
            setError(errorMessage);
            setRequest(null);
            setStaticSegments([{ label: t('data-asset-reviews:title'), path: '/data-asset-reviews'}]);
            setDynamicTitle(t('common:states.error'));
            toast({ title: t('common:toast.error'), description: t('data-asset-reviews:details.loadRequestError', { error: errorMessage }), variant: 'destructive' });
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchRequestDetails();
        // Cleanup function
        return () => {
            setStaticSegments([]);
            setDynamicTitle(null);
        };
    }, [requestId, get, toast, setDynamicTitle, setStaticSegments]);

    const beginEditTitle = () => {
        if (!request) return;
        setTitleDraft(request.title ?? '');
        setIsEditingTitle(true);
    };

    const cancelEditTitle = () => {
        setIsEditingTitle(false);
        setTitleDraft('');
    };

    const handleSaveTitle = async () => {
        if (!requestId || !request) return;
        const trimmed = titleDraft.trim();
        // No-op if unchanged (treat empty draft as "clear / regenerate").
        if (trimmed === (request.title ?? '').trim()) {
            cancelEditTitle();
            return;
        }
        setIsSavingTitle(true);
        const payload: DataAssetReviewRequestUpdate = { title: trimmed || null };
        try {
            const response = await patch<DataAssetReviewRequest>(`/api/data-asset-reviews/${requestId}`, payload);
            const updated = checkApiResponse(response, 'Update Review Title');
            setRequest(updated);
            setDynamicTitle(updated.title || `Review ${updated.id.substring(0, 8)}`);
            toast({ title: t('common:toast.success'), description: t('data-asset-reviews:toast.titleUpdated') });
            setIsEditingTitle(false);
        } catch (err) {
            const errorMessage = err instanceof Error ? err.message : t('data-asset-reviews:details.updateTitleFailed');
            toast({ title: t('common:toast.error'), description: errorMessage, variant: 'destructive' });
        } finally {
            setIsSavingTitle(false);
        }
    };

    const handleCopyId = async () => {
        if (!request) return;
        try {
            await navigator.clipboard.writeText(request.id);
            toast({ title: t('data-asset-reviews:toast.idCopied') });
        } catch {
            // Silently fail if clipboard is unavailable
        }
    };

    const handleOverallStatusChange = async (newStatus: ReviewRequestStatus) => {
        if (!requestId || !request || newStatus === request.status) return;
        setIsUpdatingStatus(true);
        const updatePayload: DataAssetReviewRequestUpdateStatus = { status: newStatus };
        // Potentially add a dialog here to capture notes for NEEDS_REVIEW or DENIED

        try {
            const response = await put<DataAssetReviewRequest>(`/api/data-asset-reviews/${requestId}/status`, updatePayload);
            const updatedRequest = checkApiResponse(response, 'Update Request Status');
            setRequest(updatedRequest); // Update local state
            toast({ title: t('common:toast.success'), description: t('data-asset-reviews:details.statusUpdated', { status: newStatus }) });
        } catch (err) {
            const errorMessage = err instanceof Error ? err.message : t('data-asset-reviews:details.updateStatusFailed');
            toast({ title: t('common:toast.error'), description: t('data-asset-reviews:details.updateStatusError', { error: errorMessage }), variant: 'destructive' });
        } finally {
            setIsUpdatingStatus(false);
        }
    };

    // --- Status Color Helpers (copied/adapted) --- //
    const getRequestStatusColor = (status: ReviewRequestStatus): "default" | "secondary" | "destructive" | "outline" => {
         switch (status) {
            case ReviewRequestStatus.APPROVED: return 'default';
            case ReviewRequestStatus.IN_REVIEW: return 'secondary';
            case ReviewRequestStatus.NEEDS_REVIEW: return 'outline'; // Map to outline
            case ReviewRequestStatus.DENIED: return 'destructive';
            case ReviewRequestStatus.CANCELLED: return 'outline';
            case ReviewRequestStatus.QUEUED: return 'outline';
            default: return 'outline';
        }
    };
     const getAssetStatusColor = (status: ReviewedAssetStatus): "default" | "secondary" | "destructive" | "outline" => {
         switch (status) {
            case ReviewedAssetStatus.APPROVED: return 'default';
            case ReviewedAssetStatus.PENDING: return 'outline';
            case ReviewedAssetStatus.NEEDS_CLARIFICATION: return 'secondary';
            case ReviewedAssetStatus.REJECTED: return 'destructive';
            default: return 'outline';
        }
    };

    // Once the editor has closed, focus goes to the Review button of the asset
    // it was on, found again by its asset id (the table re-renders its cells
    // while the editor is open, so the original button may be gone). Only if
    // focus is nowhere (body) or still in the closed editor: focus the user
    // has moved, such as into another Modal, stays where they put it
    const editorExited = () => {
        const id = editorAsset.current;
        editorAsset.current = null;
        if (id === null) return;
        if (!focusIsFree(editorContent.current)) return;
        document.querySelector<HTMLButtonElement>(`[data-review-asset="${CSS.escape(id)}"]`)?.focus();
    };

    // --- Asset Table Columns --- //
    const assetColumns = useMemo<ColumnDef<ReviewedAsset>[]>(() => [
        {
            accessorKey: "asset_fqn",
            header: ({ column }) => <SortButton column={column} label={t('data-asset-reviews:details.columnAssetFqn')} />,
            cell: ({ row }) => {
                const entityLink = appEntityAssetLink(row.original);
                return entityLink
                    ? <Link to={entityLink} className={classes.fqnLink}>{row.original.asset_fqn}</Link>
                    : <span className={classes.fqn}>{row.original.asset_fqn}</span>;
            },
        },
        {
            accessorKey: "asset_type",
            header: ({ column }) => <SortButton column={column} label={t('common:labels.type')} />,
            cell: ({ row }) => <Badge variant="secondary">{row.original.asset_type}</Badge>,
        },
        {
            accessorKey: "status",
            header: ({ column }) => <SortButton column={column} label={t('common:labels.status')} />,
            cell: ({ row }) => (
                <Badge variant={getAssetStatusColor(row.original.status)}>{reviewStatusLabel(row.original.status, t)}</Badge>
            ),
        },
        {
            accessorKey: "updated_at",
            header: ({ column }) => <SortButton column={column} label={t('data-asset-reviews:details.columnLastReviewed')} />,
            cell: ({ row }) => <RelativeDate date={row.original.updated_at} />,
        },
        {
            id: "actions",
            cell: ({ row }) => (
                <Button variant="outline" size="sm" className={classes.reviewButton} data-review-asset={row.original.id} onClick={() => {
                    editorAsset.current = row.original.id ?? null;
                    setSelectedAsset(row.original);
                    // Find the index in the pending assets for navigation
                    const idx = pendingAssets.findIndex(a => a.id === row.original.id);
                    setSelectedAssetIndex(idx >= 0 ? idx + 1 : 1); // 1-based
                    setIsEditorOpen(true);
                }}>
                    {t('data-asset-reviews:details.review')}
                </Button>
            ),
        },
    ], [getAssetStatusColor]);

    // Every status, by its label, once each; a status the list doesn't know still shows, by its value
    const requestStatus = request?.status;
    const statusOptions = useMemo(() => {
        const values: string[] = Object.values(ReviewRequestStatus);
        if (requestStatus && !values.includes(requestStatus)) values.push(requestStatus);
        return values
            .filter((value, i) => values.indexOf(value) === i)
            .map((value) => ({ value, label: reviewStatusLabel(value, t) }));
    }, [requestStatus, t]);

    // The editor Modal: Escape closes it unless a layer above it (its status
    // list, the LLM consent dialog, a shared reviewer's Radix pieces) took it
    useLayeredEscape(isEditorOpen && !!selectedAsset, () => setIsEditorOpen(false));

    // --- Render Logic --- //

    if (loading) {
        return (
            <div className={classes.state}>
                <DetailHeaderSkeleton actionButtons={1} />
                <CardSkeleton titleWidth="w-56" descriptionWidth="w-72" contentRows={4} />
                <TableSkeleton columns={5} rows={5} />
            </div>
        );
    }
    if (error) {
        return (
            <div className={classes.state}>
                <Alert color="red" variant="light" icon={<AlertCircle />}>{error}</Alert>
            </div>
        );
    }
    if (!request) {
        return (
            <div className={classes.state}>
                <Alert color="gray" variant="light">{t('data-asset-reviews:details.notFound')}</Alert>
            </div>
        );
    }

    const displayTitle = request.title || t('data-asset-reviews:table.untitled');
    const assets = Array.isArray(request.assets) ? request.assets : [];

    const actions = (
        <>
            <div className={classes.status}>
                <label htmlFor="overall-status" className={classes.statusLabel}>{t('data-asset-reviews:details.overallStatus')}:</label>
                <Select
                    id="overall-status"
                    data={statusOptions}
                    value={request.status}
                    onChange={(value) => value && handleOverallStatusChange(value as ReviewRequestStatus)}
                    disabled={isUpdatingStatus}
                    allowDeselect={false}
                    placeholder={t('common:placeholders.setStatus')}
                    className={classes.statusSelect}
                    classNames={{ option: classes.option }}
                />
                {isUpdatingStatus && <Loader size={14} />}
            </div>
            <Button variant="outline" size="sm" onClick={() => navigate('/data-asset-reviews')}>
                <ArrowLeft /> {t('data-asset-reviews:details.backToList')}
            </Button>
        </>
    );

    const header = isEditingTitle ? (
        // The kit header's shape, with the title in a field
        <div className={classes.header}>
            <TextInput
                autoFocus
                value={titleDraft}
                maxLength={200}
                onChange={(e) => setTitleDraft(e.target.value)}
                onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                        e.preventDefault();
                        handleSaveTitle();
                    } else if (e.key === 'Escape') {
                        e.preventDefault();
                        cancelEditTitle();
                    }
                }}
                placeholder={t('data-asset-reviews:form.titlePlaceholder')}
                className={classes.titleField}
                classNames={{ input: classes.titleInput }}
                disabled={isSavingTitle}
            />
            <ActionIcon
                variant="filled"
                onClick={handleSaveTitle}
                disabled={isSavingTitle}
                aria-label={t('common:actions.save')}
                className={classes.titleAction}
            >
                {isSavingTitle ? <Loader size={12} color="currentColor" /> : <Check aria-hidden />}
            </ActionIcon>
            <ActionIcon
                variant="subtle"
                color="gray"
                onClick={cancelEditTitle}
                disabled={isSavingTitle}
                aria-label={t('common:actions.cancel')}
                className={classes.titleAction}
            >
                <X aria-hidden />
            </ActionIcon>
            <div className={classes.headerEnd}>{actions}</div>
        </div>
    ) : (
        <PageHeader
            title={displayTitle}
            badges={
                <ActionIcon
                    variant="subtle"
                    color="gray"
                    className={classes.editTitle}
                    onClick={beginEditTitle}
                    aria-label={t('data-asset-reviews:actions.editTitle')}
                    title={t('data-asset-reviews:actions.editTitle')}
                >
                    <Pencil aria-hidden />
                </ActionIcon>
            }
            actions={actions}
        />
    );

    const infoRows: DetailsRow[] = [
        { label: t('common:labels.requester'), value: <span className={classes.wrap}>{request.requester_email}</span> },
        { label: t('common:labels.reviewer'), value: <span className={classes.wrap}>{request.reviewer_email}</span> },
        {
            label: t('data-asset-reviews:details.currentStatus'),
            value: <Badge variant={getRequestStatusColor(request.status)}>{reviewStatusLabel(request.status, t)}</Badge>,
        },
        { label: t('common:labels.created'), value: <RelativeDate date={request.created_at} /> },
        { label: t('common:labels.lastUpdated'), value: <RelativeDate date={request.updated_at} /> },
        { label: t('common:labels.notes'), value: <p className={classes.notes}>{request.notes || t('common:states.none')}</p> },
    ];

    return (
        <>
            <PageLayout
                header={
                    <div className={classes.headerArea}>
                        {header}
                        <div className={classes.idLine}>
                            <span className={classes.id}>{request.id}</span>
                            <ActionIcon
                                variant="subtle"
                                color="gray"
                                className={classes.copy}
                                onClick={handleCopyId}
                                aria-label={t('data-asset-reviews:actions.copyId')}
                                title={t('data-asset-reviews:actions.copyId')}
                            >
                                <Copy aria-hidden />
                            </ActionIcon>
                        </div>
                    </div>
                }
            >
                <PaneStack>
                    <Pane title={t('data-asset-reviews:details.requestInformation')}>
                        <div className={classes.info}>
                            <DetailsGrid rows={infoRows} />
                        </div>
                    </Pane>
                    <Pane flush title={t('data-asset-reviews:details.assetsForReview', { count: assets.length })}>
                        <div className={classes.tableBody}>
                            <DataTable
                                columns={assetColumns}
                                data={assets}
                                // No search needed for this small table within details
                            />
                        </div>
                    </Pane>
                </PaneStack>
            </PageLayout>

            {/* Asset Review Editor: a Modal over the page. As the overlay it
                replaces, a click outside leaves it open */}
            <Modal.Root
                opened={isEditorOpen && !!selectedAsset}
                onClose={() => setIsEditorOpen(false)}
                size={896}
                centered
                // Below the shared Radix dialogs it may open (the LLM consent)
                zIndex={Z_INDEX.modalUnderRadix}
                closeOnClickOutside={false}
                closeOnEscape={false}
                returnFocus={false}
                onExitTransitionEnd={editorExited}
            >
                <Modal.Overlay />
                {selectedAsset && (
                    <Modal.Content ref={editorContent} className={classes.editor}>
                        <Modal.Header className={classes.editorHeader}>
                            <div className={classes.editorHeading}>
                                <Modal.Title className={classes.editorTitle}>
                                    {t('data-asset-reviews:details.reviewing', { fqn: selectedAsset.asset_fqn })}
                                </Modal.Title>
                                {/* Concept diff panel for knowledge concepts */}
                                {selectedAsset.asset_fqn?.startsWith('knowledge-concept://') && request && (
                                    <ConceptDiffPanel request={request} asset={selectedAsset} />
                                )}
                            </div>
                            {/* Unnamed, as before (R16) */}
                            <Modal.CloseButton />
                        </Modal.Header>
                        <div className={classes.editorBody}>
                             {/* Render AssetReviewEditor component */}
                             <AssetReviewEditor
                                requestId={requestId!}
                                asset={selectedAsset}
                                api={api}
                                onReviewSave={(updatedAsset) => {
                                    // Update the asset list in the main request state
                                    setRequest(prevRequest => {
                                        if (!prevRequest) return null;
                                        return {
                                            ...prevRequest,
                                            assets: (Array.isArray(prevRequest.assets) ? prevRequest.assets : []).map(a =>
                                                a.id === updatedAsset.id ? updatedAsset : a
                                            ),
                                            // Optionally update the overall request updated_at timestamp
                                            updated_at: new Date().toISOString(),
                                        };
                                    });
                                    // Don't close dialog here - let Save & Next handle navigation
                                    // Only close if no next or user explicitly closes
                                    if (!hasNextAsset) {
                                        setIsEditorOpen(false);
                                    }
                                }}
                                onNext={goToNextAsset}
                                hasNext={hasNextAsset}
                                currentIndex={selectedAssetIndex}
                                totalCount={pendingAssets.length}
                             />
                             {/* The save action is in AssetReviewEditor; this closes */}
                             <div className={classes.editorFooter}>
                                <Button variant="outline" onClick={() => setIsEditorOpen(false)}>{t('common:actions.close')}</Button>
                            </div>
                        </div>
                    </Modal.Content>
                )}
            </Modal.Root>

            <Toaster />
        </>
    );
}
