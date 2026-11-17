/**
 * Mounts the page kit (src/mantine/page) on a plain stage in a page of the
 * running app, so a Playwright spec can measure it with the app's real CSS.
 * Vite serves this file, so it shares the app's React, Mantine and i18n.
 *
 *   const { mountPageKit } = await import('/tests/e2e/fixtures/page-kit-harness.tsx');
 *   mountPageKit();
 *
 * `mountDialog()` opens the kit Dialog over the running app instead (the
 * shell stays), with a Mantine Select and a Radix Popover in it.
 */
/* eslint-disable react-refresh/only-export-components -- a test fixture, never hot-reloaded */
import { useEffect, useState } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { Menu, Popover as MantinePopover, Select, Tooltip as MantineTooltip } from '@mantine/core';
import { AppMantineProvider } from '@/mantine/provider';
import { TooltipProvider } from '@/components/ui/tooltip';
import { Tabs as RadixTabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Dialog, DetailsGrid, FilterBar, PageHeader, PageLayout, Pane, PaneStack, SelectableList, StatTile, Tabs, type DialogProps } from '@/mantine/page';
import { AssistantWindow } from '@/mantine/assistant/assistant-window';

function Layout({ fullBleed, id }: { fullBleed?: boolean; id: string }) {
  return (
    <div data-testid={id} style={{ display: 'flex', width: 900, height: 320 }}>
      <PageLayout
        fullBleed={fullBleed}
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
      <div data-testid="sized" style={{ display: 'flex', width: 901, height: 120 }}>
        <PaneStack sizes={[1, 2]}>
          <Pane aria-label="Narrow">narrow</Pane>
          <Pane aria-label="Wide">wide</Pane>
        </PaneStack>
      </div>
      <div data-testid="unsized" style={{ display: 'flex', width: 900 }}>
        <PaneStack>
          <Pane aria-label="First">first</Pane>
          <Pane aria-label="Second">second</Pane>
        </PaneStack>
      </div>
      <div data-testid="selectable" style={{ width: 240 }}>
        <SelectableList
          aria-label="Personas"
          selectedId="b"
          onSelect={() => {}}
          items={[{ id: 'a', label: 'Analyst' }, { id: 'b', label: 'Steward', meta: '2' }]}
        />
      </div>
      <div data-testid="stats" style={{ display: 'flex', gap: 8 }}>
        <StatTile label="Neutral" value="1" />
        <StatTile label="Good" value="2" tone="success" />
        <StatTile label="Warn" value="3" tone="warning" />
        <StatTile label="Crit" value="4" tone="critical" />
      </div>
      <div data-testid="details" style={{ width: 420 }}>
        <DetailsGrid rows={[{ label: 'Type', value: 'Table' }, { label: 'Owner', value: 'Sales Analytics' }, { label: 'Status', value: 'Draft' }]} />
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

/** What the dialog scene reports back to the spec. */
export const dialogEvents = { closes: 0, nestedCloses: 0 };

export interface DialogSceneOptions {
  size?: DialogProps['size'];
  /** Also open the floating assistant window, as if the user had it open. */
  assistant?: boolean;
  /** Put 60 paragraphs in the body, taller than the window. */
  long?: boolean;
  /** Put them there 400ms after opening instead, as content that loads. */
  late?: boolean;
  height?: DialogProps['height'];
  /**
   * The dialog's opener under an uncontrolled Mantine Tooltip held open, as
   * after a click on a tooltip-wrapped button: its floating-ui dismiss
   * listener on the document stops the Escape it sees.
   */
  openerTooltip?: boolean;
}

const PARAGRAPHS = Array.from({ length: 60 }, (_, i) => `Paragraph ${i + 1} of the product's notes.`);

function DialogScene({ size, assistant, long, late, height, openerTooltip }: DialogSceneOptions) {
  const [opened, setOpened] = useState(true);
  const [nested, setNested] = useState(false);
  const [loaded, setLoaded] = useState(!late);
  useEffect(() => {
    if (!late) return;
    const timer = setTimeout(() => setLoaded(true), 400);
    return () => clearTimeout(timer);
  }, [late]);
  return (
    <>
      {assistant && (
        <AssistantWindow
          title="Ask Nucleus"
          icon={null}
          closeLabel="Close assistant"
          onClose={() => {}}
          isOpen={() => true}
          rect={{ x: 40, y: 80, width: 360, height: 480 }}
          onRectChange={() => {}}
          focusRequested={false}
          takeFocusRequest={() => false}
        >
          <p>Assistant body</p>
        </AssistantWindow>
      )}
      {openerTooltip && (
        <MantineTooltip label="Upload a file" defaultOpened withinPortal>
          <button type="button">Upload</button>
        </MantineTooltip>
      )}
      <Dialog
        opened={opened}
        onClose={() => {
          dialogEvents.closes += 1;
          setOpened(false);
        }}
        size={size}
        height={height}
        title="Rename data product"
        description="The new name shows everywhere the product is listed."
        footer={
          <>
            <button type="button" onClick={() => setNested(true)}>Discard</button>
            <button type="button">Save</button>
          </>
        }
      >
        <input aria-label="Name" defaultValue="Customer 360" />
        {(long || late) && loaded && PARAGRAPHS.map((text) => <p key={text}>{text}</p>)}
        <Select aria-label="Status" data={['Active', 'Deprecated']} defaultValue="Active" />
        <Popover>
          <PopoverTrigger>More</PopoverTrigger>
          <PopoverContent>Popover body</PopoverContent>
        </Popover>
        {/* A Mantine Popover picker, focus inside it, and a Mantine Menu */}
        <MantinePopover trapFocus>
          <MantinePopover.Target>
            <button type="button">Filters</button>
          </MantinePopover.Target>
          <MantinePopover.Dropdown>
            <input aria-label="Filter text" />
          </MantinePopover.Dropdown>
        </MantinePopover>
        <Menu>
          <Menu.Target>
            <button type="button">Actions</button>
          </Menu.Target>
          <Menu.Dropdown>
            <Menu.Item>Duplicate</Menu.Item>
          </Menu.Dropdown>
        </Menu>
      </Dialog>
      {/* A confirm opened from the dialog, above it */}
      <Dialog
        opened={nested}
        onClose={() => {
          dialogEvents.nestedCloses += 1;
          setNested(false);
        }}
        role="alertdialog"
        size="sm"
        title="Discard changes?"
        description="Your edits will be lost."
        footer={<button type="button" data-autofocus onClick={() => setNested(false)}>Keep editing</button>}
      />
    </>
  );
}

let dialogRoot: Root | null = null;

/** Opens the kit Dialog over the app, which stays mounted with its shell. */
export function mountDialog(options: DialogSceneOptions = {}) {
  dialogEvents.closes = 0;
  dialogEvents.nestedCloses = 0;
  root?.unmount();
  root = null;
  document.getElementById('root')?.style.removeProperty('display');
  const host = document.createElement('div');
  document.body.append(host);
  dialogRoot?.unmount();
  dialogRoot = createRoot(host);
  dialogRoot.render(<AppMantineProvider><TooltipProvider><DialogScene {...options} /></TooltipProvider></AppMantineProvider>);
}
