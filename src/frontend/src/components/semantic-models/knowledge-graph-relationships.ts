// Relationship (object property) edges for the knowledge graph: an object property whose domain and
// range are both classes/concepts in the graph is drawn as a labelled domain -> range edge.
import type { ElementDefinition } from 'cytoscape';

import type { OntologyConcept } from '@/types/ontology';

/** Object properties whose domain and range are both classes/concepts in ``concepts``. */
export function selectRelationshipProperties(concepts: OntologyConcept[]): OntologyConcept[] {
  const nodeIris = new Set(
    concepts.filter((c) => c.concept_type === 'class' || c.concept_type === 'concept').map((c) => c.iri)
  );
  return concepts.filter(
    (c) =>
      c.concept_type === 'property' &&
      c.property_type === 'object' &&
      !!c.domain &&
      !!c.range &&
      nodeIris.has(c.domain) &&
      nodeIris.has(c.range)
  );
}

/** One labelled domain -> range edge per relationship whose two ends are both visible. */
export function buildRelationshipEdges(
  relationships: OntologyConcept[],
  visibleIris: Set<string>,
  labelOf: (prop: OntologyConcept) => string
): ElementDefinition[] {
  return relationships
    .filter((prop) => visibleIris.has(prop.domain!) && visibleIris.has(prop.range!))
    .map((prop) => ({
      data: {
        id: `rel_${prop.iri}`,
        source: prop.domain!,
        target: prop.range!,
        label: labelOf(prop),
        conceptData: prop,
      },
      classes: 'relationship-edge',
    }));
}


/**
 * Object properties to draw as graph edges, collected from the grouped concept/property maps with the
 * source filter applied but INDEPENDENT of the "show properties" preference: relationships are edges,
 * not property nodes, so hiding property nodes must not hide them. De-duplicated by IRI.
 */
export function collectRelationshipConcepts(
  groups: Array<Record<string, OntologyConcept[]>>,
  hiddenSources: string[]
): OntologyConcept[] {
  const seen = new Set<string>();
  const out: OntologyConcept[] = [];
  for (const group of groups) {
    for (const item of Object.values(group).flat()) {
      if (item.concept_type !== 'property' || item.property_type !== 'object') continue;
      if (item.source_context && hiddenSources.includes(item.source_context)) continue;
      if (seen.has(item.iri)) continue;
      seen.add(item.iri);
      out.push(item);
    }
  }
  return out;
}


/**
 * Left-to-right rank of every class/concept that takes part in a relationship, following the
 * relationships' direction (domain before range) so a chain such as "A precedes B precedes C" lays
 * out in that order. Topological order (Kahn); nodes left in a cycle follow, sorted by IRI.
 * Self-loops are ignored. Classes with no relationship are absent from the map.
 */
export function relationshipOrder(relationships: OntologyConcept[]): Map<string, number> {
  const out = new Map<string, Set<string>>();
  const indegree = new Map<string, number>();
  const touch = (iri: string) => {
    if (!out.has(iri)) out.set(iri, new Set());
    if (!indegree.has(iri)) indegree.set(iri, 0);
  };
  for (const rel of relationships) {
    if (!rel.domain || !rel.range || rel.domain === rel.range) continue;
    touch(rel.domain);
    touch(rel.range);
    if (!out.get(rel.domain)!.has(rel.range)) {
      out.get(rel.domain)!.add(rel.range);
      indegree.set(rel.range, indegree.get(rel.range)! + 1);
    }
  }
  const order = new Map<string, number>();
  const ready = [...indegree.entries()].filter(([, d]) => d === 0).map(([iri]) => iri).sort();
  while (ready.length > 0) {
    const iri = ready.shift()!;
    order.set(iri, order.size);
    const next: string[] = [];
    for (const target of out.get(iri)!) {
      const d = indegree.get(target)! - 1;
      indegree.set(target, d);
      if (d === 0) next.push(target);
    }
    ready.push(...next.sort());
  }
  for (const iri of [...indegree.keys()].sort()) {
    if (!order.has(iri)) order.set(iri, order.size);
  }
  return order;
}
