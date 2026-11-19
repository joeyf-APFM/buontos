import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Loader2 } from 'lucide-react';
import type { TileConfig } from '@/tiles';

/** One tile as a count and a name, both linking to its page. The tile's own data hook feeds it. */
function Stat({ tile }: { tile: TileConfig }) {
  const { t } = useTranslation();
  const data = tile.useTileData();
  return (
    <li>
      <Link to={tile.link} className="group inline-flex items-baseline gap-2 rounded-md hover:underline">
        <span className="text-2xl font-semibold tabular-nums">
          {data.loading ? (
            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" aria-label={t('home:overview.loading')} />
          ) : data.error ? (
            <span className="text-sm text-destructive">{t('home:overview.error')}</span>
          ) : (
            data.value
          )}
        </span>
        <span className="text-sm text-muted-foreground">{t(tile.titleKey)}</span>
      </Link>
    </li>
  );
}

/**
 * The overview counts as one quiet row: no breakdowns and no per-card chrome,
 * so the person's next steps stay the first thing on the page.
 */
export default function StatsRow({ tiles }: { tiles: TileConfig[] }) {
  const { t } = useTranslation('home');
  if (tiles.length === 0) return null;
  return (
    <ul aria-label={t('overview.title')} className="mb-8 flex flex-wrap items-baseline gap-x-8 gap-y-2">
      {tiles.map((tile) => (
        <Stat key={tile.id} tile={tile} />
      ))}
    </ul>
  );
}
