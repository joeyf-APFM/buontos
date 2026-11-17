import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Drawer, Loader, TextInput } from '@mantine/core';
import { useDebouncedValue } from '@mantine/hooks';
import { useTranslation } from 'react-i18next';
import { fetchHelpArticles, searchHelp, type HelpArticleSummary, type HelpSearchItem } from './help-api';
import classes from './help.module.css';

interface HelpDrawerProps {
  opened: boolean;
  onClose: () => void;
}

interface Topic {
  name: string;
  articles: HelpArticleSummary[];
}

const byOrderThenTitle = (a: HelpArticleSummary, b: HelpArticleSummary) =>
  a.order - b.order || a.title.localeCompare(b.title);

/** Articles grouped by topic; groups by their lowest order, articles by order then title. */
function groupByTopic(articles: HelpArticleSummary[], fallback: string): Topic[] {
  const groups = new Map<string, HelpArticleSummary[]>();
  for (const article of articles) {
    const name = article.topic ?? fallback;
    groups.set(name, [...(groups.get(name) ?? []), article]);
  }
  return [...groups.entries()]
    .map(([name, list]) => ({ name, articles: [...list].sort(byOrderThenTitle) }))
    .sort((a, b) => a.articles[0].order - b.articles[0].order);
}

/** Search and browse the help articles, from the top bar. */
export function HelpDrawer({ opened, onClose }: HelpDrawerProps) {
  const { t } = useTranslation('help');
  const [query, setQuery] = useState('');
  const [debounced] = useDebouncedValue(query, 250);
  const term = debounced.trim();

  const [articles, setArticles] = useState<HelpArticleSummary[] | null>(null);
  const [articlesFailed, setArticlesFailed] = useState(false);
  const articlesRequested = useRef(false);
  // Results with the term they answer, so a stale answer is never shown
  const [found, setFound] = useState<{ term: string; items: HelpSearchItem[] | null } | null>(null);

  useEffect(() => {
    if (!opened || articlesRequested.current) return;
    articlesRequested.current = true;
    setArticlesFailed(false);
    fetchHelpArticles()
      .then(setArticles)
      .catch(() => {
        // Let the next open retry
        articlesRequested.current = false;
        setArticlesFailed(true);
      });
  }, [opened]);

  useEffect(() => {
    if (!term) return;
    const controller = new AbortController();
    searchHelp(term, controller.signal)
      .then((items) => !controller.signal.aborted && setFound({ term, items }))
      .catch(() => !controller.signal.aborted && setFound({ term, items: null }));
    return () => controller.abort();
  }, [term]);

  const topics = useMemo(() => groupByTopic(articles ?? [], t('drawer.browse')), [articles, t]);
  const answer = term && found?.term === term ? found : null;

  const link = (key: string, to: string, title: string, description?: string) => (
    <Link key={key} to={to} className={classes.item} onClick={onClose}>
      <span className={classes.itemTitle}>{title}</span>
      {description && <span className={classes.itemDescription}>{description}</span>}
    </Link>
  );

  let body;
  if (term) {
    if (!answer) body = <Loader size="xs" m="sm" />;
    else if (!answer.items) body = <div className={classes.message}>{t('drawer.error')}</div>;
    else if (answer.items.length === 0) body = <div className={classes.message}>{t('drawer.noResults')}</div>;
    else body = answer.items.map((item) => link(`${item.type}:${item.id}`, item.link, item.title, item.description));
  } else if (articlesFailed) {
    body = <div className={classes.message}>{t('drawer.error')}</div>;
  } else if (!articles) {
    body = <Loader size="xs" m="sm" />;
  } else {
    body = topics.map((topic) => (
      <div key={topic.name}>
        <div className={classes.topic} data-testid="help-topic">
          {topic.name}
        </div>
        {topic.articles.map((a) => link(a.slug, `/help/${a.slug}`, a.title))}
      </div>
    ));
  }

  return (
    <Drawer opened={opened} onClose={onClose} position="right" title={t('drawer.title')}>
      <TextInput
        data-autofocus
        aria-label={t('drawer.searchPlaceholder')}
        placeholder={t('drawer.searchPlaceholder')}
        value={query}
        onChange={(e) => setQuery(e.currentTarget.value)}
      />
      <div>{body}</div>
      <Link to="/help" className={classes.viewAll} onClick={onClose}>
        {t('drawer.viewAll')}
      </Link>
    </Drawer>
  );
}
