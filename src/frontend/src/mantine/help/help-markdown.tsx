/**
 * Help articles as markdown, safely: no raw HTML, no images (alt text only),
 * external links in a new tab, in-app links via react-router. The h1 is `overview` and
 * h2s carry the backend section anchors.
 */
import ReactMarkdown, { type Components } from 'react-markdown';
import { Link } from 'react-router-dom';
import remarkGfm from 'remark-gfm';
import { computeSectionAnchors } from './help-slug';

const SAFE_ABSOLUTE = /^(https?:|mailto:)/i;

/** Only http(s), mailto, same-document and root-relative (not `//`) URLs survive. */
function safeUrl(url: string): string {
  const u = url.trim();
  if (u.startsWith('#')) return u;
  if (u.startsWith('/')) return u.startsWith('//') ? '' : u;
  return SAFE_ABSOLUTE.test(u) ? u : '';
}

export function HelpMarkdown({ text }: { text: string }) {
  // Backend anchors exist for `##` sections only; the Nth rendered h2 takes
  // the Nth anchor. Counter is per render so double renders stay deterministic.
  const anchors = computeSectionAnchors(text);
  let h2Index = 0;
  const components: Components = {
    h1: ({ children }) => <h1 id="overview">{children}</h1>,
    h2: ({ children }) => <h2 id={anchors[h2Index++]}>{children}</h2>,
    a: ({ href, children }) => {
      if (!href) return <span>{children}</span>;
      if (href.startsWith('#')) return <a href={href}>{children}</a>;
      if (href.startsWith('/')) return <Link to={href}>{children}</Link>;
      return (
        <a href={href} target="_blank" rel="noopener noreferrer">
          {children}
        </a>
      );
    },
    img: ({ alt }) => (alt ? <span>{alt}</span> : null),
  };
  return (
    <ReactMarkdown skipHtml remarkPlugins={[remarkGfm]} components={components} urlTransform={safeUrl}>
      {text}
    </ReactMarkdown>
  );
}
