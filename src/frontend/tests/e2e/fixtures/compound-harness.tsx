/**
 * Mounts one Radix compound primitive, open, in its own React root on a page
 * of the running app, so a Playwright spec can measure it with the app's real
 * CSS (Tailwind and the Mantine variables). Vite serves this file, so it shares
 * the app's React, Radix and i18n module instances.
 *
 *   const { mountScene } = await import('/tests/e2e/fixtures/compound-harness.tsx');
 *   mountScene('select');
 */
/* eslint-disable react-refresh/only-export-components -- a test fixture, never hot-reloaded */
import { createElement, useState, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Sheet, SheetContent, SheetTitle } from '@/components/ui/sheet';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Button } from '@/components/ui/button';
import { AppMantineProvider } from '@/mantine/provider';
import { ToastAction } from '@/components/ui/toast';
import { toast } from '@/hooks/use-toast';

export type Scene = 'select' | 'dialog' | 'tabs' | 'dropdown' | 'tooltip' | 'popover' | 'sheet' | 'dismissable-dialog';

/** What the scenes report back to the spec. */
export const events = { openChanges: [] as boolean[], toastActions: 0 };

function Stage({ children }: { children: ReactNode }) {
  return <div data-testid="stage" style={{ padding: 24, width: 520, height: 320, background: 'hsl(var(--background))' }}>{children}</div>;
}

function OpenDialog({ dismissable }: { dismissable: boolean }) {
  const [open, setOpen] = useState(true);
  const onOpenChange = (next: boolean) => { events.openChanges.push(next); setOpen(next); };
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {/* A caller that lets outside clicks close the dialog */}
      <DialogContent {...(dismissable ? { onInteractOutside: () => {} } : {})}>
        <DialogHeader>
          <DialogTitle>Rename data product</DialogTitle>
          <DialogDescription>The new name shows everywhere the product is listed.</DialogDescription>
        </DialogHeader>
        <input aria-label="Name" defaultValue="Customer 360" style={{ border: '1px solid hsl(var(--border))', padding: 4 }} />
        <DialogFooter>
          <Button variant="outline">Cancel</Button>
          <Button>Save</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function OpenSheet() {
  const [open, setOpen] = useState(true);
  const onOpenChange = (next: boolean) => { events.openChanges.push(next); setOpen(next); };
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent>
        <SheetTitle>Filters</SheetTitle>
      </SheetContent>
    </Sheet>
  );
}

function scene(name: Scene) {
  switch (name) {
    case 'select':
      return (
        <Select defaultOpen defaultValue="active">
          <SelectTrigger aria-label="Status" style={{ width: 200 }}><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="draft">Draft</SelectItem>
            <SelectItem value="active">Active</SelectItem>
            <SelectItem value="deprecated">Deprecated</SelectItem>
          </SelectContent>
        </Select>
      );
    case 'dialog':
      return <OpenDialog dismissable={false} />;
    case 'dismissable-dialog':
      return <OpenDialog dismissable />;
    case 'sheet':
      return <OpenSheet />;
    case 'tabs':
      return (
        <Tabs defaultValue="overview">
          <TabsList>
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="schema">Schema</TabsTrigger>
            <TabsTrigger value="lineage">Lineage</TabsTrigger>
          </TabsList>
          <TabsContent value="overview">Overview content</TabsContent>
        </Tabs>
      );
    case 'dropdown':
      return (
        <DropdownMenu defaultOpen modal={false}>
          <DropdownMenuTrigger asChild><Button variant="outline">Actions</Button></DropdownMenuTrigger>
          <DropdownMenuContent align="start">
            <DropdownMenuLabel>Data product</DropdownMenuLabel>
            <DropdownMenuItem>Edit</DropdownMenuItem>
            <DropdownMenuItem>Duplicate</DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem>Delete</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      );
    case 'tooltip':
      return (
        <Tooltip defaultOpen>
          <TooltipTrigger asChild><Button variant="outline">Hover me</Button></TooltipTrigger>
          <TooltipContent>Owned by the data team</TooltipContent>
        </Tooltip>
      );
    case 'popover':
      return (
        <Popover defaultOpen>
          <PopoverTrigger asChild><Button variant="outline">Details</Button></PopoverTrigger>
          <PopoverContent align="start">Popover content</PopoverContent>
        </Popover>
      );
  }
}

let root: Root | null = null;

/** Hides the app and mounts the scene, open, on a plain stage. */
export function mountScene(name: Scene) {
  document.getElementById('root')?.style.setProperty('display', 'none');
  const host = document.createElement('div');
  host.id = 'compound-harness';
  document.body.append(host);
  root?.unmount();
  root = createRoot(host);
  root.render(<AppMantineProvider><TooltipProvider><Stage>{scene(name)}</Stage></TooltipProvider></AppMantineProvider>);
}

/** Shows a real toast with an action, as the app does. */
export function showToast() {
  toast({
    title: 'Saved',
    duration: Infinity,
    action: createElement(ToastAction, { altText: 'Undo', onClick: () => { events.toastActions++; } }, 'Undo'),
  });
}
