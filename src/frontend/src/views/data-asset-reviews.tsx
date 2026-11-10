import { useState, useEffect, useMemo, useRef, useCallback, useId } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { reviewStatusLabel } from '@/lib/status-labels';
import { Column, ColumnDef } from "@tanstack/react-table";
import { Plus, AlertCircle, ArrowUpDown, Trash2 } from 'lucide-react';
import { ActionIcon, Alert, UnstyledButton } from '@mantine/core';
import { ListViewSkeleton } from '@/components/common/list-view-skeleton';

import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { DataTable } from "@/components/ui/data-table";
import { Toaster } from "@/components/ui/toaster";
import { useToast } from "@/hooks/use-toast";
import { useApi } from '@/hooks/use-api';
import { RelativeDate } from '@/components/common/relative-date';
import { DataAssetReviewRequest, ReviewRequestStatus } from '@/types/data-asset-review';
import { PageHeader, PageLayout, Pane } from '@/mantine/page';
import { focusIsFree } from '@/mantine/focus-free';

// Import the Create Dialog
import CreateReviewRequestDialog from '@/components/data-asset-reviews/create-review-request-dialog';
import { useProjectContext } from '@/stores/project-store';
import { deleteOrThrow } from '@/lib/delete-or-throw';
import classes from './data-asset-reviews.module.css';

// Helper function to check API response (reuse if available globally)
const checkApiResponse = <T,>(response: { data?: T | { detail?: string }, error?: string | null }, name: string): T => {
    if (response.error) {
        throw new Error(`${name} fetch failed: ${response.error}`);
    }
    if (response.data && typeof response.data === 'object' && 'detail' in response.data && typeof response.data.detail === 'string') {
        throw new Error(`${name} fetch failed: ${response.data.detail}`);
    }
    if (response.data === null || response.data === undefined) {
        throw new Error(`${name} fetch returned null or undefined data.`);
    }
    return response.data as T;
};

/** A header label that sorts its column, in the grid's header-label look. */
function SortButton({ column, label }: { column: Column<DataAssetReviewRequest, unknown>; label: string }) {
    return (
        <UnstyledButton className={classes.sort} onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}>
            {label}
            <ArrowUpDown aria-hidden className={classes.sortIcon} data-active={column.getIsSorted() ? '' : undefined} />
        </UnstyledButton>
    );
}

export default function DataAssetReviews() {
    const { t } = useTranslation(['data-asset-reviews', 'common']);
    const [requests, setRequests] = useState<DataAssetReviewRequest[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
    // Only the latest load may set the list: an earlier one that answers late
    // (such as one from before a project switch) is dropped
    const loadId = useRef(0);

    // Focus after the create dialog or a delete, at most once each. Create is
    // found again by its data attribute, because a reload shows the skeleton,
    // which remounts the table. Focus moves once the dialog has gone (its exit
    // transition has ended) and no reload is pending, and only if it is
    // nowhere (body) or still in the closed dialog: focus the user has moved
    // during a slow reload stays where they put it.
    const titleId = useId();
    const tableArea = useRef<HTMLDivElement>(null);
    /** Where focus goes: Create, or a row's delete button (by the request's id). */
    const focusTarget = useRef<string | null>(null);
    /** The create dialog's content once it has closed: focus left in it is free. */
    const closedDialog = useRef<HTMLElement | null>(null);
    const focusPending = useRef(false);
    const dialogGone = useRef(true);
    const awaitingReload = useRef(false);
    const [focusRequest, setFocusRequest] = useState(0);
    const maybeReturnFocus = useCallback(() => {
        if (!focusPending.current || !dialogGone.current || awaitingReload.current) return;
        focusPending.current = false;
        setFocusRequest((n) => n + 1);
    }, []);
    const settleReload = useCallback(() => {
        if (!awaitingReload.current) return;
        awaitingReload.current = false;
        maybeReturnFocus();
    }, [maybeReturnFocus]);

    const api = useApi();
    const { get, delete: deleteApi } = api;
    const navigate = useNavigate();
    const { pathname } = useLocation();
    const { toast } = useToast();
    const { currentProject, hasProjectContext } = useProjectContext();

    const fetchRequests = async () => {
        const id = ++loadId.current;
        setLoading(true);
        setError(null);
        try {
            // Build URL with project context if available
            let endpoint = '/api/data-asset-reviews';
            if (hasProjectContext && currentProject) {
                endpoint += `?project_id=${currentProject.id}`;
            }

            const response = await get<DataAssetReviewRequest[]>(endpoint);
            if (id !== loadId.current) return;
            const requestsData = checkApiResponse(response, 'Review Requests');
            setRequests(Array.isArray(requestsData) ? requestsData : []);
        } catch (err: any) {
            if (id !== loadId.current) return;
            console.error('Error fetching review requests:', err);
            setError(err.message || 'Failed to load review requests');
            setRequests([]);
        } finally {
            if (id === loadId.current) {
                setLoading(false);
                settleReload();
            }
        }
    };

    useEffect(() => {
        fetchRequests();
    }, [get, hasProjectContext, currentProject]);

    // Focus the target once the page has rendered after the request: the
    // row's delete button if it is there, else Create, else the title. The
    // table remounts its cells when the page re-renders, so a button is
    // found again by its data attribute
    useEffect(() => {
        if (focusRequest === 0) return;
        if (!focusIsFree(closedDialog.current)) return;
        const area = tableArea.current;
        const row = focusTarget.current;
        const find = (selector: string) => {
            const el = area?.querySelector<HTMLButtonElement>(selector);
            return el && !el.disabled ? el : null;
        };
        const control = (row !== null ? find(`[data-delete-request="${CSS.escape(row)}"]`) : null) ?? find('[data-create-review]');
        if (control) {
            control.focus();
            return;
        }
        const heading = document.getElementById(titleId);
        if (heading) {
            heading.tabIndex = -1;
            heading.focus();
        }
    }, [focusRequest, titleId]);

    /** Focus goes to `row`'s delete button or Create once the dialog (if one is open) and any reload are done. */
    const expectFocusReturn = (dialog: boolean, row: string | null = null) => {
        focusTarget.current = row;
        closedDialog.current = null;
        focusPending.current = true;
        dialogGone.current = !dialog;
    };

    const handleOpenCreateDialog = () => {
        expectFocusReturn(true);
        setIsCreateDialogOpen(true);
    };

    const handleCreateDialogExited = (content: HTMLElement | null) => {
        closedDialog.current = content;
        dialogGone.current = true;
        maybeReturnFocus();
    };

    const handleCreateSuccess = (newRequest: DataAssetReviewRequest) => {
        toast({ title: t('common:toast.success'), description: t('data-asset-reviews:toast.requestCreated', { title: newRequest.title }) });
        awaitingReload.current = true;
        fetchRequests(); // Refresh the list
        setIsCreateDialogOpen(false);
        // Optional: Navigate to the new request's details page
        // navigate(`/data-asset-reviews/${newRequest.id}`);
    };

    const handleDeleteRequest = async (id: string, skipConfirm = false) => {
        if (!skipConfirm && !confirm(t('data-asset-reviews:confirm.deleteRequest'))) {
            return;
        }
        try {
            await deleteOrThrow(deleteApi, `/api/data-asset-reviews/${id}`);
            toast({ title: t('common:toast.success'), description: t('data-asset-reviews:toast.requestDeleted') });
            // The row's button goes with the reload: focus goes to Create
            expectFocusReturn(false);
            awaitingReload.current = true;
            fetchRequests(); // Refresh list
        } catch (err: any) {
            const errorMsg = err.message || t('data-asset-reviews:toast.deleteError');
            toast({ title: t('common:toast.error'), description: errorMsg, variant: 'destructive' });
            setError(errorMsg);
            // No reload: focus stays on the row's delete button
            if (!skipConfirm) {
                expectFocusReturn(false, id);
                maybeReturnFocus();
            }
            if (skipConfirm) throw err; // Re-throw for bulk delete
        }
    };

    // --- Status Color Helper --- //
    const getStatusColor = (status: ReviewRequestStatus): "default" | "secondary" | "destructive" | "outline" => {
        switch (status) {
            case ReviewRequestStatus.APPROVED: return 'default'; // Greenish or success
            case ReviewRequestStatus.IN_REVIEW: return 'secondary'; // Blueish or info
            case ReviewRequestStatus.NEEDS_REVIEW: return 'outline'; // Changed from 'warning' to 'outline'
            case ReviewRequestStatus.DENIED: return 'destructive'; // Reddish
            case ReviewRequestStatus.CANCELLED: return 'outline'; // Greyish
            case ReviewRequestStatus.QUEUED: return 'outline'; // Default/Greyish
            default: return 'outline';
        }
    };

    // --- Column Definitions --- //
    const columns = useMemo<ColumnDef<DataAssetReviewRequest>[]>(() => [
        {
            accessorKey: "title",
            header: ({ column }) => <SortButton column={column} label={t('data-asset-reviews:table.title')} />,
            cell: ({ row }) => (
                <span className={classes.title}>
                    {row.original.title || t('data-asset-reviews:table.untitled')}
                </span>
            ),
        },
        {
            accessorKey: "status",
            header: ({ column }) => <SortButton column={column} label={t('data-asset-reviews:table.status')} />,
            cell: ({ row }) => (
                <Badge variant={getStatusColor(row.original.status)}>{reviewStatusLabel(row.original.status, t)}</Badge>
            ),
        },
        {
            accessorKey: "reviewer_email",
            header: t('data-asset-reviews:table.reviewer'),
            cell: ({ row }) => <span className={classes.person}>{row.original.reviewer_email}</span>,
        },
        {
            accessorKey: "requester_email",
            header: t('data-asset-reviews:table.requester'),
            cell: ({ row }) => <span className={classes.person}>{row.original.requester_email}</span>,
        },
        {
            accessorKey: "assets",
            header: t('data-asset-reviews:table.assets'),
            cell: ({ row }) => (
                <Badge variant="outline">{Array.isArray(row.original.assets) ? row.original.assets.length : 0}</Badge>
            ),
            enableSorting: false,
        },
        {
            accessorKey: "created_at",
            header: ({ column }) => <SortButton column={column} label={t('data-asset-reviews:table.created')} />,
            cell: ({ row }) => <RelativeDate date={row.original.created_at} />,
        },
        {
            accessorKey: "updated_at",
            header: ({ column }) => <SortButton column={column} label={t('data-asset-reviews:table.updated')} />,
            cell: ({ row }) => <RelativeDate date={row.original.updated_at} />,
        },
        {
            id: "actions",
            enableHiding: false,
            cell: ({ row }) => {
                const request = row.original;
                return (
                    <div className={classes.actions}>
                        {/* Named by its title, as before */}
                        <ActionIcon
                            variant="subtle"
                            color="gray"
                            className={classes.delete}
                            data-delete-request={request.id}
                            onClick={(e) => {
                                e.stopPropagation();
                                handleDeleteRequest(request.id, false);
                            }}
                            title={t('common:tooltips.deleteRequest')}
                        >
                            <Trash2 aria-hidden />
                        </ActionIcon>
                    </div>
                );
            },
        },
    ], [t, handleDeleteRequest, getStatusColor]);

    const title = t('data-asset-reviews:title');

    return (
        <>
            <PageLayout
                fullBleed
                header={<PageHeader title={title} titleId={titleId} />}
            >
                <Pane flush aria-label={t('data-asset-reviews:listPane')}>
                    <div ref={tableArea} className={classes.body}>
                        {error && (
                            <Alert color="red" variant="light" icon={<AlertCircle />} className={classes.alert}>
                                {error}
                            </Alert>
                        )}

                        {loading ? (
                            <ListViewSkeleton columns={8} rows={5} toolbarButtons={1} />
                        ) : (
                            <DataTable
                                columns={columns}
                                data={requests}
                                searchColumn="title"
                                toolbarActions={
                                    <>
                                        <Button onClick={handleOpenCreateDialog} data-create-review="">
                                            <Plus />
                                            {t('data-asset-reviews:createRequest')}
                                        </Button>
                                        {/* Add other toolbar actions if needed */}
                                    </>
                                }
                                bulkActions={(selectedRows) => (
                                    <Button
                                        variant="destructive"
                                        size="sm"
                                        onClick={async () => {
                                            const selectedIds = selectedRows.map(r => r.id).filter((id): id is string => !!id);
                                            if (selectedIds.length === 0) return;
                                            if (!confirm(t('data-asset-reviews:confirm.bulkDelete', { count: selectedIds.length }))) return;

                                            // The selected rows go with the reload: focus goes to Create
                                            expectFocusReturn(false);
                                            try {
                                                await Promise.all(selectedIds.map(id => deleteApi(`/api/data-asset-reviews/${id}`)));
                                                toast({ title: t('common:toast.success'), description: t('data-asset-reviews:toast.bulkDeleted', { count: selectedIds.length }) });
                                                awaitingReload.current = true;
                                                fetchRequests();
                                            } catch (err: any) {
                                                console.error("Bulk delete failed:", err);
                                                toast({ title: t('common:toast.error'), description: t('data-asset-reviews:toast.bulkDeleteError'), variant: 'destructive' });
                                                awaitingReload.current = true;
                                                fetchRequests(); // Still refresh to see partial success/failure
                                            }
                                        }}
                                        disabled={selectedRows.length === 0}
                                    >
                                        <Trash2 />
                                        {t('common:actions.deleteSelected', { count: selectedRows.length })}
                                    </Button>
                                )}
                                onRowClick={(row) => {
                                    const requestId = row.original.id;
                                    if (requestId) {
                                        navigate(`${pathname}/${requestId}`);
                                    }
                                }}
                            />
                        )}
                    </div>
                </Pane>
            </PageLayout>

            {/* Create Request Dialog */}
            <CreateReviewRequestDialog
                 isOpen={isCreateDialogOpen}
                 onOpenChange={setIsCreateDialogOpen}
                 api={api} // Pass API hooks
                 onSubmitSuccess={handleCreateSuccess}
                 onExited={handleCreateDialogExited}
             />

            <Toaster />
        </>
    );
}
