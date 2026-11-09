/**
 * Assistant answers as markdown, safely: no raw HTML (skipHtml, no
 * rehype-raw), no images (they would load from wherever the answer points),
 * and links opened in a new tab with rel="noopener noreferrer". `keepLink`
 * decides which links stay links; the rest show as their text.
 */
import ReactMarkdown, { type Components } from 'react-markdown';
import remarkGfm from 'remark-gfm';
import classes from './safe-markdown.module.css';

interface SafeMarkdownProps {
  text: string;
  keepLink?: (href: string | undefined) => boolean;
}

const anyLink = (href: string | undefined) => !!href;

export function SafeMarkdown({ text, keepLink = anyLink }: SafeMarkdownProps) {
  const components: Components = {
    a: ({ href, children }) =>
      keepLink(href) ? (
        <a href={href} target="_blank" rel="noopener noreferrer">
          {children}
        </a>
      ) : (
        <span>{children}</span>
      ),
    img: ({ alt }) => (alt ? <span>{alt}</span> : null),
    table: ({ children }) => (
      <div className={classes.tableWrap}>
        <table>{children}</table>
      </div>
    ),
  };
  return (
    <div className={classes.markdown}>
      <ReactMarkdown skipHtml remarkPlugins={[remarkGfm]} components={components}>
        {text}
      </ReactMarkdown>
    </div>
  );
}
