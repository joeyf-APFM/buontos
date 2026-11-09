/**
 * The Asset Explorer's calls: the asset tree, one level at a time, and the
 * paged asset list under a tree node.
 */
import type { AssetRead, AssetStatus, AssetTypeRead, DataBranch } from '@/types/asset';
import type { AssignedDomain } from '@/types/data-domain';
import type { EntityTypeDefinition } from '@/types/ontology-schema';

export interface TreeNode {
  key: string;
  label: string;
  kind: 'branch' | 'type' | 'asset' | 'group';
  assetId?: string;
  assetTypeName?: string;
  count: number;
  hasChildren: boolean;
}

/** `AssetTreeNode` as the API sends it. */
interface ApiTreeNode {
  key: string;
  label: string;
  kind: TreeNode['kind'];
  asset_id?: string | null;
  asset_type_name?: string | null;
  count: number;
  has_children: boolean;
}

/** One row of `GET /api/assets` (`AssetSummary`). */
export interface AssetSummary {
  id: string;
  name: string;
  description?: string | null;
  asset_type_id: string;
  asset_type_name?: string | null;
  location?: string | null;
  status: AssetStatus;
  data_branch?: DataBranch | null;
  domains: AssignedDomain[];
  primary_domain_id?: string | null;
  updated_at?: string | null;
  owner_display?: string | null;
  owner_extra_count: number;
  /** Concept labels. */
  concepts: string[];
  column_count?: number | null;
}

export interface AssetQuery {
  node: string;
  name?: string;
  types?: string[];
  status?: string;
  conceptIri?: string;
  skip: number;
  limit: number;
}

async function getJson<T>(url: string): Promise<T> {
  const response = await fetch(url);
  if (!response.ok) {
    let detail = '';
    try {
      const body = await response.json();
      detail = typeof body?.detail === 'string' ? body.detail : '';
    } catch {
      // not JSON
    }
    throw new Error(detail || `${response.status} ${response.statusText}`.trim());
  }
  return response.json() as Promise<T>;
}

const toTreeNode = (n: ApiTreeNode): TreeNode => ({
  key: n.key,
  label: n.label,
  kind: n.kind,
  assetId: n.asset_id ?? undefined,
  assetTypeName: n.asset_type_name ?? undefined,
  count: n.count,
  hasChildren: n.has_children,
});

/** The children of a tree node; with no parent, the branch nodes. */
export async function fetchTreeChildren(parent?: string): Promise<TreeNode[]> {
  const url = parent ? `/api/assets/tree?parent=${encodeURIComponent(parent)}` : '/api/assets/tree';
  const nodes = await getJson<ApiTreeNode[]>(url);
  return nodes.map(toTreeNode);
}

/** A page of the assets in a node's scope. */
export async function fetchAssets(q: AssetQuery): Promise<{ items: AssetSummary[]; total: number }> {
  const params = new URLSearchParams({ node: q.node, skip: String(q.skip), limit: String(q.limit) });
  if (q.name) params.set('name', q.name);
  if (q.types?.length) params.set('asset_type_names', q.types.join(','));
  if (q.status) params.set('status', q.status);
  if (q.conceptIri) params.set('concept_iri', q.conceptIri);
  const page = await getJson<{ items: AssetSummary[]; total: number }>(`/api/assets?${params}`);
  return { items: page.items, total: page.total };
}

/** A concept, as the concept search returns it: the IRI in `value`. */
export interface ConceptOption {
  value: string;
  label: string;
}

/** Concepts whose label matches `q` (the concept pickers' search). */
export const searchConcepts = (q: string) =>
  getJson<ConceptOption[]>(`/api/semantic-models/concepts?q=${encodeURIComponent(q)}&limit=50`);

export const fetchAsset = (id: string) => getJson<AssetRead>(`/api/assets/${encodeURIComponent(id)}`);

export const fetchAssetTypes = () => getJson<AssetTypeRead[]>('/api/asset-types');

/** The ontology's asset-tier types, for the create form's schema. */
export const fetchOntologyAssetTypes = (lang: string) =>
  getJson<EntityTypeDefinition[]>(`/api/ontology/entity-types?tier=asset&lang=${encodeURIComponent(lang)}`);
