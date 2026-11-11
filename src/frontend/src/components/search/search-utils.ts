/** Small helpers the concept Search tabs share (wave 2 Task 13b). */

/**
 * A chip's short name, as the tabs always wrote it: the text after the last
 * `#`, or the whole IRI when it has none.
 */
export function localName(iri: string): string {
  return iri.split('#').pop() || iri.split('/').pop() || iri;
}

/** An API list, or an empty one for anything else (an error's `{}`). */
export function asList<T>(data: unknown): T[] {
  return Array.isArray(data) ? (data as T[]) : [];
}
