import { Tabs as MantineTabs, type TabsProps } from '@mantine/core';
import classes from './page.module.css';

const tabClassNames = { list: classes.tabList, tab: classes.tab, panel: classes.tabPanel };

/**
 * Mantine Tabs in the Task 7 tab look (components/ui/tabs.tsx), for pages
 * moving off ui/tabs. Unstyled, so only page.module.css draws them; arrow keys
 * move between tabs and activate them (Mantine's defaults).
 */
export function Tabs(props: TabsProps) {
  return <MantineTabs unstyled classNames={tabClassNames} {...props} />;
}

Tabs.List = MantineTabs.List;
Tabs.Tab = MantineTabs.Tab;
Tabs.Panel = MantineTabs.Panel;
