export type CollapsedTrail<T> =
  | { collapsed: false; crumbs: T[] }
  | { collapsed: true; head: T[]; hidden: T[]; tail: T[] };

/** The crumbs a folded trail shows before "…": Home, main (the group) and the sub-topic. */
const HEAD = 3;
/** The crumbs it shows after "…": the previous page and the current one. */
const TAIL = 2;

/**
 * A trail of more than `max` crumbs folds between the sub-topic and the
 * previous page (the owner, 2026-11-10):
 * `Home > {main} > {sub-topic} > … > {previous page} > {current page}`.
 */
export function collapseTrail<T>(crumbs: T[], max = HEAD + 1 + TAIL): CollapsedTrail<T> {
  if (crumbs.length <= max) return { collapsed: false, crumbs };
  return {
    collapsed: true,
    head: crumbs.slice(0, HEAD),
    hidden: crumbs.slice(HEAD, crumbs.length - TAIL),
    tail: crumbs.slice(crumbs.length - TAIL),
  };
}
