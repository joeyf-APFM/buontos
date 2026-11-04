import { describe, expect, it } from 'vitest';

import type { OntologyConcept } from '@/types/ontology';

import {
  buildRelationshipEdges,
  collectRelationshipConcepts,
  selectRelationshipProperties,
} from './knowledge-graph-relationships';

const NS = 'https://example.org/onto#';

function concept(local: string, extra: Partial<OntologyConcept> = {}): OntologyConcept {
  return {
    iri: NS + local,
    label: local,
    concept_type: 'class',
    parent_concepts: [],
    child_concepts: [],
    properties: [],
    tagged_assets: [],
    synonyms: [],
    examples: [],
    ...extra,
  };
}

const lead = concept('Lead');
const stage = concept('LeadStage');
const hasReached = concept('leadHasReachedLeadStage', {
  label: 'has reached',
  concept_type: 'property',
  property_type: 'object',
  domain: lead.iri,
  range: stage.iri,
});
const metric = concept('referredLeadRate', {
  concept_type: 'property',
  property_type: 'datatype',
  domain: stage.iri,
  range: 'http://www.w3.org/2001/XMLSchema#decimal',
});
const dangling = concept('leadOwnedByAdvisor', {
  concept_type: 'property',
  property_type: 'object',
  domain: lead.iri,
  range: NS + 'Advisor', // not in the graph
});

describe('selectRelationshipProperties', () => {
  it('keeps object properties whose domain and range are both graph classes', () => {
    const picked = selectRelationshipProperties([lead, stage, hasReached, metric, dangling]);
    expect(picked.map((c) => c.iri)).toEqual([hasReached.iri]);
  });
});

describe('buildRelationshipEdges', () => {
  it('draws a labelled domain -> range edge when both ends are visible', () => {
    const edges = buildRelationshipEdges([hasReached], new Set([lead.iri, stage.iri]), (p) => p.label!);
    expect(edges).toHaveLength(1);
    expect(edges[0].classes).toBe('relationship-edge');
    expect(edges[0].data).toMatchObject({
      id: `rel_${hasReached.iri}`,
      source: lead.iri,
      target: stage.iri,
      label: 'has reached',
    });
  });

  it('skips the edge when either end is hidden', () => {
    expect(buildRelationshipEdges([hasReached], new Set([lead.iri]), (p) => p.label!)).toEqual([]);
  });
});

describe('collectRelationshipConcepts', () => {
  // The explore views drop every property when "show properties" is off; relationships must survive that.
  it('returns object properties from the grouped maps, de-duplicated, without datatype properties', () => {
    const fromConcepts = { 'urn:a': [lead, stage, hasReached, metric] };
    const fromProperties = { 'urn:a': [hasReached] };
    const out = collectRelationshipConcepts([fromConcepts, fromProperties], []);
    expect(out.map((c) => c.iri)).toEqual([hasReached.iri]);
  });

  it('honours the source filter', () => {
    const scoped = { ...hasReached, source_context: 'urn:hidden' };
    expect(collectRelationshipConcepts([{ 'urn:hidden': [scoped] }], ['urn:hidden'])).toEqual([]);
    expect(collectRelationshipConcepts([{ 'urn:hidden': [scoped] }], [])).toHaveLength(1);
  });
});
