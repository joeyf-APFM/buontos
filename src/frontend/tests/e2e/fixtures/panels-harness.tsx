/**
 * Mounts the shared detail panels in `flush` mode, each inside a page-kit
 * Pane, on a plain stage in a page of the running app, so a Playwright spec
 * can measure them with the app's real CSS. Vite serves this file, so it
 * shares the app's React, Mantine and i18n. The spec answers their /api calls.
 *
 *   const { mountFlushPanels } = await import('/tests/e2e/fixtures/panels-harness.tsx');
 *   mountFlushPanels();
 *
 * `mountInfoDialog()` opens the EntityInfoDialog over the app instead, as the
 * Marketplace does (with Subscribe and Go to details).
 */
/* eslint-disable react-refresh/only-export-components -- a test fixture, never hot-reloaded */
import { createRoot, type Root } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { AppMantineProvider } from '@/mantine/provider';
import { TooltipProvider } from '@/components/ui/tooltip';
import { Pane, PaneStack } from '@/mantine/page';
import { OwnershipPanel } from '@/components/common/ownership-panel';
import EntityMetadataPanel from '@/components/metadata/entity-metadata-panel';
import EntityInfoDialog from '@/components/metadata/entity-info-dialog';
import EntityTagsPanel from '@/components/metadata/entity-tags-panel';
import { RatingPanel } from '@/components/ratings';
import EntityQualityPanel from '@/components/quality/entity-quality-panel';

function Stage() {
  return (
    <div data-testid="stage" style={{ display: 'flex', width: 720, padding: 24, background: 'var(--aura-surface)' }}>
      <PaneStack>
        <Pane aria-label="Owners pane">
          <OwnershipPanel objectType="asset" objectId="e2e-asset-1" canAssign flush ownerTeamId="e2e-team-1" ownerTeamName="Sales" />
        </Pane>
        <Pane aria-label="Metadata pane">
          <EntityMetadataPanel entityId="e2e-asset-1" entityType="asset" flush />
        </Pane>
        <Pane aria-label="Tags pane">
          <EntityTagsPanel entityId="e2e-asset-1" entityType="asset" flush />
        </Pane>
        <Pane aria-label="Ratings pane">
          <RatingPanel entityType="asset" entityId="e2e-asset-1" flush />
        </Pane>
        <Pane aria-label="Quality pane">
          <EntityQualityPanel entityId="e2e-asset-1" entityType="asset" flush />
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

/** Opens the EntityInfoDialog on a data product, with the Marketplace's footer. */
export function mountInfoDialog() {
  const host = document.createElement('div');
  document.body.append(host);
  root?.unmount();
  root = createRoot(host);
  root.render(
    <BrowserRouter>
      <AppMantineProvider>
        <TooltipProvider>
          <EntityInfoDialog
            entityType="data_product"
            entityId="e2e-product-1"
            title="Customer 360"
            open
            onOpenChange={() => {}}
            onSubscribe={() => {}}
            onGoToDetails={() => {}}
          />
        </TooltipProvider>
      </AppMantineProvider>
    </BrowserRouter>,
  );
}
