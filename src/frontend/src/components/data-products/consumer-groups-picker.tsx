import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Loader, TextInput, UnstyledButton } from '@mantine/core';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { X } from 'lucide-react';
import { ConsumerPrincipal } from '@/types/data-product';
import classes from './consumer-groups-picker.module.css';

// Multi-select picker backed by /api/workspace/groups, surfacing workspace
// group display names and packaging each selection as a typed
// `{type: "group", value: <name>}` ConsumerPrincipal. Today the picker only
// collects groups; the typed shape leaves room to add other principal types
// (service principals, IdP roles, OAuth scopes) in the same widget later
// without a wire-format break.
//
// Accepts free-text additions for groups the SDK can't enumerate (e.g. cross-
// account groups synced from external IdPs) — falls back gracefully when the
// endpoint returns nothing.

interface WorkspaceGroup {
  id: string | null;
  display_name: string;
}

interface Props {
  value: ConsumerPrincipal[];
  onChange: (next: ConsumerPrincipal[]) => void;
}

export function ConsumerGroupsPicker({ value, onChange }: Props) {
  const { t } = useTranslation(['data-products', 'common']);
  const [available, setAvailable] = useState<WorkspaceGroup[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const debounceRef = useRef<number | null>(null);
  // Only the latest search may set the list: an earlier one that answers late is dropped
  const requestId = useRef(0);

  const fetchGroups = (q: string) => {
    const id = ++requestId.current;
    setLoading(true);
    setError(null);
    const url = q
      ? `/api/workspace/groups?search=${encodeURIComponent(q)}&limit=50`
      : `/api/workspace/groups?limit=50`;
    fetch(url)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((data: WorkspaceGroup[]) => {
        if (id === requestId.current) setAvailable(Array.isArray(data) ? data : []);
      })
      .catch((e) => {
        if (id === requestId.current) setError(e.message || 'Failed to load groups');
      })
      .finally(() => {
        if (id === requestId.current) setLoading(false);
      });
  };

  // Initial load
  useEffect(() => {
    fetchGroups('');
  }, []);

  // Debounced search
  useEffect(() => {
    if (debounceRef.current) window.clearTimeout(debounceRef.current);
    debounceRef.current = window.setTimeout(() => fetchGroups(search), 250);
    return () => {
      if (debounceRef.current) window.clearTimeout(debounceRef.current);
    };
  }, [search]);

  // Selected-set keyed on the {type:"group"} pair so we don't double-add a
  // group that's already selected, while leaving room for other principal
  // types in the future.
  const selectedGroupNames = useMemo(
    () => new Set(value.filter((p) => p.type === 'group').map((p) => p.value)),
    [value],
  );
  const candidates = available.filter((g) => !selectedGroupNames.has(g.display_name));

  const addGroup = (name: string) => {
    const trimmed = name.trim();
    if (!trimmed || selectedGroupNames.has(trimmed)) return;
    onChange([...value, { type: 'group', value: trimmed }]);
  };

  const removeGroup = (name: string) => {
    // Match on value AND type — leaves non-group principals untouched.
    onChange(value.filter((p) => !(p.type === 'group' && p.value === name)));
  };

  return (
    <div className={classes.picker}>
      {/* Selected chips */}
      {value.length > 0 && (
        <div className={classes.chips}>
          {value.map((p) => (
            <Badge key={`${p.type}:${p.value}`} variant="secondary" className={classes.chip}>
              {p.value}
              <UnstyledButton
                aria-label={t('data-products:consumerGroups.removeAriaLabel', { name: p.value })}
                className={classes.remove}
                onClick={() => removeGroup(p.value)}
              >
                <X aria-hidden />
              </UnstyledButton>
            </Badge>
          ))}
        </div>
      )}

      {/* Search + free-text add */}
      <div className={classes.search}>
        <TextInput
          placeholder={t('data-products:consumerGroups.searchPlaceholder')}
          value={search}
          onChange={(e) => setSearch(e.currentTarget.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && search.trim()) {
              e.preventDefault();
              addGroup(search.trim());
              setSearch('');
            }
          }}
          className={classes.searchField}
        />
        {loading && <Loader size={14} />}
        {search.trim() && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => {
              addGroup(search.trim());
              setSearch('');
            }}
          >
            {t('common:actions.add')}
          </Button>
        )}
      </div>

      {/* Suggestions list */}
      {candidates.length > 0 && (
        <div className={classes.suggestions}>
          {candidates.slice(0, 20).map((g) => (
            <UnstyledButton
              key={`${g.id ?? ''}-${g.display_name}`}
              className={classes.suggestion}
              onClick={() => addGroup(g.display_name)}
            >
              {g.display_name}
            </UnstyledButton>
          ))}
        </div>
      )}

      {error && (
        <p className={classes.error}>
          {t('data-products:consumerGroups.loadError', { error })}
        </p>
      )}
    </div>
  );
}
