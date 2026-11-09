/**
 * Helix's answers as markdown, with the shared safe rules (no raw HTML, no
 * images) and links only to the Databricks workspace; any other link is shown
 * as its text.
 */
import { SafeMarkdown } from '@/mantine/assistant/safe-markdown';

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
  return <SafeMarkdown text={text} keepLink={(href) => isWorkspaceLink(href, host)} />;
}
