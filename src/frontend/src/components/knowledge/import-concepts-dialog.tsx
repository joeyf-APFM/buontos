import React, { useState, useRef, useEffect, useId, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { ActionIcon, Alert, Loader, Radio, Select, TextInput, UnstyledButton } from '@mantine/core';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/mantine/page';
import { FIELD_CLASSES, SELECT_CLASSES } from '@/components/common/dialog-form';
import form from '@/components/common/dialog-form.module.css';
import { buildSchemeOptionGroups, flattenSchemeTree } from '@/lib/scheme-select-options';
import { useSchemeSelectData } from './scheme-select-data';
import { useToast } from '@/hooks/use-toast';
import type { KnowledgeCollection } from '@/types/ontology';
import { AlertCircle, Upload, FileUp, X, Info } from 'lucide-react';
import classes from './import-concepts-dialog.module.css';

const ACCEPTED_EXTENSIONS = '.ttl,.rdf,.xml,.owl,.n3,.nt,.jsonld,.json';

// Sentinel value for the "create a new scheme" option in the target selector.
const CREATE_NEW = '__create_new_scheme__';

// Import supports two placement strategies. Conflict/dedup across schemes is
// intentionally NOT handled here — it is reconciled later in the Review Board.
type SchemeStrategy = 'merge' | 'perfile';

interface ImportConceptsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  collections: KnowledgeCollection[];
  onImported: () => void;
}

// Per-file structural summary once imported. `triples_imported` is what the
// backend actually returns today; the richer breakdown (concepts by type,
// top-level vs child, dangling refs) is a TODO (see CB-10 note below).
// NEW: `status` tracks 'applied' | 'held' for governed uploads; review_request_id if present.
interface FileImportOutcome {
  name: string;
  ok: boolean;
  triplesImported?: number;
  status?: 'applied' | 'held';
  review_request_id?: string;
  error?: string;
}

// A diff preview returned when re-uploading into a scheme that already has
// content (P0-4 + P1-0). The steward reviews it and applies via confirm.
interface UploadPreviewConcept {
  iri: string;
  label?: string | null;
  reference_count?: number | null;
}
interface UploadPreview {
  preview_token: string;
  context_name: string;
  summary: { unchanged: number; modified: number; new: number; removed: number };
  modified: UploadPreviewConcept[];
  new: UploadPreviewConcept[];
  removed: UploadPreviewConcept[];
  fileName: string;
}

export const ImportConceptsDialog: React.FC<ImportConceptsDialogProps> = ({
  open,
  onOpenChange,
  collections,
  onImported,
}) => {
  const { t } = useTranslation(['semantic-models', 'common']);
  const { toast } = useToast();
  const formId = useId();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [schemeStrategy, setSchemeStrategy] = useState<SchemeStrategy>('merge');
  // Merge mode: single target collection for all files.
  const [selectedCollectionIri, setSelectedCollectionIri] = useState<string>('');
  // "Create new scheme" inline path: when the target selector picks this
  // sentinel, we show a name field and create the scheme before importing.
  const [newSchemeName, setNewSchemeName] = useState<string>('');
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [outcomes, setOutcomes] = useState<FileImportOutcome[] | null>(null);
  // STAGED diff previews for a re-upload, computed when files are selected
  // against a scheme that already has content — shown BEFORE the Import button
  // so the user sees the diff and decides whether to import. Applied (confirmed)
  // only when Import is clicked. Empty/new schemes have nothing to diff.
  const [previews, setPreviews] = useState<UploadPreview[]>([]);
  const [previewing, setPreviewing] = useState(false);
  // Conflict resolution UI state
  interface ConflictItem {
    iri: string;
    // The conflicting CONCEPT's own label (backend now supplies this).
    label?: string;
    // Where the concept ALREADY lives: the scheme label + its context IRI.
    existing_label: string;
    existing_context: string;
  }
  const [conflicts, setConflicts] = useState<ConflictItem[]>([]);
  const [conflictMode, setConflictMode] = useState<'skip' | 'update'>('update');
  const [showAllConflicts, setShowAllConflicts] = useState(false);

  // Find a collection anywhere in the (possibly nested) tree by IRI, so we can
  // read its concept_count and decide whether a diff preview is meaningful.
  const findCollection = (
    colls: KnowledgeCollection[],
    iri: string,
  ): KnowledgeCollection | undefined => {
    for (const c of colls) {
      if (c.iri === iri) return c;
      const nested = c.child_collections?.length
        ? findCollection(c.child_collections, iri)
        : undefined;
      if (nested) return nested;
    }
    return undefined;
  };

  // Only editable schemes can receive an import; they are offered wherever they
  // sit in the tree (an editable child of a read-only parent included).
  const schemeOptionGroups = useMemo(() => buildSchemeOptionGroups(collections), [collections]);
  const hasSchemeOptions = schemeOptionGroups.length > 0;
  // Read-only schemes are deliberately not offered; say so when any exist.
  const hasReadOnlyScheme = flattenSchemeTree(collections).some((c) => !c.is_editable);

  const creatingNew = selectedCollectionIri === CREATE_NEW;
  // Create-new first, then the editable schemes, one group per type
  const createNewLabel = t('semantic-models:import.createNewScheme', '＋ Create a new scheme…');
  const leading = useMemo(() => [{ value: CREATE_NEW, label: createNewLabel }], [createNewLabel]);
  const targetSelect = useSchemeSelectData(schemeOptionGroups, leading);
  const newSchemePlaceholder = t('semantic-models:import.newSchemeName', 'New scheme name (e.g. Finance Ontology)');

  // A re-upload only produces a meaningful diff when the target scheme already
  // has concepts. Creating a new scheme (or an empty one) has nothing to diff.
  const targetCollection = creatingNew
    ? undefined
    : findCollection(collections, selectedCollectionIri);
  const targetHasContent = (targetCollection?.concept_count ?? 0) > 0;

  // ADDITIVE MERGE gate. "One scheme" (merge) with MORE THAN ONE file is a pure
  // ADD: every file's concepts must land as Draft in the single target scheme
  // and NOTHING may be deprecated. Routing files 2..N through the re-upload
  // diff/version path (as before) diffed each file against the whole scheme and
  // deprecated every concept not in that file — dropping earlier files' concepts.
  // So a multi-file merge appends additively (additive=true on /import) for ALL
  // files, whether the target is a create-new (empty) scheme or an existing one.
  // A SINGLE-file merge into an existing non-empty scheme is a genuine re-version
  // and keeps the diff/preview path (length === 1 => not additive).
  const isAdditiveMerge = schemeStrategy === 'merge' && selectedFiles.length > 1;

  // Preview-on-select: whenever files + a non-empty target are chosen, ask the
  // backend for the diff WITHOUT applying it, so the user sees "modifies N /
  // adds M / removes K" and decides before clicking Import. Runs against the
  // /import route, which returns {mode:'preview', ...} for non-empty schemes.
  useEffect(() => {
    if (!open) return;
    // Skip only when there is nothing to check yet or per-file (each file makes
    // its own fresh scheme — no shared target to diff/conflict). Create-new IS
    // checked: cross-scheme conflicts don't need the target to exist (they
    // collide against OTHER schemes), so we pre-check with a placeholder IRI —
    // this shows the resolution choice up front instead of creating the scheme,
    // failing the import, and tearing it back down.
    const hasTarget = creatingNew ? !!newSchemeName.trim() : !!selectedCollectionIri;
    if (selectedFiles.length === 0 || !hasTarget || schemeStrategy === 'perfile') {
      setPreviews([]);
      setConflicts([]);
      return;
    }
    // For a not-yet-created scheme, use a placeholder IRI for detection only.
    const detectTarget = creatingNew ? 'urn:ontology:__pending_new_scheme__' : selectedCollectionIri;
    let cancelled = false;
    setPreviewing(true);
    setError(null);
    (async () => {
      const staged: UploadPreview[] = [];
      const foundConflicts: ConflictItem[] = [];
      try {
        for (const file of selectedFiles) {
          // Cross-scheme IRI conflicts (block/skip/update) — check for ANY target,
          // empty or not, since the collision is against OTHER schemes.
          const c = await detectConflicts(file, detectTarget);
          for (const item of c) {
            if (!foundConflicts.some((f) => f.iri === item.iri)) foundConflicts.push(item);
          }
          // Same-scheme re-upload diff preview (only for an EXISTING non-empty
          // target — a create-new scheme has nothing to diff against). SKIP for an
          // additive merge (multi-file "One scheme"): it is a pure add, there is
          // no diff to preview and staging one would imply deprecation.
          if (!creatingNew && targetHasContent && !isAdditiveMerge) {
            try {
              const data = await importOneFile(file, selectedCollectionIri);
              if (data?.mode === 'preview') staged.push({ ...data, fileName: file.name });
            } catch {
              // A parse/preview error surfaces on submit; don't block the panel here.
            }
          }
        }
        if (!cancelled) {
          setPreviews(staged);
          setConflicts(foundConflicts);
        }
      } finally {
        // ALWAYS clear the spinner — even if this run was superseded/cancelled
        // (e.g. the target scheme changed mid-flight). Leaving it set left
        // "Computing changes…" hanging forever.
        setPreviewing(false);
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, selectedFiles, selectedCollectionIri, creatingNew, newSchemeName, targetHasContent, schemeStrategy, isAdditiveMerge]);

  const resetState = () => {
    setSelectedFiles([]);
    setSchemeStrategy('merge');
    setSelectedCollectionIri('');
    setNewSchemeName('');
    setError(null);
    setOutcomes(null);
    setPreviews([]);
    setConflicts([]);
    setConflictMode('update');
    setShowAllConflicts(false);
    setIsUploading(false);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  // Create a new (ontology-type) scheme and return its IRI. Used by the inline
  // "create new scheme" path so a user can import into a fresh scheme without
  // leaving the dialog. Ontology type matches imported RDF (classes/properties).
  const createScheme = async (label: string): Promise<string> => {
    const res = await fetch('/api/knowledge/collections', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        label,
        collection_type: 'ontology',
        scope_level: 'enterprise',
        description: `Imported scheme: ${label}`,
      }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err?.detail || 'Failed to create the new scheme');
    }
    const created = await res.json();
    return created.iri as string;
  };

  // Roll back a scheme we created in THIS submit when the import that followed
  // brought in nothing — otherwise a failed import (e.g. a hard IRI conflict)
  // leaves an orphaned empty scheme that then blocks re-creating the same name
  // ("Collection already exists"). Best-effort; ignore delete errors.
  const deleteScheme = async (iri: string): Promise<void> => {
    try {
      await fetch(`/api/knowledge/collections/${encodeURIComponent(iri)}`, { method: 'DELETE' });
    } catch {
      /* best-effort cleanup */
    }
  };

  const handleOpenChange = (nextOpen: boolean) => {
    if (!nextOpen) resetState();
    onOpenChange(nextOpen);
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const incoming = Array.from(e.target.files ?? []);
    if (incoming.length) {
      setSelectedFiles((prev) => {
        // De-dupe by name so re-adding the same file is a no-op.
        const seen = new Set(prev.map((f) => f.name));
        return [...prev, ...incoming.filter((f) => !seen.has(f.name))];
      });
    }
    setError(null);
    setOutcomes(null);
    // Clear the input so selecting the same file again re-fires change.
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleRemoveFile = (name: string) => {
    setSelectedFiles((prev) => prev.filter((f) => f.name !== name));
  };

  // Returns the raw response. First import into an empty scheme →
  // {mode:'imported', triples_imported}. Re-upload into a scheme with content →
  // {mode:'preview', preview_token, summary, ...} (nothing applied yet).
  const importOneFile = async (file: File, targetIri: string, conflictModeParam?: 'skip' | 'update' | 'block', additive?: boolean): Promise<any> => {
    const formData = new FormData();
    formData.append('file', file);
    const params = new URLSearchParams();
    if (conflictModeParam) {
      params.append('conflict_mode', conflictModeParam);
    }
    // Multi-file merge: append additively as Draft even into a non-empty scheme,
    // bypassing the re-upload diff/version path (which would deprecate concepts
    // not present in this file).
    if (additive) {
      params.append('additive', 'true');
    }
    const url = `/api/knowledge/collections/${encodeURIComponent(targetIri)}/import${params.size > 0 ? '?' + params : ''}`;
    const response = await fetch(url, { method: 'POST', body: formData });
    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      throw new Error(err.detail || `Import failed (${response.status})`);
    }
    return response.json();
  };

  // Pre-check a file for cross-scheme IRI conflicts (subjects that already live
  // in ANOTHER scheme). The /import route RAISES on such conflicts in block mode
  // (so they never come back in the response body); this dedicated endpoint
  // returns them so we can surface the block/skip/update choice up front rather
  // than dead-ending on "No files could be imported". Returns [] on any error
  // (parse issues surface on the real import).
  const detectConflicts = async (file: File, targetIri: string): Promise<ConflictItem[]> => {
    try {
      const formData = new FormData();
      formData.append('file', file);
      const res = await fetch(
        `/api/knowledge/collections/${encodeURIComponent(targetIri)}/import/conflicts`,
        { method: 'POST', body: formData },
      );
      if (!res.ok) return [];
      const data = await res.json();
      return Array.isArray(data?.conflicts) ? data.conflicts : [];
    } catch {
      return [];
    }
  };

  // Apply a staged preview by its token (the server holds the parsed content;
  // confirm applies it). Returns the response payload which may include status ('applied' | 'held')
  // and review_request_id if governed. Used internally by the single Import action.
  const confirmPreviewToken = async (token: string, conflictModeParam?: 'skip' | 'update'): Promise<any> => {
    const params = new URLSearchParams();
    if (conflictModeParam) {
      params.append('conflict_mode', conflictModeParam);
    }
    const url = `/api/semantic-models/uploads/preview/${encodeURIComponent(token)}/confirm${params.size > 0 ? '?' + params : ''}`;
    const res = await fetch(url, { method: 'POST' });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.detail || `Import failed (${res.status})`);
    }
    return res.json();
  };

  // Derive a scheme label from a file name: drop the extension, turn
  // separators into spaces (e.g. "sales_glossary.ttl" -> "sales glossary").
  const schemeLabelFromFile = (fileName: string): string =>
    fileName.replace(/\.[^./]+$/, '').replace(/[-_]+/g, ' ').trim() || fileName;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (selectedFiles.length === 0) return;
    // Per-file needs no pre-selected target — each file makes its own scheme.
    if (schemeStrategy !== 'perfile' && !selectedCollectionIri) return;
    if (creatingNew && !newSchemeName.trim()) return;

    // If conflicts are shown, require a resolution choice before proceeding.
    if (conflicts.length > 0 && !conflictMode) {
      setError(t('semantic-models:import.conflict.mustChoose', 'Select how to handle conflicts.'));
      return;
    }

    setIsUploading(true);
    setError(null);
    setOutcomes(null);

    // PER-FILE: each file becomes its own new scheme (named from the file), then
    // imports into it. Composed client-side from create-scheme + import — no
    // dedicated backend endpoint needed.
    if (schemeStrategy === 'perfile') {
      const results: FileImportOutcome[] = [];
      for (const file of selectedFiles) {
        try {
          const label = schemeLabelFromFile(file.name);
          const iri = await createScheme(label);
          const data = await importOneFile(file, iri, 'skip');
          results.push({
            name: file.name,
            ok: true,
            triplesImported: data?.triples_imported ?? 0,
            status: data?.status || 'applied',
          });
        } catch (err: any) {
          results.push({ name: file.name, ok: false, error: err.message });
        }
      }
      setOutcomes(results);
      setIsUploading(false);
      if (results.some((r) => r.ok)) onImported();
      if (results.every((r) => !r.ok)) {
        setError(t('semantic-models:import.allFailed',
          'No files could be imported. See per-file errors below.'));
      }
      return;
    }

    // Re-upload into a scheme with content: the diff is ALREADY staged and shown
    // (previews). Import just confirms those tokens — the user reviewed the diff
    // before clicking, so there is no second step.
    if (previews.length > 0) {
      const results: FileImportOutcome[] = [];
      for (const pv of previews) {
        try {
          // Thread the conflict mode into confirm if conflicts exist
          const confirmResponse = await confirmPreviewToken(
            pv.preview_token,
            conflicts.length > 0 ? conflictMode : undefined
          );
          results.push({
            name: pv.fileName,
            ok: true,
            status: confirmResponse?.status || 'applied',
            review_request_id: confirmResponse?.review_request_id,
          });
        } catch (err: any) {
          results.push({ name: pv.fileName, ok: false, error: err.message });
        }
      }
      setOutcomes(results);
      setIsUploading(false);
      if (results.some((r) => r.ok)) onImported();
      if (results.every((r) => !r.ok)) {
        setError(t('semantic-models:import.allFailed',
          'No files could be imported. See per-file errors below.'));
      }
      return;
    }

    // Empty / new scheme: nothing to diff — plain import (concepts stamped Draft).
    let targetIri = selectedCollectionIri;
    // Track a scheme created in THIS submit so we can (a) roll it back if the
    // import brings in nothing, and (b) not try to re-create it on a re-submit
    // (e.g. after resolving a conflict) — which would hit "already exists".
    let createdIri: string | null = null;
    if (creatingNew) {
      try {
        targetIri = await createScheme(newSchemeName.trim());
        createdIri = targetIri;
        // Switch the dialog to point at the now-existing scheme so a re-submit
        // imports into it instead of re-creating it.
        setSelectedCollectionIri(targetIri);
      } catch (err: any) {
        setError(err.message || 'Failed to create the new scheme');
        setIsUploading(false);
        return;
      }
    }

    const results: FileImportOutcome[] = [];
    for (const file of selectedFiles) {
      try {
        // Thread conflict mode if conflicts were detected. For a multi-file merge
        // pass additive=true so EVERY file appends as Draft (uniform: harmless on
        // an empty/create-new scheme, and the fix for files 2..N into a non-empty
        // scheme, which previously deprecated earlier files' concepts).
        const data = await importOneFile(
          file,
          targetIri,
          conflicts.length > 0 ? conflictMode : 'block',
          isAdditiveMerge
        );
        // If import returns conflicts, show resolution UI and halt. Roll back a
        // scheme we just created (nothing landed in it) and drop back to
        // create-new so a re-submit recreates it cleanly after the user picks a
        // conflict mode.
        if (data?.conflicts && data.conflicts.length > 0) {
          setConflicts(data.conflicts);
          if (createdIri) { await deleteScheme(createdIri); setSelectedCollectionIri(CREATE_NEW); }
          setIsUploading(false);
          setError(null);
          return;
        }
        // A brand-new/empty scheme should return {mode:'imported'}. If the target
        // turned out non-empty and returned a preview, confirm it (edge case).
        if (data?.mode === 'preview') {
          const confirmResponse = await confirmPreviewToken(data.preview_token, conflictMode);
          results.push({
            name: file.name,
            ok: true,
            status: confirmResponse?.status || 'applied',
            review_request_id: confirmResponse?.review_request_id,
          });
        } else {
          results.push({
            name: file.name,
            ok: true,
            triplesImported: data.triples_imported ?? 0,
            status: data?.status || 'applied',
          });
        }
      } catch (err: any) {
        // A block-mode cross-scheme conflict raises here (the /import route does
        // not return the conflicts in its body). If we haven't already surfaced
        // the resolution choice, pre-check and show it instead of dead-ending.
        const isConflict = /already exist in another scheme|Import blocked/i.test(err?.message || '');
        if (isConflict && conflicts.length === 0) {
          const detected = await detectConflicts(file, targetIri);
          if (detected.length > 0) {
            setConflicts(detected);
            if (createdIri) { await deleteScheme(createdIri); setSelectedCollectionIri(CREATE_NEW); }
            setIsUploading(false);
            setError(null);
            return;
          }
        }
        results.push({ name: file.name, ok: false, error: err.message });
      }
    }

    const anyOk = results.some((r) => r.ok);
    // Roll back a scheme created in this submit if the import brought in
    // nothing — leaving it would orphan an empty scheme and block re-creating
    // the same name. Reset back to create-new so a retry works.
    if (createdIri && !anyOk) {
      await deleteScheme(createdIri);
      setSelectedCollectionIri(CREATE_NEW);
    }
    setIsUploading(false);
    if (anyOk) {
      onImported();
      // Import succeeded: clear the conflict-resolution UI so we don't leave
      // lingering radio choices behind.
      setConflicts([]);
      setShowAllConflicts(false);

      const okCount = results.filter((r) => r.ok).length;
      const held = results.some((r) => r.ok && r.status === 'held');
      const allOk = results.every((r) => r.ok);
      // Clean full success (nothing failed, nothing held for approval): show a
      // success toast and return to the main view instead of parking on a
      // summary panel with a Close button.
      if (allOk && !held) {
        toast({
          title: t('common:toast.success'),
          description: t('semantic-models:import.summaryToast', {
            files: okCount,
            defaultValue: 'Imported {{files}} file(s).',
          }),
        });
        handleOpenChange(false);
        return;
      }
      // Partial success or held-for-approval: keep the dialog open with the
      // outcome summary so the user sees per-file results / the review link.
      setOutcomes(results);
    } else {
      setOutcomes(results);
      setError(t('semantic-models:import.allFailed',
        'No files could be imported. See per-file errors below.'));
    }
  };

  const canSubmit =
    selectedFiles.length > 0 &&
    // Per-file derives a scheme from each file, so no target selection needed.
    (schemeStrategy === 'perfile' || !!selectedCollectionIri) &&
    (!creatingNew || !!newSchemeName.trim()) &&
    !previewing &&
    !isUploading;
  const totalTriples = (outcomes ?? [])
    .filter((r) => r.ok)
    .reduce((sum, r) => sum + (r.triplesImported ?? 0), 0);

  const done = !!outcomes;

  return (
    <Dialog
      opened={open}
      onClose={() => handleOpenChange(false)}
      size="md"
      title={t('semantic-models:import.title', 'Import files')}
      description={t(
        'semantic-models:import.descriptionMulti',
        'Drop one or more ontology files, then choose how they land. The file is just a carrier.'
      )}
      // The kit keeps the title and footer in view; a long conflict list
      // scrolls inside the body
      footer={
        // Single action: one Import button. On a re-upload the diff is shown
        // above (review, then decide) and Import applies exactly that; on a
        // first import there is nothing to diff. Once done → Close.
        <>
          <Button
            type="button"
            variant="outline"
            onClick={() => handleOpenChange(false)}
            disabled={isUploading}
          >
            {done
              ? t('common:actions.close', 'Close')
              : t('common:actions.cancel', 'Cancel')}
          </Button>
          {!done && (
            // In the footer, outside the form: it submits the form by its id
            <Button type="submit" form={formId} disabled={!canSubmit}>
              {/* While it uploads, the spinner joins the icon, as before */}
              {isUploading && <Loader size={12} color="currentColor" />}
              <Upload aria-hidden />
              {t('semantic-models:import.submitMulti', {
                count: selectedFiles.length,
                defaultValue: 'Import {{count}} file(s)',
              })}
            </Button>
          )}
        </>
      }
    >
      <form id={formId} onSubmit={handleSubmit} className={form.form}>
        {/* File picker (multiple) */}
        <div role="group" aria-labelledby={`${formId}-files`} className={classes.field}>
          <span id={`${formId}-files`} className={form.label}>
            {t('semantic-models:import.sourceFiles', 'Source files')}
          </span>
          <Button
            type="button"
            variant="outline"
            className={classes.chooseFiles}
            onClick={() => fileInputRef.current?.click()}
          >
            <Upload aria-hidden />
            {selectedFiles.length > 0
              ? t('semantic-models:import.addMoreFiles', 'Add more files…')
              : t('semantic-models:import.chooseFiles', 'Choose files…')}
          </Button>
          <input
            ref={fileInputRef}
            type="file"
            multiple
            accept={ACCEPTED_EXTENSIONS}
            className={classes.fileInput}
            onChange={handleFileSelect}
          />
          {selectedFiles.length > 0 && (
            <ul className={classes.files}>
              {selectedFiles.map((file) => (
                <li key={file.name} className={classes.file}>
                  <FileUp aria-hidden className={classes.fileIcon} />
                  <span className={classes.fileName} title={file.name}>{file.name}</span>
                  <span className={classes.fileSize}>{(file.size / 1024).toFixed(1)} KB</span>
                  <ActionIcon
                    variant="subtle"
                    color="gray"
                    size={24}
                    onClick={() => handleRemoveFile(file.name)}
                    aria-label={t('common:actions.remove', 'Remove')}
                  >
                    <X size={14} aria-hidden />
                  </ActionIcon>
                </li>
              ))}
            </ul>
          )}
          <p className={form.hint}>
            {t(
              'semantic-models:import.supportedFormats',
              'Supported: Turtle (.ttl), RDF/XML (.rdf, .xml), OWL (.owl), N-Triples (.nt), N3 (.n3), JSON-LD (.jsonld, .json)'
            )}
          </p>
        </div>

        {/* Scheme strategy */}
        <Radio.Group
          label={t('semantic-models:import.howLand', 'How should these land?')}
          value={schemeStrategy}
          onChange={(v) => setSchemeStrategy(v as SchemeStrategy)}
          classNames={FIELD_CLASSES}
        >
          <div className={classes.strategies}>
            {([
              ['merge', t('semantic-models:import.oneScheme', 'One scheme'), t('semantic-models:import.oneSchemeDesc', 'Merge every file into a single concept scheme.')],
              ['perfile', t('semantic-models:import.oneSchemePerFile', 'One scheme per file'), t('semantic-models:import.oneSchemePerFileDesc', 'Each file becomes its own concept scheme.')],
            ] as const).map(([value, title, desc]) => (
              <Radio.Card key={value} value={value} className={classes.strategy}>
                <Radio.Indicator size="xs" className={classes.indicator} />
                <span>
                  <span className={classes.strategyTitle}>{title}</span>
                  <span className={classes.strategyDesc}>{desc}</span>
                </span>
              </Radio.Card>
            ))}
          </div>
        </Radio.Group>
        {schemeStrategy === 'perfile' && (
          <p className={classes.flushHint}>
            {t(
              'semantic-models:import.perFileNote',
              'Each file creates a new scheme named after the file. No target selection needed.'
            )}
          </p>
        )}

        {/* Target collection — only for the merge strategy. Per-file derives
            a scheme per file, so no target selection is shown. */}
        {schemeStrategy !== 'perfile' && (
          <div className={classes.field}>
            <Select
              label={t('semantic-models:import.targetCollection', 'Target concept scheme')}
              placeholder={t('semantic-models:import.selectCollection', 'Select a scheme…')}
              data={targetSelect.data}
              renderOption={targetSelect.renderOption}
              value={selectedCollectionIri || null}
              onChange={(value) => value && setSelectedCollectionIri(value)}
              allowDeselect={false}
              classNames={SELECT_CLASSES}
            />
            {creatingNew && (
              <TextInput
                autoFocus
                value={newSchemeName}
                onChange={(e) => setNewSchemeName(e.currentTarget.value)}
                placeholder={newSchemePlaceholder}
                aria-label={newSchemePlaceholder}
              />
            )}
            {!hasSchemeOptions && (
              <p className={form.hint}>
                {t(
                  'semantic-models:import.noEditableCollections',
                  'No editable schemes available. Create one first.'
                )}
              </p>
            )}
            {hasReadOnlyScheme && (
              <p className={form.hint}>
                {t(
                  'semantic-models:import.readOnlyHint',
                  'Only editable schemes can receive imports. Imported and system schemes are read-only.'
                )}
              </p>
            )}
          </div>
        )}

        {/* Conflicts-reconciled-later note — hidden when a hard IRI conflict
            needs resolving HERE (the resolution UI below takes over), since
            that note implies "handled later" which would be contradictory. */}
        {conflicts.length === 0 && (
          <div className={form.note}>
            <Info size={14} aria-hidden />
            <p>
              {t(
                'semantic-models:import.reconcileNote',
                'Overlapping or duplicate terms across schemes are reconciled later in the Review Board. Import just brings the graph in.'
              )}
            </p>
          </div>
        )}

        {/* Error */}
        {error && (
          <Alert color="red" variant="light" icon={<AlertCircle />} className={classes.alert}>
            {error}
          </Alert>
        )}

        {/* Conflict resolution UI */}
        {conflicts.length > 0 && (
          <div className={classes.conflicts}>
            <div className={classes.conflictsHead}>
              <Info size={14} aria-hidden />
              <span>{t('semantic-models:import.conflict.title', 'Concept IRI conflicts detected')}</span>
            </div>
            <p className={form.muted}>
              {t(
                'semantic-models:import.conflict.description',
                'The following concepts already exist in this scheme. Choose how to handle them:'
              )}
            </p>
            <ul className={classes.conflictList}>
              {(showAllConflicts ? conflicts : conflicts.slice(0, 5)).map((c) => {
                // PRIMARY line = the conflicting CONCEPT itself. Fall back to
                // the last path segment of its IRI when no label is supplied.
                const lastSegment = c.iri
                  .split('#').pop()!
                  .split('/').filter(Boolean).pop() || c.iri;
                const conceptName = c.label || lastSegment;
                const existing = t('semantic-models:import.conflict.alreadyIn', {
                  scheme: c.existing_label || c.existing_context,
                  defaultValue: 'Already in {{scheme}}',
                });
                return (
                  <li key={c.iri} className={classes.conflict}>
                    <div className={classes.conflictName} title={c.iri}>{conceptName}</div>
                    <div className={classes.conflictWhere} title={existing}>{existing}</div>
                  </li>
                );
              })}
            </ul>
            {conflicts.length > 5 && (
              <UnstyledButton
                type="button"
                onClick={() => setShowAllConflicts((v) => !v)}
                className={classes.showAll}
              >
                {showAllConflicts
                  ? t('semantic-models:import.conflict.showLess', 'Show fewer')
                  : t('semantic-models:import.conflict.showAll', {
                      count: conflicts.length,
                      defaultValue: 'Check detailed list ({{count}})',
                    })}
              </UnstyledButton>
            )}
            <Radio.Group
              name="conflict-mode"
              value={conflictMode}
              onChange={(v) => setConflictMode(v as 'skip' | 'update')}
              className={classes.conflictModes}
            >
              <div className={form.choices}>
                <Radio
                  value="update"
                  size="xs"
                  label={t('semantic-models:import.conflict.update', 'Update existing')}
                  description={t('semantic-models:import.conflict.updateDesc', 'Overwrite existing concepts with new definitions')}
                  classNames={{ label: classes.choiceLabel, description: form.hint }}
                />
                <Radio
                  value="skip"
                  size="xs"
                  label={t('semantic-models:import.conflict.skip', 'Import only new')}
                  description={t('semantic-models:import.conflict.skipDesc', 'Skip conflicting IRIs, import the rest')}
                  classNames={{ label: classes.choiceLabel, description: form.hint }}
                />
              </div>
            </Radio.Group>
          </div>
        )}

        {/* Per-file outcomes + structural summary (CB-10, partial) */}
        {outcomes && (
          <div className={classes.outcomes}>
            {outcomes.some((r) => r.ok) && (
              <Alert color="blue" variant="light" icon={<Info />} className={classes.alert}>
                {outcomes.some((r) => r.ok && r.status === 'held')
                  ? t('semantic-models:import.summaryPending', {
                      files: outcomes.filter((r) => r.ok).length,
                      defaultValue: 'Upload submitted for approval ({{files}} file(s))',
                    })
                  : t('semantic-models:import.summary', {
                      files: outcomes.filter((r) => r.ok).length,
                      count: totalTriples,
                      defaultValue:
                        'Imported {{files}} file(s), {{count}} triples total.',
                    })}
                {/* TODO(cb-v2): needs structural summary from import
                    endpoint — # concepts by type, top-level vs child,
                    dangling refs. Endpoint returns triples_imported only. */}
              </Alert>
            )}
            <ul className={classes.files}>
              {outcomes.map((r) => (
                <li key={r.name} className={classes.outcome}>
                  <span className={classes.fileName} title={r.name}>{r.name}</span>
                  {r.ok ? (
                    r.status === 'held' ? (
                      <span className={classes.held}>
                        {t('semantic-models:import.filePending', 'Pending approval')}
                        {r.review_request_id && (
                          <span className={classes.requestId}>({r.review_request_id.substring(0, 8)})</span>
                        )}
                      </span>
                    ) : (
                      <span className={classes.fileSize}>
                        {t('semantic-models:import.fileOk', {
                          count: r.triplesImported ?? 0,
                          defaultValue: '{{count}} triples',
                        })}
                      </span>
                    )
                  ) : (
                    <span className={classes.fileError} title={r.error}>{r.error}</span>
                  )}
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Computing the diff while files are being staged against a
            non-empty scheme. */}
        {previewing && (
          <div className={form.loading}>
            <Loader size={14} />
            {t('semantic-models:import.computingDiff', 'Computing changes…')}
          </div>
        )}

        {/* Diff panel. Shown BEFORE Import (review the changes, then decide);
            once imported (outcomes set), the same panel reads as a summary of
            what was applied. Import applies exactly what is shown here. */}
        {previews.map((pv) => (
          <div key={pv.preview_token} className={form.box}>
            <div className={classes.previewHead}>
              <Info size={14} aria-hidden />
              <span>
                {outcomes
                  ? t('semantic-models:import.changelogTitle', 'Changes applied from {{file}}', { file: pv.fileName })
                  : t('semantic-models:import.previewTitle', 'Changes from {{file}}', { file: pv.fileName })}
              </span>
            </div>
            <p className={form.muted}>
              {t('semantic-models:import.changelogSummary', {
                modified: pv.summary.modified,
                added: pv.summary.new,
                removed: pv.summary.removed,
                unchanged: pv.summary.unchanged,
                defaultValue:
                  'Modifies {{modified}}, adds {{added}}, removes {{removed}} ({{unchanged}} unchanged).',
              })}
            </p>
            {(['modified', 'new', 'removed'] as const).map((bucket) => {
              const items = Array.isArray(pv[bucket]) ? pv[bucket] : [];
              if (!items.length) return null;
              const labelForBucket =
                bucket === 'modified'
                  ? t('semantic-models:import.bucketModified', 'Modified (new version)')
                  : bucket === 'new'
                  ? t('semantic-models:import.bucketNew', 'New')
                  : t('semantic-models:import.bucketRemoved', 'Removed (deprecated, not deleted)');
              return (
                <div key={bucket} className={classes.bucket}>
                  <div className={classes.bucketLabel}>{labelForBucket}</div>
                  <ul className={classes.bucketList}>
                    {items.map((c) => (
                      <li key={c.iri} className={classes.bucketItem}>
                        <span className={classes.bucketName} title={c.label || c.iri}>{c.label || c.iri}</span>
                        {bucket === 'removed' && (c.reference_count ?? 0) > 0 && (
                          <span className={classes.referenced}>
                            {t('semantic-models:import.stillReferenced', {
                              count: c.reference_count ?? 0,
                              defaultValue: 'used by {{count}}',
                            })}
                          </span>
                        )}
                      </li>
                    ))}
                  </ul>
                </div>
              );
            })}
          </div>
        ))}
      </form>
    </Dialog>
  );
};

export default ImportConceptsDialog;
