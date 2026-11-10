/**
 * Mounts the shared detail panels in `flush` mode, each inside a page-kit
 * Pane, on a plain stage in a page of the running app, so a Playwright spec
 * can measure them with the app's real CSS. Vite serves this file, so it
 * shares the app's React, Mantine and i18n. The spec answers their /api calls.
 *
 *   const { mountFlushPanels } = await import('/tests/e2e/fixtures/panels-harness.tsx');
 *   mountFlushPanels();
 */
/* eslint-disable react-refresh/only-export-components -- a test fixture, never hot-reloaded */
import { createRoot, type Root } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { AppMantineProvider } from '@/mantine/provider';
import { TooltipProvider } from '@/components/ui/tooltip';
import { Pane, PaneStack } from '@/mantine/page';
import { OwnershipPanel } from '@/components/common/ownership-panel';
import EntityMetadataPanel from '@/components/metadata/entity-metadata-panel';

function Stage() {
  return (
    <div data-testid="stage" style={{ display: 'flex', width: 720, padding: 24, background: 'var(--aura-surface)' }}>
      <PaneStack>
        <Pane aria-label="Owners pane">
          <OwnershipPanel objectType="asset" objectId="e2e-asset-1" canAssign flush />
        </Pane>
        <Pane aria-label="Metadata pane">
          <EntityMetadataPanel entityId="e2e-asset-1" entityType="asset" flush />
        </Pane>
      </PaneStack>
    </div>
  );
}

let root: Root | null = null;

/** Hides the app and mounts the flush panels. */
export function mountFlushPanels() {
  document.getElementById('root')?.style.setProperty('display', 'none');
  const host = document.createElement('div');
  document.body.append(host);
  root?.unmount();
  root = createRoot(host);
  root.render(
    <BrowserRouter>
      <AppMantineProvider><TooltipProvider><Stage /></TooltipProvider></AppMantineProvider>
    </BrowserRouter>,
  );
}
