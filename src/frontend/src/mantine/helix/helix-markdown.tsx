/**
 * Helix's answers as markdown: no raw HTML (skipHtml, no rehype-raw), no
 * images, and links only to the Databricks workspace; any other link is shown
 * as its text.
 */
import ReactMarkdown, { type Components } from 'react-markdown';
import remarkGfm from 'remark-gfm';
import classes from './helix.module.css';

/** The host part of the workspace URL, which may come without a scheme. */
function hostOf(url: string): string | null {
  if (!url) return null;
  try {
    return new URL(url.includes('://') ? url : `https://${url}`).host.toLowerCase();
  } catch {
    return null;
  }
}

/** Whether a link goes to the workspace host over https. */
function isWorkspaceLink(href: string | undefined, workspaceHost: string | null): boolean {
  if (!href || !workspaceHost) return false;
  try {
    const url = new URL(href);
    return url.protocol === 'https:' && url.host.toLowerCase() === workspaceHost;
  } catch {
    return false; // relative or malformed
  }
}

export function HelixMarkdown({ text, workspaceHost }: { text: string; workspaceHost: string }) {
  const host = hostOf(workspaceHost);
  const components: Components = {
    a: ({ href, children }) =>
      isWorkspaceLink(href, host) ? (
        <a href={href} target="_blank" rel="noopener noreferrer">
          {children}
        </a>
      ) : (
        <span>{children}</span>
      ),
    // An image would load from wherever the answer points; show its text instead
    img: ({ alt }) => (alt ? <span>{alt}</span> : null),
  };
  return (
    <div className={classes.markdown}>
      <ReactMarkdown skipHtml remarkPlugins={[remarkGfm]} components={components}>
        {text}
      </ReactMarkdown>
    </div>
  );
}
