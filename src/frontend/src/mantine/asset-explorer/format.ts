import type { AssetSummary } from './api';

/** Status dot colours. The API's "retired" is the prototype's "archived". */
export const STATUS_COLORS: Record<string, string> = {
  active: '#277153',
  draft: '#B67F14',
  deprecated: '#ADA899',
  archived: '#D41C16',
  retired: '#D41C16',
};

/** The owner, and "+N" for the other owners. */
export const ownerText = (a: AssetSummary) =>
  a.owner_display ? `${a.owner_display}${a.owner_extra_count > 0 ? ` +${a.owner_extra_count}` : ''}` : '';
