import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { Alert, Loader, Select, Textarea } from '@mantine/core';
import { appEntityAssetLink } from '@/lib/app-entity-asset';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { AlertCircle, SparklesIcon } from 'lucide-react';
import { useApi } from '@/hooks/use-api';
import { serverErrorText, USER_TOKEN_REQUIRED_CODE } from '@/lib/server-error-text';
import { useToast } from "@/hooks/use-toast";
import {
    ReviewedAsset,
    ReviewedAssetStatus,
    AssetType,
    AssetDefinition,
    MetricViewDefinition,
    TablePreview,
    ReviewedAssetUpdate,
    AssetAnalysisResponse
} from '@/types/data-asset-review';
import { LLMConfig } from '@/types/llm';
import { DataTable } from "@/components/ui/data-table"; // For table preview
import { RelativeDate } from '@/components/common/relative-date';
import { PrismAsyncLight as SyntaxHighlighterBase } from 'react-syntax-highlighter';
import sql from 'react-syntax-highlighter/dist/esm/languages/prism/sql';
import python from 'react-syntax-highlighter/dist/esm/languages/prism/python';
import { oneLight } from 'react-syntax-highlighter/dist/esm/styles/prism';
import ReactMarkdown from 'react-markdown';
import LLMConsentDialog, { hasLLMConsent } from '@/components/common/llm-consent-dialog';
import MdmMatchReview from '@/components/mdm/mdm-match-review';
import TermMappingSuggestionReview from '@/components/term-mapping/suggestion-review';
import MetricViewDefinitionPanel from '@/components/data-asset-reviews/metric-view-definition';
import classes from './asset-review-editor.module.css';

// Register languages (using base import which has the static method)
SyntaxHighlighterBase.registerLanguage('sql', sql);
SyntaxHighlighterBase.registerLanguage('python', python);

// Type workaround for react-syntax-highlighter compatibility with React 18
const SyntaxHighlighter = SyntaxHighlighterBase as React.ComponentType<any>;

interface AssetReviewEditorProps {
    requestId: string;
    asset: ReviewedAsset;
    api: ReturnType<typeof useApi>;
    onReviewSave: (updatedAsset: ReviewedAsset) => void; // Callback after saving
    onNext?: () => void; // Callback to navigate to next asset
    hasNext?: boolean; // Whether there's a next asset
    currentIndex?: number; // Current position (1-based)
    totalCount?: number; // Total assets in review
}

// Helper function to check API response
const checkApiResponse = <T,>(
    response: { data?: T | { detail?: string }, error?: string | null, errorCode?: string | null },
    name: string,
): T => {
    // A missing user token is already in the user's language: show it as is
    if (response.error && response.errorCode === USER_TOKEN_REQUIRED_CODE) {
        throw new Error(response.error);
    }
    if (response.error) throw new Error(`${name} fetch failed: ${response.error}`);
    if (response.data && typeof response.data === 'object' && 'detail' in response.data && typeof response.data.detail === 'string') {
        throw new Error(`${name} fetch failed: ${response.data.detail}`);
    }
    // Allow null/undefined for content fetching (e.g., definition might be null)
    // if (response.data === null || response.data === undefined) {
    //     throw new Error(`${name} fetch returned null or undefined data.`);
    // }
    return response.data as T;
};

export default function AssetReviewEditor({ 
    requestId, 
    asset, 
    api, 
    onReviewSave,
    onNext,
    hasNext = false,
    currentIndex,
    totalCount,
}: AssetReviewEditorProps) {
    const { t } = useTranslation(['data-asset-reviews', 'common']);
    const { get, put, post } = api;
    const { toast } = useToast();

    // Content State
    const [definition, setDefinition] = useState<AssetDefinition | null>(null);
    const [preview, setPreview] = useState<TablePreview | null>(null);
    const [metricView, setMetricView] = useState<MetricViewDefinition | null>(null);
    const [isLoadingContent, setIsLoadingContent] = useState(false);
    const [contentError, setContentError] = useState<string | null>(null);

    // Form State
    const [currentStatus, setCurrentStatus] = useState<ReviewedAssetStatus>(asset.status);
    const [comments, setComments] = useState<string>(asset.comments || '');
    const [isSaving, setIsSaving] = useState(false);

    // LLM Configuration State
    const [llmConfig, setLlmConfig] = useState<LLMConfig | null>(null);
    const [showConsentDialog, setShowConsentDialog] = useState(false);

    // LLM Analysis State
    const [analysisResult, setAnalysisResult] = useState<AssetAnalysisResponse | null>(null);
    const [isAnalyzing, setIsAnalyzing] = useState(false);
    const [analysisError, setAnalysisError] = useState<string | null>(null);

    // Fetch LLM configuration on mount
    useEffect(() => {
        const fetchLLMConfig = async () => {
            try {
                const response = await get<LLMConfig>('/api/settings/llm');
                const config = checkApiResponse(response, 'LLM Config');
                setLlmConfig(config);
            } catch (err: any) {
                console.error('Error fetching LLM config:', err);
                // Set disabled config on error
                setLlmConfig({ enabled: false, endpoint: null, system_prompt: null, disclaimer_text: '' });
            }
        };

        fetchLLMConfig();
    }, [get]);

    // Fetch content based on asset type
    useEffect(() => {
        const fetchContent = async () => {
            setIsLoadingContent(true);
            setContentError(null);
            setDefinition(null);
            setPreview(null);
            setMetricView(null);
            setAnalysisResult(null); // Reset analysis when asset changes
            setAnalysisError(null);

            try {
                if (asset.asset_type === AssetType.VIEW || asset.asset_type === AssetType.FUNCTION || asset.asset_type === AssetType.NOTEBOOK) {
                    const response = await fetch(`/api/data-asset-reviews/${requestId}/assets/${asset.id}/definition`);
                    if (!response.ok) {
                        const errorBody = await response.text();
                        const errorText = serverErrorText(errorBody) ?? errorBody;
                        throw new Error(errorText || t('data-asset-reviews:editor.messages.fetchDefinitionFailed', { status: response.status }));
                    }
                    const textDefinition = await response.text();
                    setDefinition(textDefinition);
                } else if (asset.asset_type === AssetType.METRIC) {
                    // A metric view: its source, dimensions and measures
                    const response = await get<MetricViewDefinition>(`/api/data-asset-reviews/${requestId}/assets/${asset.id}/metric-view`);
                    setMetricView(checkApiResponse(response, 'Metric View Definition'));
                } else if (asset.asset_type === AssetType.TABLE) {
                    // Fetch table preview
                    const response = await get<TablePreview>(`/api/data-asset-reviews/${requestId}/assets/${asset.id}/preview?limit=50`);
                    const previewData = checkApiResponse(response, 'Table Preview');
                    setPreview(previewData);
                }
            } catch (err: any) {
                console.error('Error fetching asset content:', err);
                setContentError(err.message || t('data-asset-reviews:editor.messages.loadContentFailed'));
            } finally {
                setIsLoadingContent(false);
            }
        };

        fetchContent();
    }, [requestId, asset.id, asset.asset_type, get]); // Re-fetch if asset changes

    const handleSaveReview = async () => {
        setIsSaving(true);
        // setContentError(null); // Error from content fetching should not block saving review itself
        const payload: ReviewedAssetUpdate = {
            status: currentStatus,
            comments: comments || null,
        };

        try {
            const response = await put<ReviewedAsset>(`/api/data-asset-reviews/${requestId}/assets/${asset.id}/status`, payload);
            const updatedAsset = checkApiResponse(response, 'Update Asset Status');
            toast({ title: t('common:toast.success'), description: t('data-asset-reviews:editor.messages.reviewSaved', { fqn: asset.asset_fqn }) });
            onReviewSave(updatedAsset);
        } catch (err: any) {
            // Display error related to saving the review, not to be confused with contentError
            toast({ title: t('data-asset-reviews:editor.messages.saveErrorTitle'), description: t('data-asset-reviews:editor.messages.saveError', { error: err.message }), variant: 'destructive' });
        } finally {
            setIsSaving(false);
        }
    };

    const handleAiAnalysisClick = () => {
        // Check if LLM is enabled
        if (!llmConfig || !llmConfig.enabled) {
            toast({
                title: t('data-asset-reviews:editor.messages.aiDisabledTitle'),
                description: t('data-asset-reviews:editor.messages.aiDisabled'),
                variant: 'destructive'
            });
            return;
        }

        // Check if user has consented
        if (!hasLLMConsent(llmConfig)) {
            setShowConsentDialog(true);
            return;
        }

        // Proceed with analysis
        performAiAnalysis();
    };

    const performAiAnalysis = async () => {
        if (!requestId || !asset.id) return;
        setIsAnalyzing(true);
        setAnalysisError(null);
        setAnalysisResult(null);

        try {
            const response = await post<AssetAnalysisResponse>(
                `/api/data-asset-reviews/${requestId}/assets/${asset.id}/analyze`,
                {}
            );
            const result = checkApiResponse(response, 'AI Analysis');
            setAnalysisResult(result);
            toast({ title: t('data-asset-reviews:editor.messages.aiCompleteTitle'), description: t('data-asset-reviews:editor.messages.aiComplete') });
        } catch (err: any) {
            setAnalysisError(err.message || t('data-asset-reviews:editor.messages.aiFailed'));
            toast({ title: t('data-asset-reviews:editor.messages.aiErrorTitle'), description: err.message, variant: 'destructive' });
        } finally {
            setIsAnalyzing(false);
        }
    };

    // --- Render Content --- //
    const renderAssetContent = () => {
        if (isLoadingContent) {
            return <div className={classes.loading}><Loader size={28} /></div>;
        }
        if (contentError && !definition && !preview && !metricView) { 
             return <Alert color="red" variant="light" icon={<AlertCircle />}>{contentError}</Alert>;
        }

        if (metricView !== null) {
            return <MetricViewDefinitionPanel definition={metricView} />;
        }

        if (definition !== null) {
            const language = (asset.asset_type === AssetType.FUNCTION || asset.asset_type === AssetType.NOTEBOOK) ? 'python' : 'sql';
            // The highlighter as before; its frame keeps a long line inside
            // the editor, where the highlighter's own block scrolls
            return (
                <div className={classes.code}>
                    <SyntaxHighlighter
                        language={language}
                        style={oneLight} 
                        showLineNumbers 
                        wrapLines={true}
                        customStyle={{
                            margin: 0, 
                            padding: '0.5rem', 
                            fontSize: '0.75rem', 
                            maxHeight: '24rem', // SyntaxHighlighter handles its own scroll
                        }}
                    >
                        {definition || ''} 
                    </SyntaxHighlighter>
                </div>
            );
        }

        if (preview !== null) {
            const schema = Array.isArray(preview?.schema) ? preview.schema : [];
            const rows = Array.isArray(preview?.data) ? preview.data : [];
            const columns = schema.map((col: { name: string; type: string; nullable: boolean }) => ({
                accessorKey: col.name,
                header: col.name,
                cell: ({ row }: { row: any }) => <span className={classes.cell} title={String(row.getValue(col.name))}>{String(row.getValue(col.name))}</span>,
            }));
            return (
                 <div className={classes.preview}>
                    <DataTable
                        columns={columns}
                        data={rows}
                    />
                </div>
            );
        }

        if (asset.asset_type === AssetType.MODEL) {
            return <p className={classes.note}>{t('data-asset-reviews:editor.modelReviewNotImplemented')}</p>;
        }

        // A data product or contract is reviewed on its own page
        const entityLink = appEntityAssetLink(asset);
        if (entityLink) {
            return (
                <Button asChild variant="outline" size="sm">
                    <Link to={entityLink}>
                        {asset.asset_type === AssetType.DATA_PRODUCT
                            ? t('data-asset-reviews:editor.openDataProduct')
                            : t('data-asset-reviews:editor.openDataContract')}
                    </Link>
                </Button>
            );
        }

        return <p className={classes.note}>{t('data-asset-reviews:editor.noPreviewAvailable')}</p>;
    };

    // Handle MDM Match assets with specialized component
    if (asset.asset_type === AssetType.MDM_MATCH) {
        return (
            <div className={classes.root}>
                <MdmMatchReview
                    assetFqn={asset.asset_fqn}
                    onReviewComplete={(status) => {
                        // Update the asset status in the parent based on MDM review outcome
                        const newStatus = status === 'approved' 
                            ? ReviewedAssetStatus.APPROVED 
                            : ReviewedAssetStatus.REJECTED;
                        onReviewSave({
                            ...asset,
                            status: newStatus,
                            updated_at: new Date().toISOString(),
                        });
                    }}
                    onNext={onNext}
                    hasNext={hasNext}
                    currentIndex={currentIndex}
                    totalCount={totalCount}
                />
            </div>
        );
    }

    // Handle Term-Mapping suggestion assets with the dedicated reviewer.
    // The component talks directly to the term-mapping decide endpoint, which
    // forward-syncs the ReviewedAsset.status, so we only need to update our
    // local copy here for snappy UI.
    if (asset.asset_type === AssetType.CONCEPT_MAPPING_SUGGESTION) {
        return (
            <div className={classes.root}>
                <TermMappingSuggestionReview
                    assetFqn={asset.asset_fqn}
                    onReviewComplete={(status) => {
                        const newStatus = status === 'approved'
                            ? ReviewedAssetStatus.APPROVED
                            : ReviewedAssetStatus.REJECTED;
                        onReviewSave({
                            ...asset,
                            status: newStatus,
                            updated_at: new Date().toISOString(),
                        });
                    }}
                    onNext={onNext}
                    hasNext={hasNext}
                    currentIndex={currentIndex}
                    totalCount={totalCount}
                />
            </div>
        );
    }

    // One option per status, as before (by its value); a status the list
    // doesn't know still shows, by its value, as the overall status does
    const statusValues: string[] = Object.values(ReviewedAssetStatus);
    if (asset.status && !statusValues.includes(asset.status)) statusValues.push(asset.status);
    const statusOptions = statusValues
        .filter((value, i) => statusValues.indexOf(value) === i)
        .map((value) => ({ value, label: value }));

    return (
        <div className={classes.root}>
             {/* Asset Details */}
             <section className={classes.section}>
                 <h3 className={classes.heading}>{t('data-asset-reviews:editor.assetDetails')}</h3>
                 <div className={classes.line}><span className={classes.strong}>{t('data-asset-reviews:editor.fqnLabel')}</span> <span className={classes.mono}>{asset.asset_fqn}</span></div>
                 <div className={classes.line}><span className={classes.strong}>{t('data-asset-reviews:editor.typeLabel')}</span> <Badge variant="secondary">{asset.asset_type}</Badge></div>
             </section>

            {/* Content Viewer */}
            <section className={classes.section}>
                 <h3 className={classes.heading}>{t('data-asset-reviews:editor.contentPreview')}</h3>
                {renderAssetContent()}
            </section>

            {/* Review Form */}
            <section className={classes.ruled}>
                <h3 className={classes.heading}>{t('data-asset-reviews:editor.yourReview')}</h3>
                <div className={classes.field}>
                    <label htmlFor="asset-status" className={classes.label}>{t('data-asset-reviews:editor.statusLabel')}</label>
                    <Select
                        id="asset-status"
                        data={statusOptions}
                        value={currentStatus}
                        onChange={(value) => value && setCurrentStatus(value as ReviewedAssetStatus)}
                        allowDeselect={false}
                        placeholder={t('data-asset-reviews:editor.statusPlaceholder')}
                        classNames={{ option: classes.option }}
                    />
                </div>
                <div className={classes.field}>
                    <label htmlFor="comments" className={classes.labelTop}>{t('data-asset-reviews:details.comments')}</label>
                    <Textarea
                        id="comments"
                        value={comments}
                        onChange={(e) => setComments(e.target.value)}
                        placeholder={t('data-asset-reviews:editor.commentsPlaceholder')}
                        // Grows with long comments, so they read in full
                        autosize
                        minRows={4}
                        maxRows={12}
                    />
                </div>
                 {contentError && (
                        <Alert color="red" variant="light" icon={<AlertCircle />}>
                            {contentError}
                        </Alert>
                    )}
                 {/* Save button is added here, within the form section */}
                 <div className={classes.actions}>
                     <Button onClick={handleSaveReview} disabled={isSaving}>
                        {isSaving && <Loader size={12} color="currentColor" />} {t('data-asset-reviews:editor.saveReview')}
                     </Button>
                 </div>
            </section>
            {/* Button for automated checks (placeholder) */}
             {asset.asset_type === AssetType.TABLE && (
                 <div className={classes.ruled}>
                    <Button variant="outline" disabled>{t('data-asset-reviews:editor.runAutomatedChecks')}</Button>
                </div>
             )}

            {/* AI Analysis Section - Conditionally shown based on LLM config and asset type */}
            {llmConfig && llmConfig.enabled && (asset.asset_type === AssetType.VIEW || asset.asset_type === AssetType.FUNCTION || asset.asset_type === AssetType.NOTEBOOK) && (
                <section className={classes.ruled}>
                    <h3 className={classes.heading}>
                        <SparklesIcon aria-hidden className={classes.sparkles} /> {t('data-asset-reviews:editor.aiAssistedReview')}
                    </h3>
                    <div>
                        <Button
                            onClick={handleAiAnalysisClick}
                            disabled={isAnalyzing || isLoadingContent || !definition}
                            title={!definition && !isLoadingContent ? t('data-asset-reviews:editor.aiContentRequired') : ""}
                        >
                            {isAnalyzing && <Loader size={12} color="currentColor" />}
                            {analysisResult ? t('data-asset-reviews:editor.rerunAiAnalysis') : t('data-asset-reviews:editor.runAiAnalysis')}
                        </Button>
                    </div>
                    {analysisError && (
                        <Alert color="red" variant="light" icon={<AlertCircle />}>
                            {analysisError}
                        </Alert>
                    )}
                    {analysisResult && (
                        <div className={classes.analysis}>
                            <div className={classes.analysisHead}>
                                <h4 className={classes.analysisTitle}>
                                    {t('data-asset-reviews:editor.aiAnalysisSummary')}
                                    {!analysisResult.phase1_passed && (
                                        <Badge variant="destructive">{t('data-asset-reviews:editor.securityWarning')}</Badge>
                                    )}
                                </h4>
                                <p className={classes.meta}>
                                    {t('data-asset-reviews:editor.modelLabel')}: {analysisResult.model_used || t('common:states.notAvailable')} |
                                    {t('data-asset-reviews:editor.generatedLabel')}: <RelativeDate date={analysisResult.timestamp} />
                                </p>
                            </div>
                            {/* Render as plain text if security check failed */}
                            {!analysisResult.render_as_markdown ? (
                                <div className={classes.plain}>
                                    {analysisResult.analysis_summary}
                                </div>
                            ) : (
                                // The markdown as before: the same renderer and
                                // its typography (prose), no raw HTML; the
                                // frame scrolls a long code block sideways
                                <div className={`markdown-container prose prose-xs dark:prose-invert max-w-none ${classes.markdown}`}>
                                    <ReactMarkdown>
                                        {analysisResult.analysis_summary}
                                    </ReactMarkdown>
                                </div>
                            )}
                        </div>
                    )}
                </section>
            )}

            {/* LLM Consent Dialog */}
            {showConsentDialog && llmConfig && (
                <LLMConsentDialog
                    open={showConsentDialog}
                    onOpenChange={setShowConsentDialog}
                    onAccept={performAiAnalysis}
                    llmConfig={llmConfig}
                />
            )}
        </div>
    );
}
