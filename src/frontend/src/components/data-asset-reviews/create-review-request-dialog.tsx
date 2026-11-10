import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert, Input, Loader, Modal, TextInput, Textarea } from '@mantine/core';
import { Button } from '@/components/ui/button';
import { useApi } from '@/hooks/use-api';
import { useToast } from "@/hooks/use-toast";
import { TreeView } from '@/components/ui/tree-view';
import { CatalogItem, DataAssetReviewRequest, DataAssetReviewRequestCreate, AssetType } from '@/types/data-asset-review';
import { AlertCircle, Folder, FolderOpen, Table, Layout, FunctionSquare } from 'lucide-react';
import { PrincipalPicker } from '@/components/common/principal-picker';
import { Z_INDEX } from '@/mantine/z-index';
import { useLayeredEscape } from '@/mantine/use-layered-escape';
import classes from './create-review-request-dialog.module.css';

// Define user info type based on backend response
interface UserInfo {
    email: string | null;
    username?: string | null;
    user?: string | null;
    ip?: string | null;
}

// Define structure for custom asset data stored separately
interface CustomAssetData {
    type: AssetType | 'catalog' | 'schema';
    isSelectable: boolean;
}

interface CreateReviewRequestDialogProps {
    isOpen: boolean;
    onOpenChange: (isOpen: boolean) => void;
    api: ReturnType<typeof useApi>;
    onSubmitSuccess: (newRequest: DataAssetReviewRequest) => void;
    /**
     * Called once the dialog has closed and its exit transition has ended:
     * the caller then puts focus where it belongs (the list may have reloaded
     * behind it). It gets the dialog's content element, so the caller can tell
     * focus left in the closed dialog from focus the user moved elsewhere.
     * Without it, focus goes back to what had it when it opened.
     */
    onExited?: (content: HTMLElement | null) => void;
}

const checkApiResponse = <T,>(response: { data?: T | { detail?: string }, error?: string | null | undefined }, name: string): T => {
    if (response.error) throw new Error(`${name} creation failed: ${response.error}`);
    if (response.data && typeof response.data === 'object' && 'detail' in response.data && typeof response.data.detail === 'string') {
        throw new Error(`${name} creation failed: ${response.data.detail}`);
    }
    if (response.data === null || response.data === undefined) {
        throw new Error(`${name} creation returned null or undefined data.`);
    }
    return response.data as T;
};

export default function CreateReviewRequestDialog({ isOpen, onOpenChange, api, onSubmitSuccess, onExited }: CreateReviewRequestDialogProps) {
    const { t } = useTranslation(['data-asset-reviews', 'common']);
    const { post, get } = api;
    const { toast } = useToast();
    const [requesterEmail, setRequesterEmail] = useState<string | null>(null);
    const [_, setIsFetchingUser] = useState(false);
    const [reviewerEmail, setReviewerEmail] = useState('');
    const [title, setTitle] = useState('');
    const [notes, setNotes] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [formError, setFormError] = useState<string | null>(null);

    const [catalogItems, setCatalogItems] = useState<CatalogItem[]>([]);
    const [isLoadingCatalog, setIsLoadingCatalog] = useState(true);
    const [catalogError, setCatalogError] = useState<string | null>(null);
    const [expandedNodes, setExpandedNodes] = useState<Set<string>>(new Set());
    const [loadingNodes, setLoadingNodes] = useState<Set<string>>(new Set());
    const [selectedAssetFqns, setSelectedAssetFqns] = useState<Set<string>>(new Set());
    const [assetDataMap, setAssetDataMap] = useState<Map<string, CustomAssetData>>(new Map());

    useEffect(() => {
        const newMap = new Map<string, CustomAssetData>();
        const traverse = (items: CatalogItem[]) => {
            items.forEach(item => {
                const isSelectable = [AssetType.TABLE, AssetType.VIEW, AssetType.FUNCTION, AssetType.MODEL].includes(item.type as AssetType);
                newMap.set(item.id, { type: item.type as (AssetType | 'catalog' | 'schema'), isSelectable });
                if (item.children) {
                    traverse(item.children);
                }
            });
        };
        traverse(catalogItems);
        setAssetDataMap(newMap);
    }, [catalogItems]);

    // Fetch User Info
    const fetchUserInfo = useCallback(async () => {
        setIsFetchingUser(true);
        try {
            const response = await get<UserInfo>('/api/user/info');
            const userData = checkApiResponse(response, 'User Info');
            setRequesterEmail(userData.email || 'not-found@example.com'); // Set email or fallback
        } catch (err: any) {
             console.error("Error fetching user info:", err);
             toast({ title: t('common:toast.error'), description: t('data-asset-reviews:dialog.messages.emailFetchError'), variant: 'destructive' });
             setRequesterEmail('error@example.com'); // Indicate error
        } finally {
            setIsFetchingUser(false);
        }
    }, [get, toast]);

    const fetchCatalogs = useCallback(async () => {
        setIsLoadingCatalog(true);
        setCatalogError(null);
        try {
            const response = await get<CatalogItem[]>('/api/catalogs');
            const data = checkApiResponse(response, 'Catalogs');
            setCatalogItems(Array.isArray(data) ? data : []);
        } catch (err: any) {
            setCatalogError(err.message || t('data-asset-reviews:dialog.messages.catalogLoadFailed'));
            setCatalogItems([]);
        } finally {
            setIsLoadingCatalog(false);
        }
    }, [get]);

    useEffect(() => {
        if (isOpen) {
            setRequesterEmail(null); // Reset email on open before fetching
            setIsFetchingUser(true);
            fetchUserInfo();
            fetchCatalogs();
            setReviewerEmail('');
            setTitle('');
            setNotes('');
            setSelectedAssetFqns(new Set());
            setExpandedNodes(new Set());
            setFormError(null);
        }
    }, [isOpen, fetchCatalogs, fetchUserInfo]);

    const getIcon = (type: string | undefined) => {
         switch (type) {
            case 'catalog': return <Folder aria-hidden className={classes.catalogIcon} />;
            case 'schema': return <FolderOpen aria-hidden className={classes.schemaIcon} />;
            case AssetType.TABLE: return <Table aria-hidden className={classes.tableIcon} />;
            case AssetType.VIEW: return <Layout aria-hidden className={classes.viewIcon} />;
            case AssetType.FUNCTION: return <FunctionSquare aria-hidden className={classes.functionIcon} />;
            default: return null;
        }
    };

    const updateNodeChildren = (items: CatalogItem[], nodeId: string, children: CatalogItem[]): CatalogItem[] => {
        return items.map(item => {
            if (item.id === nodeId) {
                return { ...item, children: children || [] };
            }
            if (item.children) {
                return { ...item, children: updateNodeChildren(item.children, nodeId, children) };
            }
            return item;
        });
    };

    const fetchChildren = async (nodeId: string, nodeType: string | undefined): Promise<CatalogItem[]> => {
        if (!nodeType) return [];
        setLoadingNodes(prev => new Set(prev).add(nodeId));
        try {
            let urls: string[] = [];
            if (nodeType === 'catalog') {
                urls.push(`/api/catalogs/${nodeId}/schemas`);
            } else if (nodeType === 'schema') {
                const [catalogName, schemaName] = nodeId.split('.');
                if (!catalogName || !schemaName) {
                    throw new Error(`Invalid schema FQN: ${nodeId}`);
                }
                // Fetch tables, views, and functions concurrently for a schema
                urls.push(`/api/catalogs/${catalogName}/schemas/${schemaName}/tables`);
                urls.push(`/api/catalogs/${catalogName}/schemas/${schemaName}/views`);
                urls.push(`/api/catalogs/${catalogName}/schemas/${schemaName}/functions`);
            }

            if (urls.length === 0) return [];

            // Use Promise.all to fetch from all URLs concurrently
            const responses = await Promise.all(urls.map(url => get<CatalogItem[]>(url)));

            // Combine results and check for errors
            let combinedResults: CatalogItem[] = [];
            responses.forEach((response, index) => {
                try {
                     // Check each response individually
                    const data = checkApiResponse(response, `Children from ${urls[index]}`);
                    if (Array.isArray(data)) {
                         combinedResults = combinedResults.concat(data);
                    }
                } catch (err: any) {
                    // Log individual fetch errors but continue combining results from others
                    console.error("Error fetching children from", urls[index], ":", err);
                    toast({ title: t('data-asset-reviews:dialog.messages.partialLoadTitle'), description: t('data-asset-reviews:dialog.messages.partialLoadError', { node: nodeId, error: err.message }), variant: 'default' });
                }
            });

            return combinedResults;

        } catch (err: any) {
            console.error('Error fetching children:', err);
            toast({ title: t('common:toast.error'), description: t('data-asset-reviews:dialog.messages.childrenLoadError', { node: nodeId, error: err.message }), variant: 'destructive' });
            return [];
        } finally {
             setLoadingNodes(prev => {
                const next = new Set(prev);
                next.delete(nodeId);
                return next;
            });
        }
    };

    const handleNodeExpand = async (nodeId: string) => {
        if (loadingNodes.has(nodeId)) return;

        const customData = assetDataMap.get(nodeId);
        const nodeType = customData?.type;

        const isCurrentlyExpanded = expandedNodes.has(nodeId);
        setExpandedNodes(prev => {
            const next = new Set(prev);
            if (isCurrentlyExpanded) {
                next.delete(nodeId);
            } else {
                next.add(nodeId);
            }
            return next;
        });

        if (!isCurrentlyExpanded) {
             const node = findCatalogItem(catalogItems, nodeId);
             if (node && (!node.children || node.children.length === 0) && nodeType) {
                 setExpandedNodes(prev => new Set(prev).add(nodeId));
                 const children = await fetchChildren(nodeId, nodeType);
                 if (children.length >= 0) {
                     setCatalogItems(prev => updateNodeChildren(prev, nodeId, children));
                 } else {
                      setExpandedNodes(prev => {
                           const next = new Set(prev);
                           next.delete(nodeId);
                           return next;
                      });
                 }
             }
        }
    };

    const findCatalogItem = (items: CatalogItem[], id: string): CatalogItem | null => {
         for (const item of items) {
            if (item.id === id) return item;
            if (item.children) {
                const found = findCatalogItem(item.children, id);
                if (found) return found;
            }
        }
        return null;
    }

    const handleSelectionChange = (selectedItem: { id: string } | undefined) => {
         if (!selectedItem) return;

         const customData = assetDataMap.get(selectedItem.id);

         if (!customData || !customData.isSelectable) return;

         const fqn = selectedItem.id;
         setSelectedAssetFqns(prev => {
             const next = new Set(prev);
             if (next.has(fqn)) {
                 next.delete(fqn);
             } else {
                 next.add(fqn);
             }
             return next;
         });
     };

    const renderTree = (items: CatalogItem[]): any[] => {
        return items.map((item) => {
            const customData = assetDataMap.get(item.id);
            const hasActualChildren = item.hasChildren || (item.children !== undefined);
            return {
                id: item.id,
                name: item.name,
                icon: getIcon(customData?.type),
                children: item.children ? renderTree(item.children) : [],
                selected: selectedAssetFqns.has(item.id),
                expanded: expandedNodes.has(item.id),
                onExpand: () => handleNodeExpand(item.id),
                loading: loadingNodes.has(item.id),
                hasChildren: hasActualChildren,
            };
        });
    };

    const handleSubmit = async (event: React.FormEvent) => {
        event.preventDefault();
        setFormError(null);

        if (!requesterEmail || requesterEmail.includes('error') || requesterEmail.includes('not-found')) {
            setFormError(t('data-asset-reviews:dialog.messages.requesterVerifyError'));
            return;
        }

        if (!reviewerEmail) {
            setFormError(t('data-asset-reviews:dialog.messages.reviewerRequired'));
            return;
        }
        if (selectedAssetFqns.size === 0) {
            setFormError(t('data-asset-reviews:dialog.messages.selectAtLeastOne'));
            return;
        }
        setIsSubmitting(true);
        const trimmedTitle = title.trim();
        const payload: DataAssetReviewRequestCreate = {
            requester_email: requesterEmail,
            reviewer_email: reviewerEmail,
            asset_fqns: Array.from(selectedAssetFqns),
            title: trimmedTitle || null,
            notes: notes || null,
        };
        try {
            const response = await post<DataAssetReviewRequest>('/api/data-asset-reviews', payload);
            const newRequest = checkApiResponse(response, 'Create Review Request');
            onSubmitSuccess(newRequest);
        } catch (err: any) {
            setFormError(err.message || t('data-asset-reviews:dialog.messages.unexpectedError'));
            toast({ title: t('data-asset-reviews:dialog.messages.submitFailedTitle'), description: err.message, variant: 'destructive' });
        } finally {
            setIsSubmitting(false);
        }
    };

    // Escape closes the dialog, unless a layer above it took it first: the
    // reviewer picker's results or its directory dialog (Radix layers)
    useLayeredEscape(isOpen, () => onOpenChange(false));

    const fieldClassNames = { label: classes.label };
    const contentRef = useRef<HTMLDivElement | null>(null);

    return (
        <Modal.Root
            opened={isOpen}
            onClose={() => onOpenChange(false)}
            size={600}
            centered
            // Below the Radix layers the reviewer picker opens over it
            zIndex={Z_INDEX.modalUnderRadix}
            // As the Radix dialog: a click outside leaves it open; Escape is
            // left to useLayeredEscape
            closeOnClickOutside={false}
            closeOnEscape={false}
            returnFocus={!onExited}
            onExitTransitionEnd={() => onExited?.(contentRef.current)}
        >
            <Modal.Overlay />
            <Modal.Content ref={contentRef} className={classes.content}>
                <Modal.Header className={classes.header}>
                    <Modal.Title className={classes.title}>{t('data-asset-reviews:createRequest')}</Modal.Title>
                </Modal.Header>
                {/* The Modal's body is only the description: the dialog's
                    aria-describedby points at the body, as Radix's did at its
                    DialogDescription. The form follows it. */}
                <Modal.Body className={classes.description}>{t('data-asset-reviews:dialog.description')}</Modal.Body>
                <form onSubmit={handleSubmit} className={classes.form}>
                    <div className={classes.pair}>
                        <TextInput
                            id="requester-email"
                            label={t('data-asset-reviews:dialog.yourEmailLabel')}
                            value={requesterEmail ?? t('common:states.loading')}
                            disabled
                            aria-disabled={true}
                            classNames={fieldClassNames}
                        />
                        {/* The shared picker, labelled by id as before (its own
                            aria-label names it) */}
                        <Input.Wrapper
                            id="reviewer-email"
                            label={t('data-asset-reviews:dialog.reviewerLabel')}
                            classNames={fieldClassNames}
                        >
                            <PrincipalPicker
                                id="reviewer-email"
                                accepts={['user']}
                                value={reviewerEmail || null}
                                onChange={(next) => {
                                    setReviewerEmail(next ?? '');
                                    setFormError(null);
                                }}
                                placeholder={t('data-asset-reviews:dialog.reviewerPlaceholder')}
                                aria-label={t('common:labels.reviewer')}
                            />
                        </Input.Wrapper>
                    </div>
                    <TextInput
                        id="review-title"
                        label={t('data-asset-reviews:form.titleLabel')}
                        value={title}
                        maxLength={200}
                        onChange={(e) => {
                            setTitle(e.target.value);
                            setFormError(null);
                        }}
                        placeholder={t('data-asset-reviews:form.titlePlaceholder')}
                        classNames={fieldClassNames}
                    />
                    <Textarea
                        id="notes"
                        label={t('data-asset-reviews:dialog.notesLabel')}
                        value={notes}
                        onChange={(e) => {
                            setNotes(e.target.value);
                            setFormError(null);
                        }}
                        placeholder={t('data-asset-reviews:dialog.notesPlaceholder')}
                        // Grows with long notes, so they read in full
                        autosize
                        minRows={3}
                        maxRows={10}
                        classNames={fieldClassNames}
                    />

                    <div className={classes.tree}>
                        <div className={classes.treeLabel}>{t('data-asset-reviews:dialog.selectAssetsLabel')}</div>
                        <div className={classes.treeBody}>
                            {isLoadingCatalog ? (
                                <div className={classes.loading}>
                                    <Loader size={24} />
                                </div>
                            ) : catalogError ? (
                                <Alert color="red" variant="light" icon={<AlertCircle />}>
                                    {catalogError}
                                </Alert>
                            ) : (
                                <TreeView
                                    data={renderTree(catalogItems)}
                                    onSelectChange={handleSelectionChange}
                                />
                            )}
                        </div>
                    </div>

                    {formError && (
                        <Alert color="red" variant="light" icon={<AlertCircle />} className={classes.formError}>
                            {formError}
                        </Alert>
                    )}
                </form>
                {/* Outside the form, as before: Enter in a field doesn't submit */}
                <div className={classes.footer}>
                    <Button type="button" variant="outline" disabled={isSubmitting} onClick={() => onOpenChange(false)}>
                        {t('common:actions.cancel')}
                    </Button>
                    <Button type="submit" onClick={handleSubmit} disabled={isSubmitting || selectedAssetFqns.size === 0}>
                        {isSubmitting && <Loader size={12} color="currentColor" />} {t('data-asset-reviews:dialog.submitRequest')}
                    </Button>
                </div>
                {/* The corner close comes last, as Radix's did: focus starts
                    on the first field */}
                <Modal.CloseButton className={classes.close} aria-label={t('common:actions.close')} />
            </Modal.Content>
        </Modal.Root>
    );
}
