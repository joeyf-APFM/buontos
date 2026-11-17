export interface HelpArticleSummary {
  slug: string;
  title: string;
  summary: string;
  tags: string[];
  roles: string[];
  order: number;
  topic: string | null;
  route: string | null;
}

export interface HelpArticle extends HelpArticleSummary {
  body: string;
  sections: { anchor: string; heading: string }[];
}

export interface HelpSearchItem {
  id: string;
  type: string;
  title: string;
  description: string;
  link: string;
  tags: string[];
  feature_id: string;
  extra_data: Record<string, unknown> | null;
}

export async function fetchHelpArticles(): Promise<HelpArticleSummary[]> {
  const response = await fetch('/api/help/articles');
  if (!response.ok) throw new Error(`Failed to load help articles (${response.status})`);
  return response.json();
}

export async function fetchHelpArticle(slug: string): Promise<HelpArticle | null> {
  const response = await fetch(`/api/help/articles/${encodeURIComponent(slug)}`);
  if (response.status === 404) return null;
  if (!response.ok) throw new Error(`Failed to load help article (${response.status})`);
  return response.json();
}

export async function searchHelp(q: string, signal?: AbortSignal): Promise<HelpSearchItem[]> {
  const response = await fetch(`/api/help/search?q=${encodeURIComponent(q)}&limit=20`, { signal });
  if (!response.ok) throw new Error(`Help search failed (${response.status})`);
  return response.json();
}
