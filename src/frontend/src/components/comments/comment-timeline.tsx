import React, { useState, useEffect, useCallback, useRef } from 'react';
import { MessageSquare, Plus, Trash2, Edit, Send, Users, Filter, Clock, FileText, FolderOpen } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { ActionIcon, Avatar } from '@mantine/core';
import { cn } from '@/lib/utils';
import { useApi } from '@/hooks/use-api';
import { useToast } from '@/hooks/use-toast';
import { useProjectContext } from '@/stores/project-store';
import {
  Comment,
  CommentCreate,
  CommentUpdate,
  AudienceTeam,
  AudienceRole,
} from '@/types/comments';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { RelativeDate } from '@/components/common/relative-date';
import classes from './comments.module.css';
import { ScrollArea } from '@/components/ui/scroll-area';

interface CommentFormData {
  title: string;
  comment: string;
  selectedTeams: string[];
  selectedRoles: string[];
}

interface TimelineEntry {
  id: string;
  type: 'comment' | 'change';
  entity_type: string;
  entity_id: string;
  title?: string;
  content: string;
  username: string;
  timestamp: string;
  updated_at?: string;
  audience?: string[];
  status?: string;
  metadata?: {
    updated_by?: string;
    action?: string;
  };
}

interface TimelineResponse {
  timeline: TimelineEntry[];
  total_count: number;
  filter_type: string;
}

export interface CommentTimelineProps {
  entityType: string;
  entityId: string;
  className?: string;
  onCountChange?: (count: number) => void;
  showHeader?: boolean;
  showFilters?: boolean;
}

/**
 * CommentTimeline - Reusable component for displaying and managing comments and changes
 * Can be used both in a sidebar Sheet or embedded in a page
 */
export const CommentTimeline: React.FC<CommentTimelineProps> = ({
  entityType,
  entityId,
  className,
  onCountChange,
  showHeader = true,
  showFilters = true,
}) => {
  const { t } = useTranslation(['comments', 'common']);
  const { get, post, put, delete: deleteApi, loading } = useApi();
  const { toast } = useToast();
  const { currentProject } = useProjectContext();

  const [timeline, setTimeline] = useState<TimelineEntry[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [filterType, setFilterType] = useState<'all' | 'comments' | 'changes'>('all');
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingComment, setEditingComment] = useState<Comment | null>(null);
  const [formData, setFormData] = useState<CommentFormData>({
    title: '',
    comment: '',
    selectedTeams: [],
    selectedRoles: [],
  });

  const scrollAreaRef = useRef<HTMLDivElement>(null);
  const [availableTeams, setAvailableTeams] = useState<AudienceTeam[]>([]);
  const [availableRoles, setAvailableRoles] = useState<AudienceRole[]>([]);

  // Fetch teams for current project
  const fetchTeams = useCallback(async () => {
    if (!currentProject?.id) {
      setAvailableTeams([]);
      return;
    }

    const response = await get<AudienceTeam[]>(`/api/projects/${currentProject.id}/teams`);

    if (response.error) {
      setAvailableTeams([]);
    } else if (response.data) {
      setAvailableTeams(response.data);
    } else {
      setAvailableTeams([]);
    }
  }, [currentProject?.id, get]);

  // Fetch available app roles
  const fetchRoles = useCallback(async () => {
    const response = await get<AudienceRole[]>('/api/settings/roles/summary');

    if (response.error) {
      setAvailableRoles([]);
    } else if (response.data) {
      setAvailableRoles(response.data);
    } else {
      setAvailableRoles([]);
    }
  }, [get]);

  const fetchTimeline = useCallback(async () => {
    if (!entityType || !entityId) {
      return;
    }

    const projectParam = currentProject?.id ? `&project_id=${currentProject.id}` : '';
    const response = await get<TimelineResponse>(
      `/api/entities/${entityType}/${entityId}/timeline?filter_type=${filterType}${projectParam}`
    );

    if (response.error) {
      toast({
        title: t('common:toast.error'),
        description: t('comments:timeline.loadError', { error: response.error }),
        variant: 'destructive',
      });
      return;
    }

    const newTimeline = response.data?.timeline || [];
    const newCount = response.data?.total_count || 0;

    setTimeline(newTimeline);
    setTotalCount(newCount);

    // Notify parent of count change
    if (onCountChange) {
      onCountChange(newCount);
    }
  }, [entityType, entityId, filterType, currentProject?.id, get, toast, onCountChange, t]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!formData.comment.trim()) {
      toast({
        title: t('common:toast.error'),
        description: t('comments:validation.commentRequired'),
        variant: 'destructive',
      });
      return;
    }

    const audienceTokens: string[] = [
      ...formData.selectedTeams.map(teamId => `team:${teamId}`),
      ...formData.selectedRoles.map(roleName => `role:${roleName}`),
    ];

    const commentData: CommentCreate | CommentUpdate = {
      title: formData.title || null,
      comment: formData.comment,
      audience: audienceTokens.length > 0 ? audienceTokens : null,
    };

    if (editingComment) {
      const response = await put<Comment>(
        `/api/comments/${editingComment.id}`,
        commentData
      );

      if (response.error) {
        toast({
          title: t('common:toast.error'),
          description: t('comments:toast.updateError', { error: response.error }),
          variant: 'destructive',
        });
        return;
      }

      toast({
        title: t('common:toast.success'),
        description: t('comments:toast.updateSuccess'),
      });
    } else {
      const createData: CommentCreate = {
        entity_id: entityId,
        entity_type: entityType,
        title: formData.title || null,
        comment: formData.comment,
        audience: audienceTokens.length > 0 ? audienceTokens : null,
        project_id: currentProject?.id || null,
      };

      const response = await post<Comment>(
        `/api/entities/${entityType}/${entityId}/comments`,
        createData
      );

      if (response.error) {
        toast({
          title: t('common:toast.error'),
          description: t('comments:toast.createError', { error: response.error }),
          variant: 'destructive',
        });
        return;
      }

      toast({
        title: t('common:toast.success'),
        description: t('comments:toast.createSuccess'),
      });
    }

    setFormData({ title: '', comment: '', selectedTeams: [], selectedRoles: [] });
    setEditingComment(null);
    setIsFormOpen(false);
    await fetchTimeline();
  };

  const handleDelete = async (commentId: string) => {
    if (!confirm(t('comments:confirmDelete'))) {
      return;
    }

    const response = await deleteApi(`/api/comments/${commentId}`);

    if (response.error) {
      toast({
        title: t('common:toast.error'),
        description: t('comments:toast.deleteError', { error: response.error }),
        variant: 'destructive',
      });
      return;
    }

    toast({
      title: t('common:toast.success'),
      description: t('comments:toast.deleteSuccess'),
    });

    await fetchTimeline();
  };

  const handleEdit = (comment: Comment) => {
    setEditingComment(comment);

    const teams: string[] = [];
    const roles: string[] = [];

    if (comment.audience) {
      comment.audience.forEach(token => {
        if (token.startsWith('team:')) {
          teams.push(token.substring(5));
        } else if (token.startsWith('role:')) {
          roles.push(token.substring(5));
        }
      });
    }

    setFormData({
      title: comment.title || '',
      comment: comment.comment,
      selectedTeams: teams,
      selectedRoles: roles,
    });
    setIsFormOpen(true);
  };

  const resetForm = () => {
    setFormData({ title: '', comment: '', selectedTeams: [], selectedRoles: [] });
    setEditingComment(null);
    setIsFormOpen(false);
  };

  useEffect(() => {
    fetchTeams();
    fetchRoles();
    fetchTimeline();
  }, [fetchTeams, fetchRoles, fetchTimeline]);

  useEffect(() => {
    if (isFormOpen && scrollAreaRef.current) {
      const viewport = scrollAreaRef.current.querySelector('[data-radix-scroll-area-viewport]');
      if (viewport) {
        viewport.scrollTo({ top: 0, behavior: 'smooth' });
      }
    }
  }, [isFormOpen]);

  const CommentForm = React.useMemo(() => (
    <form onSubmit={handleSubmit} className={classes.form}>
      <div className={classes.field}>
        <Label htmlFor="title">{t('comments:form.titleLabel')}</Label>
        <Input
          id="title"
          value={formData.title}
          onChange={(e) => setFormData({ ...formData, title: e.target.value })}
          placeholder={t('comments:form.titlePlaceholder')}
        />
      </div>

      <div className={classes.field}>
        <Label htmlFor="comment">{t('comments:form.commentLabel')}</Label>
        <Textarea
          id="comment"
          value={formData.comment}
          onChange={(e) => setFormData({ ...formData, comment: e.target.value })}
          placeholder={t('comments:form.commentPlaceholder')}
          rows={3}
          required
        />
      </div>

      <div className={classes.audience}>
        <div className={classes.help}>
          {t('comments:form.audienceHelp')}
        </div>

        <div className={classes.field}>
          <Label htmlFor="teams">{t('comments:form.teamsLabel')}</Label>
          <div className={classes.checks}>
            {availableTeams.map(team => (
              <div key={team.id} className={classes.check}>
                <input
                  type="checkbox"
                  id={`team-${team.id}`}
                  checked={formData.selectedTeams.includes(team.id)}
                  onChange={(e) => {
                    if (e.target.checked) {
                      setFormData({
                        ...formData,
                        selectedTeams: [...formData.selectedTeams, team.id]
                      });
                    } else {
                      setFormData({
                        ...formData,
                        selectedTeams: formData.selectedTeams.filter(id => id !== team.id)
                      });
                    }
                  }}
                />
                <Label htmlFor={`team-${team.id}`}>
                  {team.name}
                </Label>
              </div>
            ))}
            {availableTeams.length === 0 && (
              <div className={classes.hint}>{t('comments:form.noTeams')}</div>
            )}
          </div>
        </div>

        <div className={classes.field}>
          <Label htmlFor="roles">{t('comments:form.appRolesLabel')}</Label>
          <div className={classes.checks}>
            {availableRoles.map(role => (
              <div key={role.name} className={classes.check}>
                <input
                  type="checkbox"
                  id={`role-${role.name}`}
                  checked={formData.selectedRoles.includes(role.name)}
                  onChange={(e) => {
                    if (e.target.checked) {
                      setFormData({
                        ...formData,
                        selectedRoles: [...formData.selectedRoles, role.name]
                      });
                    } else {
                      setFormData({
                        ...formData,
                        selectedRoles: formData.selectedRoles.filter(name => name !== role.name)
                      });
                    }
                  }}
                />
                <Label htmlFor={`role-${role.name}`}>
                  {role.name}
                </Label>
              </div>
            ))}
          </div>
        </div>

        {(formData.selectedTeams.length > 0 || formData.selectedRoles.length > 0) && (
          <div className={classes.chips}>
            {formData.selectedTeams.map(teamId => {
              const team = availableTeams.find(t => t.id === teamId);
              return team ? (
                <Badge key={`team-${teamId}`} variant="secondary" className={classes.chip}>
                  <Users size={12} aria-hidden />
                  {t('comments:badge.team', { name: team.name })}
                </Badge>
              ) : null;
            })}
            {formData.selectedRoles.map(roleName => (
              <Badge key={`role-${roleName}`} variant="outline" className={classes.chip}>
                {t('comments:badge.role', { name: roleName })}
              </Badge>
            ))}
          </div>
        )}
      </div>

      <div className={classes.buttons}>
        <Button type="submit" size="sm" disabled={loading}>
          <Send />
          {editingComment ? t('common:actions.update') : t('comments:form.post')}
        </Button>
        {(editingComment || formData.title || formData.comment) && (
          <Button type="button" variant="outline" size="sm" onClick={resetForm}>
            {t('common:actions.cancel')}
          </Button>
        )}
      </div>
    </form>
  ), [formData, editingComment, loading, availableTeams, availableRoles, handleSubmit, resetForm, t]);

  const TimelineItem: React.FC<{ entry: TimelineEntry; canModify: boolean }> = ({
    entry,
    canModify
  }) => {
    const parsed = React.useMemo(() => {
      if (entry.type !== 'change') return null;
      try {
        const trimmed = (entry.content || '').trim();
        if (!trimmed || (trimmed[0] !== '{' && trimmed[0] !== '[')) return null;
        return JSON.parse(trimmed);
      } catch {
        return null;
      }
    }, [entry]);

    const renderParsedObject = (obj: any) => {
      const action = entry.metadata?.action || '';
      if (action.startsWith('access_request_')) {
        return (
          <div className={classes.details}>
            {obj.requester_email && (
              <div><span className={classes.key}>{t('comments:change.requesterLabel')}</span> {obj.requester_email}</div>
            )}
            {obj.decision && (
              <div className={classes.detailRow}>
                <span className={classes.key}>{t('comments:change.decisionLabel')}</span>
                <Badge variant={obj.decision === 'approve' ? 'secondary' : obj.decision === 'deny' ? 'destructive' : 'outline'}>
                  {String(obj.decision)}
                </Badge>
              </div>
            )}
            {obj.message && (
              <div><span className={classes.key}>{t('comments:change.messageLabel')}</span> {String(obj.message)}</div>
            )}
          </div>
        );
      }

      if (action.startsWith('SEMANTIC_LINK_')) {
        const operation = action === 'SEMANTIC_LINK_ADD'
          ? t('comments:change.operationLinked')
          : action === 'SEMANTIC_LINK_REMOVE'
          ? t('comments:change.operationUnlinked')
          : action.toLowerCase();
        const iri = typeof obj?.iri === 'string' ? obj.iri : undefined;
        const linkId = typeof obj?.link_id === 'string' ? obj.link_id : undefined;
        return (
          <div className={classes.details}>
            {iri && (
              <div><span className={classes.key}>{t('comments:change.iriLabel')}</span> {iri}</div>
            )}
            {linkId && (
              <div><span className={classes.key}>{t('comments:change.linkIdLabel')}</span> {linkId}</div>
            )}
            <div><span className={classes.key}>{t('comments:change.operationLabel')}</span> {operation}</div>
          </div>
        );
      }

      return (
        <div className={classes.details}>
          {Object.entries(obj).map(([k, v]) => (
            <div key={k} className={classes.detailRow}>
              <span className={cn(classes.key, classes.capitalize)}>{k.replace(/_/g, ' ')}:</span>
              <span>{typeof v === 'string' ? v : JSON.stringify(v)}</span>
            </div>
          ))}
        </div>
      );
    };

    return (
      <li className={cn(classes.entry, entry.type === 'change' && classes.change)}>
        <div className={classes.entryHead}>
          {entry.type === 'comment' ? <MessageSquare aria-hidden /> : <Clock aria-hidden />}
          {entry.title && (
            <h4 className={classes.entryTitle}>{entry.title}</h4>
          )}
          <Badge variant={entry.type === 'change' ? 'secondary' : 'outline'}>
            {entry.type}
          </Badge>
        </div>

        {parsed ? (
          renderParsedObject(parsed)
        ) : (
          <p className={classes.content}>
            {entry.content}
          </p>
        )}

        {entry.audience && entry.audience.length > 0 && (
          <div className={classes.chips}>
            {entry.audience.map((token, idx) => {
              if (token.startsWith('team:')) {
                const teamId = token.substring(5);
                const team = availableTeams.find(t => t.id === teamId);
                return (
                  <Badge key={`${token}-${idx}`} variant="secondary" className={classes.chip}>
                    <Users size={12} aria-hidden />
                    {t('comments:badge.team', { name: team?.name || teamId })}
                  </Badge>
                );
              } else if (token.startsWith('role:')) {
                const roleName = token.substring(5);
                return (
                  <Badge key={`${token}-${idx}`} variant="outline" className={classes.chip}>
                    {t('comments:badge.role', { name: roleName })}
                  </Badge>
                );
              } else {
                return (
                  <Badge key={`${token}-${idx}`} variant="outline" className={classes.chip}>
                    <Users size={12} aria-hidden />
                    {token}
                  </Badge>
                );
              }
            })}
          </div>
        )}

        <div className={classes.entryFoot}>
          <div className={classes.byline}>
            <Avatar size={20} radius="xl" classNames={{ placeholder: classes.avatarInitial }}>
              {entry.username.charAt(0).toUpperCase()}
            </Avatar>
            <span>{entry.username}</span>
            <RelativeDate date={new Date(entry.timestamp)} />
            {entry.updated_at && (
              <span className={classes.edited}>{t('comments:timeline.edited')}</span>
            )}
          </div>

          {canModify && entry.type === 'comment' && (
            <div className={classes.entryActions}>
              <ActionIcon variant="subtle" color="gray" size={24} onClick={() => handleEdit(entry as any)}>
                <Edit size={12} />
              </ActionIcon>
              <ActionIcon
                variant="subtle"
                color="gray"
                size={24}
                className={classes.delete}
                onClick={() => handleDelete(entry.id)}
              >
                <Trash2 size={12} />
              </ActionIcon>
            </div>
          )}
        </div>
      </li>
    );
  };

  return (
    <div className={cn(classes.inline, className)}>
      {showHeader && (
        <div className={classes.inlineHeader}>
          <div className={classes.heading}>
            <MessageSquare aria-hidden />
            <h3 className={classes.inlineTitle}>{t('comments:timeline.heading')}</h3>
            {totalCount > 0 && (
              <Badge variant="secondary">
                {totalCount}
              </Badge>
            )}
          </div>
          {currentProject && (
            <div className={classes.project}>
              <FolderOpen aria-hidden />
              <span>{t('comments:project.label', { name: currentProject.name })}</span>
            </div>
          )}
        </div>
      )}

      {showFilters && (
        <div className={classes.inlineFilter}>
          <div className={classes.filterLabel}>
            <Filter aria-hidden />
            <span>{t('comments:filter.label')}</span>
          </div>
          <div className={classes.filterButtons}>
            <Button
              variant={filterType === 'all' ? 'default' : 'outline'}
              size="sm"
              onClick={() => setFilterType('all')}
            >
              <FileText />
              {t('common:states.all')}
            </Button>
            <Button
              variant={filterType === 'comments' ? 'default' : 'outline'}
              size="sm"
              onClick={() => setFilterType('comments')}
            >
              <MessageSquare />
              {t('comments:filter.comments')}
            </Button>
            <Button
              variant={filterType === 'changes' ? 'default' : 'outline'}
              size="sm"
              onClick={() => setFilterType('changes')}
            >
              <Clock />
              {t('comments:filter.changes')}
            </Button>
          </div>
        </div>
      )}

      <div className={classes.main}>
        <div className={classes.inlineAdd}>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setIsFormOpen(!isFormOpen)}
          >
            <Plus />
            {t('comments:actions.addComment')}
          </Button>
        </div>

        <div className={classes.rule} role="presentation" />

        <ScrollArea className={classes.scroll} ref={scrollAreaRef}>
          {isFormOpen && CommentForm}

          {timeline.length > 0 ? (
            <ul className={classes.thread} aria-label={t('comments:timeline.heading')}>
              {timeline.map(entry => (
                <TimelineItem
                  key={entry.id}
                  entry={entry}
                  canModify={true}
                />
              ))}
            </ul>
          ) : (
            <div className={classes.empty}>
              {filterType === 'comments' ? (
                <>
                  <MessageSquare aria-hidden />
                  <p>{t('comments:empty.commentsTitle')}</p>
                  <p className={classes.emptyHint}>{t('comments:empty.commentsSubtitle')}</p>
                </>
              ) : filterType === 'changes' ? (
                <>
                  <Clock aria-hidden />
                  <p>{t('comments:empty.changesTitle')}</p>
                  <p className={classes.emptyHint}>{t('comments:empty.changesSubtitle')}</p>
                </>
              ) : (
                <>
                  <FileText aria-hidden />
                  <p>{t('comments:empty.allTitle')}</p>
                  <p className={classes.emptyHint}>{t('comments:empty.allSubtitle')}</p>
                </>
              )}
            </div>
          )}
        </ScrollArea>
      </div>
    </div>
  );
};

export default CommentTimeline;
