import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import {
  CheckCircle,
  ClipboardCheck,
  ClipboardList,
  FilePlus2,
  Network,
  Package,
  PenLine,
  Search,
  ShoppingCart,
  type LucideIcon,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { usePermissions } from '@/stores/permissions-store';
import { useFeatureVisibilityStore } from '@/stores/feature-visibility-store';
import { FeatureAccessLevel } from '@/types/settings';
import { features, type FeatureMaturity } from '@/config/features';

type Persona = 'producer' | 'steward' | 'consumer';

interface NextStep {
  id: string;
  persona: Persona;
  /** The feature (for its maturity) and permission the step needs. */
  featureId: string;
  permissionId: string;
  level: FeatureAccessLevel;
  to: string;
  icon: LucideIcon;
  /** An i18n key under home:nextSteps. */
  labelKey: string;
}

/**
 * The steps, most useful first within each persona. Producers build, stewards
 * review and oversee, consumers find and request. Paths open the page's own
 * create dialog where it has one (?new=1).
 */
export const NEXT_STEPS: NextStep[] = [
  { id: 'create-contract', persona: 'producer', featureId: 'data-contracts', permissionId: 'data-contracts', level: FeatureAccessLevel.READ_WRITE, to: '/data-contracts?new=1', icon: PenLine, labelKey: 'createContract' },
  { id: 'create-product', persona: 'producer', featureId: 'data-products', permissionId: 'data-products', level: FeatureAccessLevel.READ_WRITE, to: '/data-products?new=1', icon: FilePlus2, labelKey: 'createProduct' },
  { id: 'continue-draft', persona: 'producer', featureId: 'data-products', permissionId: 'data-products', level: FeatureAccessLevel.READ_WRITE, to: '/data-products?status=draft', icon: Package, labelKey: 'continueDraft' },

  { id: 'review-assets', persona: 'steward', featureId: 'data-asset-reviews', permissionId: 'data-asset-reviews', level: FeatureAccessLevel.READ_ONLY, to: '/data-asset-reviews', icon: ClipboardCheck, labelKey: 'reviewAssets' },
  { id: 'check-compliance', persona: 'steward', featureId: 'compliance', permissionId: 'compliance', level: FeatureAccessLevel.READ_ONLY, to: '/compliance', icon: CheckCircle, labelKey: 'checkCompliance' },
  { id: 'manage-concepts', persona: 'steward', featureId: 'concepts', permissionId: 'semantic-models', level: FeatureAccessLevel.READ_WRITE, to: '/concepts', icon: Network, labelKey: 'manageConcepts' },

  { id: 'browse-marketplace', persona: 'consumer', featureId: 'marketplace', permissionId: 'data-products', level: FeatureAccessLevel.READ_ONLY, to: '/marketplace', icon: ShoppingCart, labelKey: 'browseMarketplace' },
  { id: 'search', persona: 'consumer', featureId: 'search', permissionId: 'search', level: FeatureAccessLevel.READ_ONLY, to: '/search', icon: Search, labelKey: 'search' },
  { id: 'my-requests', persona: 'consumer', featureId: 'my-requests', permissionId: 'my-requests', level: FeatureAccessLevel.READ_ONLY, to: '/my-requests', icon: ClipboardList, labelKey: 'myRequests' },
];

const PERSONA_ORDER: Persona[] = ['producer', 'steward', 'consumer'];
const MAX_STEPS = 3;

/**
 * Up to three steps for this user. The steps they can take are grouped by
 * persona. Anyone who can write can also read, so consumer steps are for those
 * who are neither producer nor steward; a user who is both gets one from each in
 * turn (producer, steward), then the next of each, so no single role fills the row.
 */
export function pickNextSteps(
  has: (permissionId: string, level: FeatureAccessLevel) => boolean,
  maturityShown: (maturity: FeatureMaturity) => boolean,
): NextStep[] {
  const available = (step: NextStep) =>
    has(step.permissionId, step.level) &&
    maturityShown(features.find((f) => f.id === step.featureId)?.maturity ?? 'ga');
  const byPersona = PERSONA_ORDER.map((persona) => NEXT_STEPS.filter((s) => s.persona === persona && available(s)));
  // Consumer is the fallback: a producer or steward can read too, but their work is not browsing
  if (byPersona[0].length > 0 || byPersona[1].length > 0) byPersona[2] = [];
  const picked: NextStep[] = [];
  for (let round = 0; picked.length < MAX_STEPS; round++) {
    const row = byPersona.map((steps) => steps[round]).filter((s): s is NextStep => Boolean(s));
    if (row.length === 0) break;
    picked.push(...row.slice(0, MAX_STEPS - picked.length));
  }
  return picked;
}

/** The next things this person is likely to do, as up to three buttons, the first one primary. */
export default function NextSteps() {
  const { t } = useTranslation('home');
  const { isLoading, hasPermission } = usePermissions();
  const allowedMaturities = useFeatureVisibilityStore((s) => s.allowedMaturities);

  const steps = useMemo(
    () => (isLoading ? [] : pickNextSteps(hasPermission, (m) => allowedMaturities.includes(m))),
    [isLoading, hasPermission, allowedMaturities],
  );

  if (steps.length === 0) return null;
  return (
    <section aria-labelledby="home-next-steps" className="mb-8">
      <h2 id="home-next-steps" className="text-2xl font-semibold mb-4">{t('nextSteps.title')}</h2>
      <div className="flex flex-wrap gap-3">
        {steps.map((step, i) => (
          <Button key={step.id} asChild variant={i === 0 ? 'default' : 'outline'} size="lg">
            <Link to={step.to}>
              <step.icon className="h-4 w-4" aria-hidden />
              {t(`nextSteps.${step.labelKey}`)}
            </Link>
          </Button>
        ))}
      </div>
    </section>
  );
}
