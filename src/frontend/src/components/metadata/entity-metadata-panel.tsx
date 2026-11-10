import React from 'react';
import { Button } from '@/components/ui/button';
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from '@/components/ui/table';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { RelativeDate } from '@/components/common/relative-date';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Plus, RefreshCcw, Eye, Trash2, FileText, LinkIcon, Paperclip, Pencil, Loader2, Share2, ArrowDownToLine } from 'lucide-react';
import FilePreviewDialog from '@/components/preview/file-preview-dialog';
import { useToast } from '@/hooks/use-toast';
import { Dialog } from '@/mantine/page';
import MarkdownViewer from '@/components/ui/markdown-viewer';
import EntityInfoDialog from '@/components/metadata/entity-info-dialog';
import { useTranslation } from 'react-i18next';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import classes from '@/components/common/panel.module.css';
import { useSharedAssets, attachSharedAsset, RichTextItem, LinkItem, DocumentItem, MetadataAttachment } from '@/hooks/use-entity-metadata';

export type EntityKind = 'data_domain' | 'data_product' | 'data_contract' | 'concept' | 'collection' | 'compliance_policy' | 'asset';

interface Props {
  entityId: string;
  entityType: EntityKind;
  /**
   * For a page-kit Pane: no border, background or padding of the panel's own,
   * a compact head, and 28px table rows. Put it in a Pane without a title,
   * which the panel's head would repeat.
   */
  flush?: boolean;
}

const EntityMetadataPanel: React.FC<Props> = ({ entityId, entityType, flush = false }) => {
  const { toast } = useToast();
  const { t } = useTranslation(['metadata', 'common']);
  const ids = React.useId();

  const [richTexts, setRichTexts] = React.useState<RichTextItem[]>([]);
  const [links, setLinks] = React.useState<LinkItem[]>([]);
  const [documents, setDocuments] = React.useState<DocumentItem[]>([]);
  const [_attachments, setAttachments] = React.useState<MetadataAttachment[]>([]);

  const [addingNote, setAddingNote] = React.useState(false);
  const [noteTitle, setNoteTitle] = React.useState('');
  const [noteDesc, setNoteDesc] = React.useState('');
  const [noteContent, setNoteContent] = React.useState('');
  const [noteLevel, setNoteLevel] = React.useState(50);
  const [noteInheritable, setNoteInheritable] = React.useState(true);
  const [noteIsShared, setNoteIsShared] = React.useState(false);

  const [addingLink, setAddingLink] = React.useState(false);
  const [linkTitle, setLinkTitle] = React.useState('');
  const [linkDesc, setLinkDesc] = React.useState('');
  const [linkUrl, setLinkUrl] = React.useState('');
  const [linkLevel, setLinkLevel] = React.useState(50);
  const [linkInheritable, setLinkInheritable] = React.useState(true);
  const [linkIsShared, setLinkIsShared] = React.useState(false);

  const [addingDoc, setAddingDoc] = React.useState(false);
  const [docTitle, setDocTitle] = React.useState('');
  const [docDesc, setDocDesc] = React.useState('');
  const [docFile, setDocFile] = React.useState<File | null>(null);
  const [docLevel, setDocLevel] = React.useState(50);
  const [docInheritable, setDocInheritable] = React.useState(true);
  const [docIsShared, setDocIsShared] = React.useState(false);
  const [uploadingDoc, setUploadingDoc] = React.useState(false);

  const [previewDoc, setPreviewDoc] = React.useState<DocumentItem | null>(null);
  const [previewNote, setPreviewNote] = React.useState<RichTextItem | null>(null);
  const [showPreview, setShowPreview] = React.useState(false);
  const [loading, setLoading] = React.useState(true);

  // Shared assets picker dialog
  const [showSharedPicker, setShowSharedPicker] = React.useState<'rich_text' | 'link' | 'document' | null>(null);
  const sharedAssets = useSharedAssets();

  // Editing states for notes
  const [editingNote, setEditingNote] = React.useState<RichTextItem | null>(null);
  const [editNoteTitle, setEditNoteTitle] = React.useState('');
  const [editNoteDesc, setEditNoteDesc] = React.useState('');
  const [editNoteContent, setEditNoteContent] = React.useState('');
  const [editNoteLevel, setEditNoteLevel] = React.useState(50);
  const [editNoteInheritable, setEditNoteInheritable] = React.useState(true);
  
  // Editing states for links
  const [editingLink, setEditingLink] = React.useState<LinkItem | null>(null);
  const [editLinkTitle, setEditLinkTitle] = React.useState('');
  const [editLinkUrl, setEditLinkUrl] = React.useState('');
  const [editLinkDesc, setEditLinkDesc] = React.useState('');
  const [editLinkLevel, setEditLinkLevel] = React.useState(50);
  const [editLinkInheritable, setEditLinkInheritable] = React.useState(true);

  const fetchMetadata = React.useCallback(async () => {
    try {
      setLoading(true);
      const [rt, li, docs, att] = await Promise.all([
        fetch(`/api/entities/${entityType}/rich-texts?entity_id=${encodeURIComponent(entityId)}`).then(r => r.json()),
        fetch(`/api/entities/${entityType}/links?entity_id=${encodeURIComponent(entityId)}`).then(r => r.json()),
        fetch(`/api/entities/${entityType}/documents?entity_id=${encodeURIComponent(entityId)}`).then(r => r.json()),
        fetch(`/api/entities/${entityType}/attachments?entity_id=${encodeURIComponent(entityId)}`).then(r => r.ok ? r.json() : []),
      ]);
      // Sort by level ascending
      const sortByLevel = <T extends { level?: number; created_at?: string }>(arr: T[]) => 
        arr.slice().sort((a, b) => (a.level ?? 50) - (b.level ?? 50));
      setRichTexts(sortByLevel(Array.isArray(rt) ? rt : []));
      setLinks(sortByLevel(Array.isArray(li) ? li : []));
      setDocuments(sortByLevel(Array.isArray(docs) ? docs : []));
      setAttachments(Array.isArray(att) ? att : []);
    } catch (e: any) {
      toast({ title: t('messages.loadFailed'), description: e.message, variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  }, [entityId, entityType, toast]);

  React.useEffect(() => { fetchMetadata(); }, [fetchMetadata]);

  const handleAttachSharedAsset = async (assetType: 'rich_text' | 'link' | 'document', assetId: string) => {
    try {
      await attachSharedAsset(entityType, entityId, assetType, assetId);
      toast({ title: t('messages.attachSuccess') || 'Shared asset attached' });
      setShowSharedPicker(null);
      fetchMetadata();
    } catch (e: any) {
      toast({ title: t('messages.attachFailed') || 'Failed to attach', description: e.message, variant: 'destructive' });
    }
  };

  const truncate = (text?: string | null, maxLen: number = 80) => {
    if (!text) return '';
    return text.length > maxLen ? text.slice(0, maxLen - 1) + '…' : text;
  };

  return (
    <>
    <section className={classes.pane} aria-labelledby={`${ids}-title`} data-flush={flush || undefined}>
      <div className={classes.headGroup}>
        <div className={classes.head}>
          <h3 id={`${ids}-title`} className={classes.title}>
            {t('title')}
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button variant="ghost" size="icon" onClick={() => setShowPreview(true)}>
                    <Eye />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>{t('previewRenderedPage')}</TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </h3>
        </div>
        <p className={classes.subtitle}>{t('description')}</p>
      </div>
      <div className={classes.body}>
        {/* Notes */}
        <section className={classes.section} aria-labelledby={`${ids}-notes`}>
          <div className={classes.sectionHead}>
            <h4 id={`${ids}-notes`} className={classes.sectionTitle}><FileText aria-hidden />{t('notes.title')}</h4>
            <TooltipProvider>
              <div className={classes.toolbar}>
                {!addingNote && (
                  <>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button variant="ghost" size="icon" onClick={() => setAddingNote(true)}>
                          <Plus />
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>{t('notes.add')}</TooltipContent>
                    </Tooltip>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button variant="ghost" size="icon" onClick={() => setShowSharedPicker('rich_text')}>
                          <Share2 />
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>{t('notes.attachShared') || 'Attach shared note'}</TooltipContent>
                    </Tooltip>
                  </>
                )}
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button variant="ghost" size="icon" onClick={fetchMetadata}>
                      <RefreshCcw />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>{t('notes.refresh')}</TooltipContent>
                </Tooltip>
              </div>
            </TooltipProvider>
          </div>
          {!addingNote ? (
            <div>
              {loading ? (
                <div className={classes.inlineLoading}><Loader2 className={classes.spin} /> {t('common:actions.loading')}</div>
              ) : richTexts.length === 0 ? (
                <div className={classes.empty}>{t('notes.noNotes')}</div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead style={{ width: 64 }}>{t('notes.table.level') || 'Level'}</TableHead>
                      <TableHead>{t('notes.table.title')}</TableHead>
                      <TableHead>{t('notes.table.description')}</TableHead>
                      <TableHead style={{ width: 80 }}>{t('notes.table.flags') || 'Flags'}</TableHead>
                      <TableHead>{t('notes.table.created')}</TableHead>
                      <TableHead style={{ width: 96 }}>{t('notes.table.actions')}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {richTexts.map(n => (
                      <TableRow key={n.id}>
                        <TableCell className={classes.level}>{n.level ?? 50}</TableCell>
                        <TableCell className={classes.strong}>{n.title}</TableCell>
                        <TableCell className={classes.cellMuted}>{truncate(n.short_description, 60)}</TableCell>
                        <TableCell>
                          <div className={classes.rowActions}>
                            {n.is_shared && <Badge variant="secondary" className={classes.flag}><Share2 size={12} aria-hidden />S</Badge>}
                            {n.inheritable && <Badge variant="outline" className={classes.flag}><ArrowDownToLine size={12} aria-hidden />I</Badge>}
                          </div>
                        </TableCell>
                        <TableCell className={classes.cellMuted}>{n.created_at ? <RelativeDate date={n.created_at} /> : '—'}</TableCell>
                        <TableCell>
                          <div className={classes.rowActions}>
                            <TooltipProvider>
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <Button variant="ghost" size="icon" onClick={() => setPreviewNote(n)}>
                                    <Eye />
                                  </Button>
                                </TooltipTrigger>
                                <TooltipContent>{t('notes.preview')}</TooltipContent>
                              </Tooltip>
                            </TooltipProvider>
                            <TooltipProvider>
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <Button variant="ghost" size="icon" onClick={() => { setEditingNote(n); setEditNoteTitle(n.title); setEditNoteDesc(n.short_description || ''); setEditNoteContent(n.content_markdown); setEditNoteLevel(n.level ?? 50); setEditNoteInheritable(n.inheritable ?? true); }}>
                                    <Pencil />
                                  </Button>
                                </TooltipTrigger>
                                <TooltipContent>{t('notes.edit')}</TooltipContent>
                              </Tooltip>
                            </TooltipProvider>
                            <Button variant="ghost" size="icon" className={classes.danger} onClick={async () => {
                              try {
                                const resp = await fetch(`/api/rich-texts/${n.id}`, { method: 'DELETE' });
                                if (!resp.ok) throw new Error(t('notes.messages.deleteFailed'));
                                fetchMetadata();
                              } catch (e: any) { toast({ title: t('notes.messages.deleteFailed'), description: e.message, variant: 'destructive' }); }
                            }}>
                              <Trash2 />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </div>
          ) : (
            <div className={classes.form}>
              <div className={classes.field}><Label htmlFor="note-title">{t('notes.form.title')}</Label><Input id="note-title" value={noteTitle} onChange={e => setNoteTitle(e.target.value)} /></div>
              <div className={classes.field}><Label htmlFor="note-desc">{t('notes.form.shortDescription')}</Label><Input id="note-desc" value={noteDesc} onChange={e => setNoteDesc(e.target.value)} /></div>
              <div className={classes.field}><Label htmlFor="note-content">{t('notes.form.content')}</Label><Textarea id="note-content" rows={6} value={noteContent} onChange={e => setNoteContent(e.target.value)} /></div>
              <div className={classes.formRow}>
                <div>
                  <Label htmlFor="note-level">{t('notes.form.level') || 'Level'}</Label>
                  <Input id="note-level" type="number" min={0} max={999} value={noteLevel} onChange={e => setNoteLevel(Number(e.target.value))} />
                </div>
                <div className={classes.check}>
                  <Checkbox id="note-inheritable" checked={noteInheritable} onCheckedChange={(v) => setNoteInheritable(!!v)} />
                  <Label htmlFor="note-inheritable">{t('notes.form.inheritable') || 'Inheritable'}</Label>
                </div>
                <div className={classes.check}>
                  <Checkbox id="note-shared" checked={noteIsShared} onCheckedChange={(v) => setNoteIsShared(!!v)} />
                  <Label htmlFor="note-shared">{t('notes.form.shared') || 'Shared asset'}</Label>
                </div>
              </div>
              <div className={classes.buttons}>
                <Button size="sm" onClick={async () => {
                  try {
                    const payload = { entity_id: entityId, entity_type: entityType, title: noteTitle, short_description: noteDesc || undefined, content_markdown: noteContent, level: noteLevel, inheritable: noteInheritable, is_shared: noteIsShared };
                    const endpoint = noteIsShared ? '/api/metadata/shared/rich-texts' : `/api/entities/${entityType}/rich-texts?entity_id=${encodeURIComponent(entityId)}`;
                    const resp = await fetch(endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
                    if (!resp.ok) throw new Error(await resp.text());
                    setNoteTitle(''); setNoteDesc(''); setNoteContent(''); setNoteLevel(50); setNoteInheritable(true); setNoteIsShared(false); setAddingNote(false);
                    fetchMetadata();
                    if (noteIsShared) sharedAssets.refresh();
                  } catch (e: any) { toast({ title: t('notes.messages.addFailed'), description: e.message, variant: 'destructive' }); }
                }}>{t('notes.form.save')}</Button>
                <Button size="sm" variant="outline" onClick={() => setAddingNote(false)}>{t('notes.form.cancel')}</Button>
              </div>
            </div>
          )}
        </section>

        {/* Links */}
        <section className={classes.section} aria-labelledby={`${ids}-links`}>
          <div className={classes.sectionHead}>
            <h4 id={`${ids}-links`} className={classes.sectionTitle}><LinkIcon aria-hidden />{t('links.title')}</h4>
            <TooltipProvider>
              <div className={classes.toolbar}>
                {!addingLink && (
                  <>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button variant="ghost" size="icon" onClick={() => setAddingLink(true)}>
                          <Plus />
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>{t('links.add')}</TooltipContent>
                    </Tooltip>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button variant="ghost" size="icon" onClick={() => setShowSharedPicker('link')}>
                          <Share2 />
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>{t('links.attachShared') || 'Attach shared link'}</TooltipContent>
                    </Tooltip>
                  </>
                )}
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button variant="ghost" size="icon" onClick={fetchMetadata}>
                      <RefreshCcw />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>{t('links.refresh')}</TooltipContent>
                </Tooltip>
              </div>
            </TooltipProvider>
          </div>
          {!addingLink ? (
            <div>
              {loading ? (
                <div className={classes.inlineLoading}><Loader2 className={classes.spin} /> {t('common:actions.loading')}</div>
              ) : links.length === 0 ? (
                <div className={classes.empty}>{t('links.noLinks')}</div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead style={{ width: 64 }}>{t('links.table.level') || 'Level'}</TableHead>
                      <TableHead>{t('links.table.title')}</TableHead>
                      <TableHead>{t('links.table.url')}</TableHead>
                      <TableHead style={{ width: 80 }}>{t('links.table.flags') || 'Flags'}</TableHead>
                      <TableHead>{t('links.table.created')}</TableHead>
                      <TableHead style={{ width: 96 }}>{t('links.table.actions')}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {links.map(l => (
                      <TableRow key={l.id}>
                        <TableCell className={classes.level}>{l.level ?? 50}</TableCell>
                        <TableCell className={classes.strong}>{l.title}</TableCell>
                        <TableCell className={classes.cellLink}><a href={l.url} target="_blank" rel="noreferrer">{l.url}</a></TableCell>
                        <TableCell>
                          <div className={classes.rowActions}>
                            {l.is_shared && <Badge variant="secondary" className={classes.flag}><Share2 size={12} aria-hidden />S</Badge>}
                            {l.inheritable && <Badge variant="outline" className={classes.flag}><ArrowDownToLine size={12} aria-hidden />I</Badge>}
                          </div>
                        </TableCell>
                        <TableCell className={classes.cellMuted}>{l.created_at ? <RelativeDate date={l.created_at} /> : '—'}</TableCell>
                        <TableCell>
                          <div className={classes.rowActions}>
                            <TooltipProvider>
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <Button variant="ghost" size="icon" onClick={() => window.open(l.url, '_blank')}>
                                    <Eye />
                                  </Button>
                                </TooltipTrigger>
                                <TooltipContent>{t('links.open')}</TooltipContent>
                              </Tooltip>
                            </TooltipProvider>
                            <TooltipProvider>
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <Button variant="ghost" size="icon" onClick={() => { setEditingLink(l); setEditLinkTitle(l.title); setEditLinkUrl(l.url); setEditLinkDesc(l.short_description || ''); setEditLinkLevel(l.level ?? 50); setEditLinkInheritable(l.inheritable ?? true); }}>
                                    <Pencil />
                                  </Button>
                                </TooltipTrigger>
                                <TooltipContent>{t('links.edit')}</TooltipContent>
                              </Tooltip>
                            </TooltipProvider>
                            <Button variant="ghost" size="icon" className={classes.danger} onClick={async () => {
                              try {
                                const resp = await fetch(`/api/links/${l.id}`, { method: 'DELETE' });
                                if (!resp.ok) throw new Error(t('links.messages.deleteFailed'));
                                fetchMetadata();
                              } catch (e: any) { toast({ title: t('links.messages.deleteFailed'), description: e.message, variant: 'destructive' }); }
                            }}>
                              <Trash2 />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </div>
          ) : (
            <div className={classes.form}>
              <div className={classes.field}><Label htmlFor="link-title">{t('links.form.title')}</Label><Input id="link-title" value={linkTitle} onChange={e => setLinkTitle(e.target.value)} /></div>
              <div className={classes.field}><Label htmlFor="link-url">{t('links.form.url')}</Label><Input id="link-url" value={linkUrl} onChange={e => setLinkUrl(e.target.value)} /></div>
              <div className={classes.field}><Label htmlFor="link-desc">{t('links.form.shortDescription')}</Label><Input id="link-desc" value={linkDesc} onChange={e => setLinkDesc(e.target.value)} /></div>
              <div className={classes.formRow}>
                <div>
                  <Label htmlFor="link-level">{t('links.form.level') || 'Level'}</Label>
                  <Input id="link-level" type="number" min={0} max={999} value={linkLevel} onChange={e => setLinkLevel(Number(e.target.value))} />
                </div>
                <div className={classes.check}>
                  <Checkbox id="link-inheritable" checked={linkInheritable} onCheckedChange={(v) => setLinkInheritable(!!v)} />
                  <Label htmlFor="link-inheritable">{t('links.form.inheritable') || 'Inheritable'}</Label>
                </div>
                <div className={classes.check}>
                  <Checkbox id="link-shared" checked={linkIsShared} onCheckedChange={(v) => setLinkIsShared(!!v)} />
                  <Label htmlFor="link-shared">{t('links.form.shared') || 'Shared asset'}</Label>
                </div>
              </div>
              <div className={classes.buttons}>
                <Button size="sm" onClick={async () => {
                  try {
                    const payload = { entity_id: entityId, entity_type: entityType, title: linkTitle, short_description: linkDesc || undefined, url: linkUrl, level: linkLevel, inheritable: linkInheritable, is_shared: linkIsShared };
                    const endpoint = linkIsShared ? '/api/metadata/shared/links' : `/api/entities/${entityType}/links?entity_id=${encodeURIComponent(entityId)}`;
                    const resp = await fetch(endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
                    if (!resp.ok) throw new Error(await resp.text());
                    setLinkTitle(''); setLinkDesc(''); setLinkUrl(''); setLinkLevel(50); setLinkInheritable(true); setLinkIsShared(false); setAddingLink(false);
                    fetchMetadata();
                    if (linkIsShared) sharedAssets.refresh();
                  } catch (e: any) { toast({ title: t('links.messages.addFailed'), description: e.message, variant: 'destructive' }); }
                }}>{t('links.form.save')}</Button>
                <Button size="sm" variant="outline" onClick={() => setAddingLink(false)}>{t('links.form.cancel')}</Button>
              </div>
            </div>
          )}
        </section>

        {/* Documents */}
        <section className={classes.section} aria-labelledby={`${ids}-documents`}>
          <div className={classes.sectionHead}>
            <h4 id={`${ids}-documents`} className={classes.sectionTitle}><Paperclip aria-hidden />{t('documents.title')}</h4>
            <TooltipProvider>
              <div className={classes.toolbar}>
                {!addingDoc && (
                  <>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button variant="ghost" size="icon" onClick={() => setAddingDoc(true)}>
                          <Plus />
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>{t('documents.add')}</TooltipContent>
                    </Tooltip>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button variant="ghost" size="icon" onClick={() => setShowSharedPicker('document')}>
                          <Share2 />
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>{t('documents.attachShared') || 'Attach shared document'}</TooltipContent>
                    </Tooltip>
                  </>
                )}
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button variant="ghost" size="icon" onClick={fetchMetadata}>
                      <RefreshCcw />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>{t('documents.refresh')}</TooltipContent>
                </Tooltip>
              </div>
            </TooltipProvider>
          </div>
          {addingDoc && (
            <div className={classes.form}>
              <div className={classes.field}><Label htmlFor="doc-title">{t('documents.form.title')}</Label><Input id="doc-title" value={docTitle} onChange={e => setDocTitle(e.target.value)} /></div>
              <div className={classes.field}><Label htmlFor="doc-desc">{t('documents.form.shortDescription')}</Label><Input id="doc-desc" value={docDesc} onChange={e => setDocDesc(e.target.value)} /></div>
              <div className={classes.field}><Label htmlFor="doc-file">{t('documents.form.file')}</Label><Input id="doc-file" type="file" onChange={e => setDocFile(e.target.files?.[0] || null)} /></div>
              <div className={classes.formRow}>
                <div>
                  <Label htmlFor="doc-level">{t('documents.form.level') || 'Level'}</Label>
                  <Input id="doc-level" type="number" min={0} max={999} value={docLevel} onChange={e => setDocLevel(Number(e.target.value))} />
                </div>
                <div className={classes.check}>
                  <Checkbox id="doc-inheritable" checked={docInheritable} onCheckedChange={(v) => setDocInheritable(!!v)} />
                  <Label htmlFor="doc-inheritable">{t('documents.form.inheritable') || 'Inheritable'}</Label>
                </div>
                <div className={classes.check}>
                  <Checkbox id="doc-shared" checked={docIsShared} onCheckedChange={(v) => setDocIsShared(!!v)} />
                  <Label htmlFor="doc-shared">{t('documents.form.shared') || 'Shared asset'}</Label>
                </div>
              </div>
              <div className={classes.buttons}>
                <Button size="sm" disabled={uploadingDoc || !docFile || !docTitle} onClick={async () => {
                  try {
                    if (!docFile) return;
                    setUploadingDoc(true);
                    const form = new FormData();
                    form.append('title', docTitle);
                    if (docDesc) form.append('short_description', docDesc);
                    form.append('level', String(docLevel));
                    form.append('inheritable', String(docInheritable));
                    form.append('file', docFile);
                    const endpoint = docIsShared ? '/api/metadata/shared/documents' : `/api/entities/${entityType}/documents?entity_id=${encodeURIComponent(entityId)}`;
                    const resp = await fetch(endpoint, { method: 'POST', body: form });
                    if (!resp.ok) throw new Error(await resp.text());
                    setDocTitle(''); setDocDesc(''); setDocFile(null); setDocLevel(50); setDocInheritable(true); setDocIsShared(false); setUploadingDoc(false); setAddingDoc(false);
                    fetchMetadata();
                    if (docIsShared) sharedAssets.refresh();
                  } catch (e: any) { setUploadingDoc(false); toast({ title: t('documents.messages.uploadFailed'), description: e.message, variant: 'destructive' }); }
                }}>{t('documents.form.upload')}</Button>
                <Button size="sm" variant="outline" onClick={() => setAddingDoc(false)}>{t('documents.form.cancel')}</Button>
              </div>
            </div>
          )}
          {loading ? (
            <div className={classes.inlineLoading}><Loader2 className={classes.spin} /> {t('common:actions.loading')}</div>
          ) : documents.length === 0 ? (
            <div className={classes.empty}>{t('documents.noDocuments')}</div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead style={{ width: 64 }}>{t('documents.table.level') || 'Level'}</TableHead>
                  <TableHead>{t('documents.table.title')}</TableHead>
                  <TableHead>{t('documents.table.filename')}</TableHead>
                  <TableHead style={{ width: 80 }}>{t('documents.table.flags') || 'Flags'}</TableHead>
                  <TableHead>{t('documents.table.size')}</TableHead>
                  <TableHead>{t('documents.table.created')}</TableHead>
                  <TableHead style={{ width: 96 }}>{t('documents.table.actions')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {documents.map(d => (
                  <TableRow key={d.id}>
                    <TableCell className={classes.level}>{d.level ?? 50}</TableCell>
                    <TableCell className={classes.strong}>{d.title}</TableCell>
                    <TableCell className={cn(classes.cellMuted, classes.cellFile)}>{d.original_filename}</TableCell>
                    <TableCell>
                      <div className={classes.rowActions}>
                        {d.is_shared && <Badge variant="secondary" className={classes.flag}><Share2 size={12} aria-hidden />S</Badge>}
                        {d.inheritable && <Badge variant="outline" className={classes.flag}><ArrowDownToLine size={12} aria-hidden />I</Badge>}
                      </div>
                    </TableCell>
                    <TableCell className={classes.cellMuted}>{d.size_bytes ? `${(d.size_bytes/1024).toFixed(1)} KB` : '—'}</TableCell>
                    <TableCell className={classes.cellMuted}>{d.created_at ? <RelativeDate date={d.created_at} /> : '—'}</TableCell>
                    <TableCell>
                      <div className={classes.rowActions}>
                        <TooltipProvider>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button variant="ghost" size="icon" onClick={() => setPreviewDoc(d)}>
                                <Eye />
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent>{t('documents.preview')}</TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                        <Button variant="ghost" size="icon" className={classes.danger} onClick={async () => {
                          try { const resp = await fetch(`/api/documents/${d.id}`, { method: 'DELETE' }); if (!resp.ok) throw new Error(t('documents.messages.deleteFailed')); fetchMetadata(); }
                          catch (e: any) { toast({ title: t('documents.messages.deleteFailed'), description: e.message, variant: 'destructive' }); }
                        }}>
                          <Trash2 />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </section>

        <FilePreviewDialog
          open={!!previewDoc}
          onOpenChange={(open) => { if (!open) setPreviewDoc(null); }}
          source={previewDoc ? {
            title: previewDoc.title,
            contentType: previewDoc.content_type,
            storagePath: previewDoc.storage_path,
            originalFilename: previewDoc.original_filename,
          } : null}
          fetchUrl={previewDoc ? (async () => {
            try {
              const resp = await fetch(`/api/documents/${previewDoc.id}/content`);
              if (!resp.ok) return undefined;
              const blob = await resp.blob();
              return URL.createObjectURL(blob);
            } catch { return undefined; }
          }) : null}
        />

        {/* Note Preview */}
        <Dialog opened={!!previewNote} onClose={() => setPreviewNote(null)} size="lg" title={previewNote?.title}>
          {previewNote && (
            <div className={classes.stack}>
              {previewNote.short_description && <div className={classes.empty}>{previewNote.short_description}</div>}
              <MarkdownViewer markdown={previewNote.content_markdown} />
            </div>
          )}
        </Dialog>

        {/* Note Edit Dialog */}
        <Dialog opened={!!editingNote} onClose={() => setEditingNote(null)} size="lg" title={t('notes.editTitle')}>
            {editingNote && (
              <div className={classes.form}>
                <div>
                  <Label htmlFor="edit-note-title">{t('notes.form.title')}</Label>
                  <Input id="edit-note-title" value={editNoteTitle} onChange={(e) => setEditNoteTitle(e.target.value)} />
                </div>
                <div>
                  <Label htmlFor="edit-note-desc">{t('notes.form.shortDescription')}</Label>
                  <Input id="edit-note-desc" value={editNoteDesc} onChange={(e) => setEditNoteDesc(e.target.value)} />
                </div>
                <div>
                  <Label htmlFor="edit-note-content">{t('notes.form.content')}</Label>
                  <Textarea id="edit-note-content" rows={8} value={editNoteContent} onChange={(e) => setEditNoteContent(e.target.value)} />
                </div>
                <div className={classes.formRow} style={{ '--cols': 2 } as React.CSSProperties}>
                  <div>
                    <Label htmlFor="edit-note-level">{t('notes.form.level') || 'Level'}</Label>
                    <Input id="edit-note-level" type="number" min={0} max={999} value={editNoteLevel} onChange={(e) => setEditNoteLevel(Number(e.target.value))} />
                  </div>
                  <div className={classes.check}>
                    <Checkbox id="edit-note-inheritable" checked={editNoteInheritable} onCheckedChange={(v) => setEditNoteInheritable(!!v)} />
                    <Label htmlFor="edit-note-inheritable">{t('notes.form.inheritable') || 'Inheritable'}</Label>
                  </div>
                </div>
                <div className={classes.buttonsEnd}>
                  <Button variant="outline" onClick={() => setEditingNote(null)}>{t('notes.form.cancel')}</Button>
                  <Button
                    onClick={async () => {
                      try {
                        const payload = {
                          title: editNoteTitle || undefined,
                          short_description: editNoteDesc || undefined,
                          content_markdown: editNoteContent || undefined,
                          level: editNoteLevel,
                          inheritable: editNoteInheritable,
                        };
                        const resp = await fetch(`/api/rich-texts/${editingNote.id}`, {
                          method: 'PUT',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify(payload),
                        });
                        if (!resp.ok) throw new Error(await resp.text());
                        setEditingNote(null);
                        fetchMetadata();
                      } catch (e: any) {
                        toast({ title: t('notes.messages.updateFailed'), description: e.message, variant: 'destructive' });
                      }
                    }}
                    disabled={!editNoteTitle}
                  >{t('notes.form.save')}</Button>
                </div>
              </div>
            )}
        </Dialog>

        {/* Link Edit Dialog */}
        <Dialog opened={!!editingLink} onClose={() => setEditingLink(null)} title={t('links.editTitle')}>
            {editingLink && (
              <div className={classes.form}>
                <div>
                  <Label htmlFor="edit-link-title">{t('links.form.title')}</Label>
                  <Input id="edit-link-title" value={editLinkTitle} onChange={(e) => setEditLinkTitle(e.target.value)} />
                </div>
                <div>
                  <Label htmlFor="edit-link-url">{t('links.form.url')}</Label>
                  <Input id="edit-link-url" value={editLinkUrl} onChange={(e) => setEditLinkUrl(e.target.value)} />
                </div>
                <div>
                  <Label htmlFor="edit-link-desc">{t('links.form.shortDescription')}</Label>
                  <Input id="edit-link-desc" value={editLinkDesc} onChange={(e) => setEditLinkDesc(e.target.value)} />
                </div>
                <div className={classes.formRow} style={{ '--cols': 2 } as React.CSSProperties}>
                  <div>
                    <Label htmlFor="edit-link-level">{t('links.form.level') || 'Level'}</Label>
                    <Input id="edit-link-level" type="number" min={0} max={999} value={editLinkLevel} onChange={(e) => setEditLinkLevel(Number(e.target.value))} />
                  </div>
                  <div className={classes.check}>
                    <Checkbox id="edit-link-inheritable" checked={editLinkInheritable} onCheckedChange={(v) => setEditLinkInheritable(!!v)} />
                    <Label htmlFor="edit-link-inheritable">{t('links.form.inheritable') || 'Inheritable'}</Label>
                  </div>
                </div>
                <div className={classes.buttonsEnd}>
                  <Button variant="outline" onClick={() => setEditingLink(null)}>{t('links.form.cancel')}</Button>
                  <Button
                    onClick={async () => {
                      try {
                        const payload = {
                          title: editLinkTitle || undefined,
                          url: editLinkUrl || undefined,
                          short_description: editLinkDesc || undefined,
                          level: editLinkLevel,
                          inheritable: editLinkInheritable,
                        };
                        const resp = await fetch(`/api/links/${editingLink.id}`, {
                          method: 'PUT',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify(payload),
                        });
                        if (!resp.ok) throw new Error(await resp.text());
                        setEditingLink(null);
                        fetchMetadata();
                      } catch (e: any) {
                        toast({ title: t('links.messages.updateFailed'), description: e.message, variant: 'destructive' });
                      }
                    }}
                    disabled={!editLinkTitle || !editLinkUrl}
                  >{t('links.form.save')}</Button>
                </div>
              </div>
            )}
        </Dialog>

        {/* Shared Asset Picker Dialog */}
        <Dialog
          opened={!!showSharedPicker}
          onClose={() => setShowSharedPicker(null)}
          size="lg"
          title={
            <>
              {showSharedPicker === 'rich_text' && (t('notes.selectShared') || 'Select Shared Note')}
              {showSharedPicker === 'link' && (t('links.selectShared') || 'Select Shared Link')}
              {showSharedPicker === 'document' && (t('documents.selectShared') || 'Select Shared Document')}
            </>
          }
          description={t('sharedAssets.selectDescription') || 'Select a shared asset to attach to this entity'}
        >
            <div className={classes.pickerScroll}>
              {sharedAssets.loading ? (
                <div className={classes.inlineLoading}><Loader2 className={classes.spin} /> {t('sharedAssets.loading')}</div>
              ) : (
                <>
                  {showSharedPicker === 'rich_text' && (
                    sharedAssets.richTexts.length === 0 ? (
                      <div className={classes.empty}>{t('sharedAssets.noSharedNotes') || 'No shared notes available'}</div>
                    ) : (
                      <div className={classes.stack}>
                        {sharedAssets.richTexts.map(rt => (
                          <div key={rt.id} className={cn(classes.row, classes.pickRow)}>
                            <div>
                              <div className={classes.strong}>{rt.title}</div>
                              <div className={classes.meta}>{truncate(rt.short_description, 60)}</div>
                              <div className={classes.meta}>{t('sharedAssets.levelInfo', { level: rt.level ?? 50 })} • {rt.inheritable ? t('sharedAssets.inheritable') : t('sharedAssets.notInheritable')}</div>
                            </div>
                            <Button size="sm" onClick={() => handleAttachSharedAsset('rich_text', rt.id)}>
                              <Plus /> {t('sharedAssets.attach')}
                            </Button>
                          </div>
                        ))}
                      </div>
                    )
                  )}
                  {showSharedPicker === 'link' && (
                    sharedAssets.links.length === 0 ? (
                      <div className={classes.empty}>{t('sharedAssets.noSharedLinks') || 'No shared links available'}</div>
                    ) : (
                      <div className={classes.stack}>
                        {sharedAssets.links.map(link => (
                          <div key={link.id} className={cn(classes.row, classes.pickRow)}>
                            <div>
                              <div className={classes.strong}>{link.title}</div>
                              <div className={classes.metaLink}>{link.url}</div>
                              <div className={classes.meta}>{t('sharedAssets.levelInfo', { level: link.level ?? 50 })} • {link.inheritable ? t('sharedAssets.inheritable') : t('sharedAssets.notInheritable')}</div>
                            </div>
                            <Button size="sm" onClick={() => handleAttachSharedAsset('link', link.id)}>
                              <Plus /> {t('sharedAssets.attach')}
                            </Button>
                          </div>
                        ))}
                      </div>
                    )
                  )}
                  {showSharedPicker === 'document' && (
                    sharedAssets.documents.length === 0 ? (
                      <div className={classes.empty}>{t('sharedAssets.noSharedDocuments') || 'No shared documents available'}</div>
                    ) : (
                      <div className={classes.stack}>
                        {sharedAssets.documents.map(doc => (
                          <div key={doc.id} className={cn(classes.row, classes.pickRow)}>
                            <div>
                              <div className={classes.strong}>{doc.title}</div>
                              <div className={classes.meta}>{doc.original_filename}</div>
                              <div className={classes.meta}>{t('sharedAssets.levelInfo', { level: doc.level ?? 50 })} • {doc.inheritable ? t('sharedAssets.inheritable') : t('sharedAssets.notInheritable')}</div>
                            </div>
                            <Button size="sm" onClick={() => handleAttachSharedAsset('document', doc.id)}>
                              <Plus /> {t('sharedAssets.attach')}
                            </Button>
                          </div>
                        ))}
                      </div>
                    )
                  )}
                </>
              )}
            </div>
        </Dialog>
      </div>
    </section>
    <EntityInfoDialog
      entityType={entityType}
      entityId={entityId}
      title={undefined}
      open={showPreview}
      onOpenChange={setShowPreview}
    />
  </>
  );
};

export default EntityMetadataPanel;


