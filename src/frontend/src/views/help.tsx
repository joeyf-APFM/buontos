import { useEffect, useMemo, useState } from 'react';
import { Link, useLocation, useParams } from 'react-router-dom';
import { Alert, Badge, Container, Grid, Group, Loader, Stack, Text, TextInput, Title } from '@mantine/core';
import { useDebouncedValue } from '@mantine/hooks';
import { useTranslation } from 'react-i18next';
import useBreadcrumbStore from '@/stores/breadcrumb-store';
import {
  fetchHelpArticle,
  fetchHelpArticles,
  searchHelp,
  type HelpArticle,
  type HelpArticleSummary,
  type HelpSearchItem,
} from '@/mantine/help/help-api';
import { HelpMarkdown } from '@/mantine/help/help-markdown';

const byOrderThenTitle = (a: HelpArticleSummary, b: HelpArticleSummary) =>
  a.order - b.order || a.title.localeCompare(b.title);

/** Articles grouped by topic; groups by their lowest order, articles by order then title. */
function groupByTopic(articles: HelpArticleSummary[], fallback: string) {
  const groups = new Map<string, HelpArticleSummary[]>();
  for (const article of articles) {
    const name = article.topic ?? fallback;
    groups.set(name, [...(groups.get(name) ?? []), article]);
  }
  return [...groups.entries()]
    .map(([name, list]) => ({ name, articles: [...list].sort(byOrderThenTitle) }))
    .sort((a, b) => a.articles[0].order - b.articles[0].order);
}

/** Breadcrumb for the help pages; `title` is the article's name, if on one. */
function useHelpBreadcrumb(title: string | null) {
  const { t } = useTranslation('help');
  const setStaticSegments = useBreadcrumbStore((s) => s.setStaticSegments);
  const setDynamicTitle = useBreadcrumbStore((s) => s.setDynamicTitle);
  const helpLabel = t('page.title');
  useEffect(() => {
    if (title) {
      setStaticSegments([{ label: helpLabel, path: '/help' }]);
      setDynamicTitle(title);
    } else {
      setStaticSegments([]);
      setDynamicTitle(helpLabel);
    }
    return () => {
      setStaticSegments([]);
      setDynamicTitle(null);
    };
  }, [title, helpLabel, setStaticSegments, setDynamicTitle]);
}

function HelpIndex() {
  const { t } = useTranslation('help');
  useHelpBreadcrumb(null);
  const [query, setQuery] = useState('');
  const [debounced] = useDebouncedValue(query, 250);
  const term = debounced.trim();

  const [articles, setArticles] = useState<HelpArticleSummary[] | null>(null);
  const [articlesFailed, setArticlesFailed] = useState(false);
  // Results with the term they answer, so a stale answer is never shown
  const [found, setFound] = useState<{ term: string; items: HelpSearchItem[] | null } | null>(null);

  useEffect(() => {
    let current = true;
    fetchHelpArticles()
      .then((list) => current && setArticles(list))
      .catch(() => current && setArticlesFailed(true));
    return () => {
      current = false;
    };
  }, []);

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

  const entry = (key: string, to: string, title: string, description?: string) => (
    <Link key={key} to={to} style={{ display: 'block', color: 'inherit', textDecoration: 'none' }}>
      <Text fw={500} c="blue">
        {title}
      </Text>
      {description && (
        <Text size="sm" c="dimmed">
          {description}
        </Text>
      )}
    </Link>
  );

  let body;
  if (term) {
    if (!answer) body = <Loader size="sm" />;
    else if (!answer.items) body = <Alert color="red">{t('drawer.error')}</Alert>;
    else if (answer.items.length === 0) body = <Text c="dimmed">{t('drawer.noResults')}</Text>;
    else body = <Stack gap="sm">{answer.items.map((i) => entry(`${i.type}:${i.id}`, i.link, i.title, i.description))}</Stack>;
  } else if (articlesFailed) {
    body = <Alert color="red">{t('drawer.error')}</Alert>;
  } else if (!articles) {
    body = <Loader size="sm" />;
  } else {
    body = (
      <Stack gap="lg">
        {topics.map((topic) => (
          <section key={topic.name}>
            <Title order={2} size="h4" mb="xs" data-testid="help-topic">
              {topic.name}
            </Title>
            <Stack gap="sm">{topic.articles.map((a) => entry(a.slug, `/help/${a.slug}`, a.title, a.summary))}</Stack>
          </section>
        ))}
      </Stack>
    );
  }

  return (
    <Container size="md" py="md">
      <Stack gap="md">
        <Title order={1}>{t('page.title')}</Title>
        <TextInput
          aria-label={t('drawer.searchPlaceholder')}
          placeholder={t('drawer.searchPlaceholder')}
          value={query}
          onChange={(e) => setQuery(e.currentTarget.value)}
        />
        {body}
      </Stack>
    </Container>
  );
}

type ArticleState = { slug: string; article: HelpArticle | null } | { slug: string; failed: true };

function HelpArticlePage({ slug }: { slug: string }) {
  const { t } = useTranslation('help');
  const { hash } = useLocation();
  const [state, setState] = useState<ArticleState | null>(null);
  const loaded = state?.slug === slug ? state : null;
  const article = loaded && 'article' in loaded ? loaded.article : null;

  useHelpBreadcrumb(article?.title ?? null);

  useEffect(() => {
    let current = true;
    fetchHelpArticle(slug)
      .then((a) => current && setState({ slug, article: a }))
      .catch(() => current && setState({ slug, failed: true }));
    return () => {
      current = false;
    };
  }, [slug]);

  // Scroll to the section named by the hash once the article is on screen,
  // and again whenever the hash changes.
  useEffect(() => {
    if (!article || !hash) return;
    const id = decodeURIComponent(hash.slice(1));
    const target = document.getElementById(id);
    if (target) target.scrollIntoView();
    else if (id === 'overview') window.scrollTo({ top: 0 });
  }, [article, hash]);

  let content;
  if (!loaded) {
    content = <Loader size="sm" />;
  } else if ('failed' in loaded) {
    content = <Alert color="red">{t('drawer.error')}</Alert>;
  } else if (!article) {
    content = (
      <Stack gap="xs">
        <Title order={1}>{t('page.notFound')}</Title>
        <Text component={Link} to="/help" c="blue">
          {t('page.backToHelp')}
        </Text>
      </Stack>
    );
  } else {
    // The implicit `overview` entry is the title, not a `##` heading
    const toc = article.sections.filter((s) => s.anchor !== 'overview');
    // The body carries the page's h1, so the metadata sits beside it
    content = (
      <Grid gutter="lg">
        <Grid.Col span={{ base: 12, md: 8 }} order={{ base: 2, md: 1 }}>
          <HelpMarkdown text={article.body} />
        </Grid.Col>
        <Grid.Col span={{ base: 12, md: 4 }} order={{ base: 1, md: 2 }}>
          <Stack gap="md">
            <Text component={Link} to="/help" size="sm" c="blue">
              {t('page.backToHelp')}
            </Text>
            {article.summary && <Text c="dimmed">{article.summary}</Text>}
            {article.roles.length > 0 && (
              <Group gap="xs">
                {article.roles.map((role) => (
                  <Badge key={role} variant="light">
                    {role}
                  </Badge>
                ))}
              </Group>
            )}
            {article.route && (
              <Text component={Link} to={article.route} size="sm" c="blue">
                {t('page.goToScreen')}
              </Text>
            )}
            {toc.length > 0 && (
              <nav aria-label={t('page.toc')}>
                <Title order={2} size="h5" mb="xs">
                  {t('page.toc')}
                </Title>
                <Stack gap={4}>
                  {toc.map((s) => (
                    <Text key={s.anchor} component={Link} to={`#${s.anchor}`} size="sm" c="blue">
                      {s.heading}
                    </Text>
                  ))}
                </Stack>
              </nav>
            )}
          </Stack>
        </Grid.Col>
      </Grid>
    );
  }

  return (
    <Container size="md" py="md">
      {content}
    </Container>
  );
}

/** The help pages: `/help` (index and search) and `/help/:slug` (an article). */
export default function HelpView() {
  const { slug } = useParams();
  return slug ? <HelpArticlePage slug={slug} /> : <HelpIndex />;
}
