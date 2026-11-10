/**
 * Mounts the page kit (src/mantine/page) on a plain stage in a page of the
 * running app, so a Playwright spec can measure it with the app's real CSS.
 * Vite serves this file, so it shares the app's React, Mantine and i18n.
 *
 *   const { mountPageKit } = await import('/tests/e2e/fixtures/page-kit-harness.tsx');
 *   mountPageKit();
 */
/* eslint-disable react-refresh/only-export-components -- a test fixture, never hot-reloaded */
import { createRoot, type Root } from 'react-dom/client';
import { AppMantineProvider } from '@/mantine/provider';
import { TooltipProvider } from '@/components/ui/tooltip';
import { Tabs as RadixTabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { DetailsGrid, FilterBar, PageHeader, PageLayout, Pane, Tabs } from '@/mantine/page';

function Layout({ fullBleed, id }: { fullBleed?: boolean; id: string }) {
  return (
    <div data-testid={id} style={{ display: 'flex', width: 900, height: 320 }}>
      <PageLayout
        fullBleed={fullBleed}
        breadcrumb={<span>Data / Tables</span>}
        header={<PageHeader title="Orders with a long title" badges={<span>Table</span>} actions={<button>New</button>} />}
        filters={<FilterBar hint="2 assets"><input aria-label="Filter" /></FilterBar>}
        aside={<div>aside</div>}
      >
        <Pane title="Left">left</Pane>
        <Pane title="Middle">middle</Pane>
        <Pane title="Right">right</Pane>
      </PageLayout>
    </div>
  );
}

function Stage() {
  return (
    <div style={{ display: 'grid', gap: 24, padding: 24, background: 'var(--aura-surface)' }}>
      <Layout id="padded" />
      <Layout id="full-bleed" fullBleed />
      <div data-testid="lone" style={{ display: 'flex', width: 400, height: 160 }}>
        <PageLayout header={<PageHeader title="Lone" />}>
          <Pane aria-label="Only">only</Pane>
        </PageLayout>
      </div>
      <div data-testid="details" style={{ width: 280 }}>
        <DetailsGrid rows={[{ label: 'Type', value: 'Table' }, { label: 'Owner', value: 'Sales Analytics' }]} />
      </div>
      <div data-testid="kit-tabs">
        <Tabs defaultValue="a">
          <Tabs.List>
            <Tabs.Tab value="a">Details</Tabs.Tab>
            <Tabs.Tab value="b">Lineage</Tabs.Tab>
          </Tabs.List>
          <Tabs.Panel value="a">A</Tabs.Panel>
          <Tabs.Panel value="b">B</Tabs.Panel>
        </Tabs>
      </div>
      <div data-testid="radix-tabs">
        <RadixTabs defaultValue="a">
          <TabsList>
            <TabsTrigger value="a">Details</TabsTrigger>
            <TabsTrigger value="b">Lineage</TabsTrigger>
          </TabsList>
        </RadixTabs>
      </div>
    </div>
  );
}

let root: Root | null = null;

/** Hides the app and mounts the page kit. */
export function mountPageKit() {
  document.getElementById('root')?.style.setProperty('display', 'none');
  const host = document.createElement('div');
  document.body.append(host);
  root?.unmount();
  root = createRoot(host);
  root.render(<AppMantineProvider><TooltipProvider><Stage /></TooltipProvider></AppMantineProvider>);
}
