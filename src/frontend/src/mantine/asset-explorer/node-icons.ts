import {
  Box, Building2, Columns3, Database, Eye, FolderTree, Gauge, Globe, HardDrive, Inbox, Library, Server, Table2,
  type LucideIcon,
} from 'lucide-react';
import type { TreeNode } from './api';

/**
 * Tree icons: branches by node key, assets and type nodes by asset type.
 * Adding a type is one line here; anything not listed gets FALLBACK_ICON.
 */
export const NODE_ICONS: Record<string, LucideIcon> = {
  'branch:uc': Database,
  'branch:internal': Building2,
  'branch:external': Globe,
  'branch:unsorted': Inbox,
  System: Server,
  Catalog: Library,
  Schema: FolderTree,
  Table: Table2,
  View: Eye,
  'Metric View': Gauge,
  Volume: HardDrive,
  Column: Columns3,
};

export const FALLBACK_ICON = Box;

/** A node's icon and its key in NODE_ICONS ('fallback' when it has none). */
export function nodeIcon(node: TreeNode): { Icon: LucideIcon; id: string } {
  // A group node (no longer sent) keeps the fallback, whatever its type
  const id = node.kind === 'branch' ? node.key : node.kind === 'group' ? undefined : node.assetTypeName;
  return id && NODE_ICONS[id] ? { Icon: NODE_ICONS[id], id } : { Icon: FALLBACK_ICON, id: 'fallback' };
}
