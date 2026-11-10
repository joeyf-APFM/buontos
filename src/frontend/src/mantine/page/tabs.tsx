import { Tabs as MantineTabs, type TabsProps } from '@mantine/core';
import classes from './page.module.css';

type TabsClassNames = Partial<Record<string, string>>;

const KIT: TabsClassNames = { list: classes.tabList, tab: classes.tab, panel: classes.tabPanel };

/** The kit's classes with the caller's added to them, part by part. */
const withKit = (own?: TabsClassNames): TabsClassNames => {
  const merged = { ...KIT };
  for (const [part, name] of Object.entries(own ?? {})) {
    if (name) merged[part] = merged[part] ? `${merged[part]} ${name}` : name;
  }
  return merged;
};

/**
 * Mantine Tabs in the Task 7 tab look (components/ui/tabs.tsx), for pages
 * moving off ui/tabs. Always unstyled, so only page.module.css draws them; a
 * caller's classNames add to the kit's. Arrow keys move between tabs and
 * activate them (Mantine's defaults). Inactive panels are unmounted, as with
 * Radix Tabs (Mantine keeps them mounted by default); pass keepMounted to
 * keep them.
 */
export function Tabs({ classNames, ...props }: TabsProps) {
  const merged: TabsProps['classNames'] =
    typeof classNames === 'function'
      ? (theme, p, ctx) => withKit(classNames(theme, p, ctx) as TabsClassNames)
      : withKit(classNames as TabsClassNames | undefined);
  return <MantineTabs keepMounted={false} {...props} classNames={merged} unstyled />;
}

Tabs.List = MantineTabs.List;
Tabs.Tab = MantineTabs.Tab;
Tabs.Panel = MantineTabs.Panel;
