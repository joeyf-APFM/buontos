import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent, type MouseEvent } from 'react';
import { Button, Skeleton, Tree, useTree, type RenderTreeNodePayload, type TreeNodeData } from '@mantine/core';
import { useTranslation } from 'react-i18next';
import { Box, ChevronDown, ChevronRight, Database, Folder, Globe, Inbox, Layers, Server, type LucideIcon } from 'lucide-react';
import { fetchTreeChildren, type TreeNode } from './api';
import classes from './explorer.module.css';

export type SectionId = 'data' | 'analytics' | 'integration' | 'system' | 'custom';

/** Each section's top level comes from this parent ('' is the tree's root: the branches). */
const SECTIONS: { id: SectionId; parent: string }[] = [
  { id: 'data', parent: '' },
  { id: 'analytics', parent: 'category:analytics' },
  { id: 'integration', parent: 'category:integration' },
  { id: 'system', parent: 'category:system' },
  { id: 'custom', parent: 'category:custom' },
];

export interface TreeSelection {
  node: TreeNode;
  /** From the section's top level down to the node's parent. */
  ancestors: TreeNode[];
  section: SectionId;
}

interface AssetTreeProps {
  selectedKey: string | null;
  onSelect: (selection: TreeSelection) => void;
  /** Selected and expanded once the branches load, while nothing is selected. */
  initialKey?: string;
  /** Changing it reloads the levels holding the selected node, so its counts refresh. */
  refreshToken?: number;
}

/** Loaded children by parent key; a parent missing here hasn't been loaded. */
type ChildrenMap = Record<string, TreeNode[]>;

const BRANCH_ICONS: Record<string, LucideIcon> = {
  'branch:uc': Database,
  'branch:internal': Server,
  'branch:external': Globe,
};

const iconFor = (node: TreeNode): LucideIcon =>
  node.kind === 'branch' ? BRANCH_ICONS[node.key] ?? Inbox : node.kind === 'asset' ? Folder : node.kind === 'group' ? Layers : Box;

/** Stands in for children that are still loading (or failed to). */
const placeholderValue = (parent: string) => `${parent}\u0000loading`;

function toTreeData(nodes: TreeNode[], children: ChildrenMap): TreeNodeData[] {
  return nodes.map((node) => ({
    value: node.key,
    label: node.label,
    nodeProps: { node },
    children: !node.hasChildren
      ? undefined
      : children[node.key]
        ? toTreeData(children[node.key], children)
        : [{ value: placeholderValue(node.key), label: '', nodeProps: { placeholderFor: node.key } }],
  }));
}

/** The path from a section's top level to `key`, or null when it isn't loaded there. */
function pathTo(key: string, nodes: TreeNode[], children: ChildrenMap): TreeNode[] | null {
  for (const node of nodes) {
    if (node.key === key) return [node];
    const below = children[node.key] && pathTo(key, children[node.key], children);
    if (below) return [node, ...below];
  }
  return null;
}

/**
 * The asset tree: Data Assets (the branches) and the four type categories.
 * Each level loads on first expand and stays cached.
 */
export function AssetTree({ selectedKey, onSelect, initialKey = 'branch:uc', refreshToken = 0 }: AssetTreeProps) {
  const { t } = useTranslation('asset-explorer');
  const [children, setChildren] = useState<ChildrenMap>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const inFlight = useRef(new Set<string>());
  const loaded = useRef(new Set<string>());

  /** Fetches a level (again, if it was loaded) unless it is already loading. */
  const load = useCallback((parent: string) => {
    if (inFlight.current.has(parent)) return;
    inFlight.current.add(parent);
    setErrors(({ [parent]: _, ...rest }) => rest);
    fetchTreeChildren(parent || undefined)
      .then((nodes) => {
        loaded.current.add(parent);
        setChildren((c) => ({ ...c, [parent]: nodes }));
      })
      .catch((e: Error) => setErrors((errs) => ({ ...errs, [parent]: e.message })))
      .finally(() => inFlight.current.delete(parent));
  }, []);

  /** Loads a level the first time it is needed. */
  const ensure = useCallback(
    (parent: string) => {
      if (!loaded.current.has(parent)) load(parent);
    },
    [load],
  );

  useEffect(() => {
    SECTIONS.forEach((s) => ensure(s.parent));
  }, [ensure]);

  const select = useCallback(
    (key: string, section: SectionId) => {
      const top = children[SECTIONS.find((s) => s.id === section)!.parent] ?? [];
      const path = pathTo(key, top, children);
      if (path) onSelect({ node: path[path.length - 1], ancestors: path.slice(0, -1), section });
    },
    [children, onSelect],
  );

  // Select the initial node once the branches are in
  const roots = children[''];
  const didSelectInitial = useRef(false);
  useEffect(() => {
    if (didSelectInitial.current || !roots || selectedKey) return;
    didSelectInitial.current = true;
    if (roots.some((n) => n.key === initialKey)) select(initialKey, 'data');
  }, [roots, selectedKey, initialKey, select]);

  // After a save: reload every level on the way to the selected node
  const lastRefresh = useRef(refreshToken);
  useEffect(() => {
    if (refreshToken === lastRefresh.current) return;
    lastRefresh.current = refreshToken;
    for (const s of SECTIONS) {
      const path = selectedKey && pathTo(selectedKey, children[s.parent] ?? [], children);
      if (!path) continue;
      [s.parent, ...path.map((n) => n.key)].filter((k) => k in children).forEach(load);
    }
  }, [refreshToken, selectedKey, children, load]);

  return (
    <nav className={classes.tree} aria-label={t('tree.label')}>
      {SECTIONS.map((s) => (
        <TreeSection
          key={s.id}
          section={s.id}
          title={t(`tree.sections.${s.id}`)}
          top={children[s.parent]}
          topError={errors[s.parent]}
          onRetryTop={() => load(s.parent)}
          loaded={children}
          errors={errors}
          ensure={ensure}
          retry={load}
          selectedKey={selectedKey}
          initialExpanded={s.id === 'data' ? initialKey : undefined}
          onSelect={(key) => select(key, s.id)}
        />
      ))}
    </nav>
  );
}

interface TreeSectionProps {
  section: SectionId;
  title: string;
  top: TreeNode[] | undefined;
  topError: string | undefined;
  onRetryTop: () => void;
  loaded: ChildrenMap;
  errors: Record<string, string>;
  ensure: (parent: string) => void;
  retry: (parent: string) => void;
  selectedKey: string | null;
  initialExpanded?: string;
  onSelect: (key: string) => void;
}

function TreeSection({
  section, title, top, topError, onRetryTop, loaded, errors, ensure, retry, selectedKey, initialExpanded, onSelect,
}: TreeSectionProps) {
  const { t } = useTranslation('asset-explorer');
  const tree = useTree({ initialExpandedState: initialExpanded ? { [initialExpanded]: true } : {} });
  const data = useMemo(() => toTreeData(top ?? [], loaded), [top, loaded]);

  // Expanding a node loads its children (cached after the first time)
  const { expandedState, select, clearSelected, selectedState } = tree;
  useEffect(() => {
    Object.entries(expandedState).forEach(([key, open]) => open && ensure(key));
  }, [expandedState, ensure]);

  // Mirror the page's selection, so only one section shows a selected row
  const inThisSection = !!selectedKey && !!top && !!pathTo(selectedKey, top, loaded);
  useEffect(() => {
    if (inThisSection && selectedState[0] !== selectedKey) select(selectedKey!);
    if (!inThisSection && selectedState.length) clearSelected();
  }, [inThisSection, selectedKey, selectedState, select, clearSelected]);

  const onKeyDown = (event: KeyboardEvent<HTMLUListElement>) => {
    const value = (event.target as HTMLElement).dataset.value;
    if (event.key === 'Enter' && value && !value.includes('\u0000')) onSelect(value);
  };

  const renderNode = ({ node, level, expanded, hasChildren, elementProps }: RenderTreeNodePayload) => {
    const placeholderFor = node.nodeProps?.placeholderFor as string | undefined;
    if (placeholderFor) {
      return errors[placeholderFor] ? (
        <div className={classes.treeError} style={elementProps.style}>
          {t('tree.loadError')}
          <Button variant="subtle" size="compact-xs" onClick={() => retry(placeholderFor)}>
            {t('retry')}
          </Button>
        </div>
      ) : (
        <div className={classes.treeSkeleton} style={elementProps.style} aria-hidden>
          <Skeleton height={10} width="70%" radius="sm" />
        </div>
      );
    }
    const item = node.nodeProps!.node as TreeNode;
    const Icon = iconFor(item);
    const Chevron = expanded ? ChevronDown : ChevronRight;
    const isSelected = item.key === selectedKey;

    // As in the prototype: the chevron folds and unfolds; a click on the row
    // selects it and unfolds it, and a click on the selected row folds it.
    const onClick = (event: MouseEvent) => {
      event.stopPropagation();
      const onChevron = !!(event.target as HTMLElement).closest('[data-chevron]');
      if (hasChildren && (onChevron || isSelected)) tree.toggleExpanded(item.key);
      else if (hasChildren) tree.expand(item.key);
      if (!onChevron) onSelect(item.key);
    };

    return (
      <div
        className={classes.treeRow}
        style={elementProps.style}
        data-selected={isSelected || undefined}
        data-level={level}
        onClick={onClick}
      >
        <span className={classes.chevron} data-chevron={hasChildren || undefined}>
          {hasChildren && <Chevron size={11} aria-hidden />}
        </span>
        <Icon className={classes.treeIcon} aria-hidden />
        <span className={classes.treeLabel}>{item.label}</span>
        <span className={classes.treeCount}>{item.count}</span>
      </div>
    );
  };

  return (
    <div data-section={section}>
      <div className={classes.sectionTitle}>{title}</div>
      {topError ? (
        <div className={classes.treeError}>
          {t('tree.loadError')}
          <Button variant="subtle" size="compact-xs" onClick={onRetryTop}>
            {t('retry')}
          </Button>
        </div>
      ) : !top ? (
        <div className={classes.treeSkeleton} aria-hidden>
          <Skeleton height={10} width="70%" radius="sm" />
        </div>
      ) : (
        <Tree
          data={data}
          tree={tree}
          levelOffset={14}
          expandOnClick={false}
          renderNode={renderNode}
          onKeyDown={onKeyDown}
          aria-label={title}
        />
      )}
    </div>
  );
}
