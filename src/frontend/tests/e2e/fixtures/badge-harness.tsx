/**
 * Mounts the domain badges on a plain stage in a page of the running app, so
 * a Playwright spec can measure them with the app's real CSS. Vite serves
 * this file, so it shares the app's React, Mantine and i18n instances.
 *
 *   const { mountBadges } = await import('/tests/e2e/fixtures/badge-harness.tsx');
 *   mountBadges();
 */
/* eslint-disable react-refresh/only-export-components -- a test fixture, never hot-reloaded */
import { createRoot, type Root } from 'react-dom/client';
import { AppMantineProvider } from '@/mantine/provider';
import { TooltipProvider } from '@/components/ui/tooltip';
import CertificationBadge from '@/components/common/certification-badge';
import PublicationBadge from '@/components/common/publication-badge';
import { MaturityBadge } from '@/components/common/maturity-badge';
import { RatingBadge } from '@/components/ratings/rating-badge';

// The seeded levels (certification_levels_repository.py), plus a custom red one
const LEVELS = [
  { id: 'a', level_order: 1, name: 'Bronze', description: null, icon: 'shield', color: 'amber' },
  { id: 'b', level_order: 2, name: 'Silver', description: null, icon: 'shield-check', color: 'slate' },
  { id: 'c', level_order: 3, name: 'Gold', description: null, icon: 'shield-check', color: 'yellow' },
  { id: 'd', level_order: 4, name: 'Revoked', description: null, icon: null, color: 'red' },
];

function Badges() {
  return (
    <div data-testid="stage" style={{ display: 'flex', gap: 12, padding: 24, width: 900, flexWrap: 'wrap', background: 'hsl(var(--background))' }}>
      <CertificationBadge certificationLevel={1} levels={LEVELS} />
      <CertificationBadge certificationLevel={2} levels={LEVELS} />
      <CertificationBadge certificationLevel={3} levels={LEVELS} />
      <CertificationBadge certificationLevel={4} levels={LEVELS} />
      {/* The seeded maturity levels 1 and 2 (maturity_repository.py) */}
      <MaturityBadge levelName="Managed" levelColor="blue" levelOrder={1} totalLevels={5} />
      <MaturityBadge levelName="Defined" levelColor="cyan" levelOrder={2} totalLevels={5} />
      <PublicationBadge publicationScope="external" />
      <RatingBadge entityType="data_product" entityId="e2e-rated" onClick={() => {}} />
    </div>
  );
}

let root: Root | null = null;

/** Hides the app and mounts the badges. */
export function mountBadges() {
  document.getElementById('root')?.style.setProperty('display', 'none');
  const host = document.createElement('div');
  document.body.append(host);
  root?.unmount();
  root = createRoot(host);
  root.render(<AppMantineProvider><TooltipProvider><Badges /></TooltipProvider></AppMantineProvider>);
}
