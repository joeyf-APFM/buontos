import { useEffect, useState, type ReactNode } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Anchor, Loader, Popover, TextInput, UnstyledButton } from '@mantine/core';
import { useDebouncedValue } from '@mantine/hooks';
import { useTranslation } from 'react-i18next';
import { Search } from 'lucide-react';
import { HelpButton } from '@/mantine/help/help-button';
import UserInfo from '@/components/ui/user-info';
import NotificationBell from '@/components/ui/notification-bell';
import { ProjectChooser } from '@/components/ui/project-chooser';
import { LanguageSelector } from '@/components/common/language-selector';
import { useUICustomizationStore } from '@/stores/ui-customization-store';
import { DEFAULT_APP_NAME } from '@/lib/branding';
import classes from './shell.module.css';

interface SearchResult {
  id: string;
  type: string;
  title: string;
  description: string;
  link: string;
}

/** The header search, as in components/ui/search-bar.tsx, in Mantine. */
function ShellSearch() {
  const { t } = useTranslation(['shell', 'common']);
  const navigate = useNavigate();
  const [query, setQuery] = useState('');
  const [debounced] = useDebouncedValue(query, 300);
  const [isOpen, setIsOpen] = useState(false);
  // Results with the term they answer, so a stale answer is never shown
  const [found, setFound] = useState<{ term: string; results: SearchResult[] } | null>(null);
  const term = debounced.trim();
  const results = term && found?.term === term ? found.results : [];
  const isLoading = !!term && found?.term !== term;

  useEffect(() => {
    if (!term) return;
    let cancelled = false;
    fetch(`/api/search?search_term=${encodeURIComponent(term)}`)
      .then((r) => (r.ok ? r.json() : []))
      .then((data) => !cancelled && setFound({ term, results: Array.isArray(data) ? data : [] }))
      .catch(() => !cancelled && setFound({ term, results: [] }));
    return () => {
      cancelled = true;
    };
  }, [term]);

  const open = (result: SearchResult) => {
    navigate(result.link);
    setIsOpen(false);
  };

  return (
    <Popover opened={isOpen && !!query.trim()} onChange={setIsOpen} position="bottom-start" width="target" shadow="md">
      <Popover.Target>
        <TextInput
          className={classes.search}
          classNames={{ input: classes.searchInput }}
          aria-label={t('shell:search.label')}
          placeholder={t('shell:search.placeholder')}
          leftSection={<Search size={14} aria-hidden />}
          rightSectionWidth={70}
          rightSection={
            <Anchor component={Link} to="/search/llm" size="xs" title={t('common:tooltips.openAdvancedSearch')}>
              {t('common:header.advanced')}
            </Anchor>
          }
          value={query}
          onChange={(e) => {
            setQuery(e.currentTarget.value);
            setIsOpen(true);
          }}
          onFocus={() => setIsOpen(true)}
          onBlur={() => setTimeout(() => setIsOpen(false), 150)}
        />
      </Popover.Target>
      <Popover.Dropdown p={4} mah={300} style={{ overflowY: 'auto' }}>
        {isLoading ? (
          <div className={classes.searchEmpty}>
            <Loader size="xs" /> {t('common:states.loading')}
          </div>
        ) : results.length > 0 ? (
          results.map((r) => (
            <UnstyledButton key={`${r.type}:${r.id}`} className={classes.searchResult} onMouseDown={(e) => e.preventDefault()} onClick={() => open(r)}>
              <span className={classes.searchResultTitle}>{r.title}</span>
              <span className={classes.searchResultDescription}>{r.description}</span>
            </UnstyledButton>
          ))
        ) : (
          <div className={classes.searchEmpty}>{t('common:placeholders.noResults')}</div>
        )}
      </Popover.Dropdown>
    </Popover>
  );
}

interface TopBarProps {
  /** Where the Ask Helix button goes. */
  helixSlot?: ReactNode;
}

export function TopBar({ helixSlot }: TopBarProps) {
  const { t } = useTranslation('shell');
  const shortName = useUICustomizationStore((s) => s.getShortName());
  const brand = shortName === DEFAULT_APP_NAME ? DEFAULT_APP_NAME : t('shell:brand', { shortName });

  return (
    <header className={`${classes.top} apfm-surface`}>
      <Link to="/" className={classes.brand}>
        {brand}
      </Link>
      <ShellSearch />
      <div className={classes.topEnd}>
        {helixSlot}
        <ProjectChooser />
        <HelpButton />
        <NotificationBell />
        <LanguageSelector />
        <UserInfo />
      </div>
    </header>
  );
}
