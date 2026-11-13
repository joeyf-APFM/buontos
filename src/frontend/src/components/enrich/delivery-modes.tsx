import { useTranslation } from 'react-i18next';
import { ExternalLink } from 'lucide-react';
import classes from './delivery-modes.module.css';

// ---------------------------------------------------------------------------
// Deliver lane — Direct / Indirect / Manual mode cards (ADVANCED-ONLY).
//
// These map to Ontos' real Delivery Mode concept (Direct = SP applies changes
// immediately; Indirect = writes YAML to Git for a CI/CD pipeline to promote;
// Manual = notifies a person to apply elsewhere). Mode is configured per site
// under Settings > Delivery (settings-delivery), NOT per concept — so these
// cards are a read-only summary with a link out, matching the wireframe.
//
// We show which mode(s) are "active" from a passed-in prop rather than
// asserting a default; the caller decides based on real config when available.
// ---------------------------------------------------------------------------

export type DeliveryMode = 'direct' | 'indirect' | 'manual';

interface Props {
  /** Modes currently configured as active for the selected site. */
  activeModes?: DeliveryMode[];
  /** Link to the per-site delivery settings. */
  settingsHref?: string;
}

export default function DeliveryModes({
  activeModes = [],
  settingsHref = '/settings/delivery',
}: Props) {
  const { t } = useTranslation(['concepts', 'common']);

  const modes: { id: DeliveryMode; label: string; desc: string }[] = [
    {
      id: 'direct',
      label: t('enrich.modes.direct', 'Direct'),
      desc: t(
        'enrich.modes.directDesc',
        'Nucleus applies changes to this workspace immediately via the service principal.',
      ),
    },
    {
      id: 'indirect',
      label: t('enrich.modes.indirect', 'Indirect'),
      desc: t(
        'enrich.modes.indirectDesc',
        'Nucleus writes YAML to Git for your CI/CD pipeline to promote (dev to staging to prod).',
      ),
    },
    {
      id: 'manual',
      label: t('enrich.modes.manual', 'Manual'),
      desc: t('enrich.modes.manualDesc', 'Nucleus notifies a person to apply the change elsewhere.'),
    },
  ];

  return (
    <div className={classes.modes}>
      {modes.map((mode) => {
        const active = activeModes.includes(mode.id);
        return (
          <div key={mode.id} className={classes.mode} data-mode={mode.id} data-active={active || undefined}>
            <div className={classes.head}>
              <span className={classes.dot} aria-hidden />
              <b>{mode.label}</b>
              {active && (
                <span className={classes.active}>{t('enrich.modes.active', 'active')}</span>
              )}
            </div>
            <p className={classes.description}>{mode.desc}</p>
          </div>
        );
      })}
      <a href={settingsHref} className={classes.link}>
        {t('enrich.modes.manageLink', 'Delivery mode is set per site in Settings, Delivery')}
        <ExternalLink size={12} aria-hidden />
      </a>
    </div>
  );
}
