/**
 * Help articles as markdown, safely: no raw HTML, no images (alt text only),
 * external links in a new tab, in-app links via react-router. Headings h1-h4
 * get ids matching the backend section anchors.
 */
import type { ReactNode } from 'react';
import ReactMarkdown, { type Components } from 'react-markdown';
import { Link } from 'react-router-dom';
import remarkGfm from 'remark-gfm';
import { createAnchorGenerator } from './help-slug';

function textOf(node: ReactNode): string {
  if (node == null || typeof node === 'boolean') return '';
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  if (Array.isArray(node)) return node.map(textOf).join('');
  if (typeof node === 'object' && 'props' in node) return textOf((node.props as { children?: ReactNode }).children);
  return '';
}

export function HelpMarkdown({ text }: { text: string }) {
  const nextAnchor = createAnchorGenerator();
  const heading = (Tag: 'h1' | 'h2' | 'h3' | 'h4') =>
    function Heading({ children }: { children?: ReactNode }) {
      return <Tag id={nextAnchor(textOf(children))}>{children}</Tag>;
    };
  const components: Components = {
    h1: heading('h1'),
    h2: heading('h2'),
    h3: heading('h3'),
    h4: heading('h4'),
    a: ({ href, children }) =>
      href && (href.startsWith('/') || href.startsWith('#')) ? (
        href.startsWith('/') ? <Link to={href}>{children}</Link> : <a href={href}>{children}</a>
      ) : (
        <a href={href} target="_blank" rel="noopener noreferrer">
          {children}
        </a>
      ),
    img: ({ alt }) => (alt ? <span>{alt}</span> : null),
  };
  return (
    <ReactMarkdown skipHtml remarkPlugins={[remarkGfm]} components={components}>
      {text}
    </ReactMarkdown>
  );
}
