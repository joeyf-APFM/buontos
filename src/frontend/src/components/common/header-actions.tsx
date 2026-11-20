import type { ReactNode } from 'react';
import { Menu } from '@mantine/core';
import { useTranslation } from 'react-i18next';
import { ChevronDown } from 'lucide-react';
import { Button } from '@/components/ui/button';

export interface HeaderAction {
  key: string;
  label: string;
  icon?: ReactNode;
  onClick: () => void;
  disabled?: boolean;
  /** An action the page does not offer this user right now is simply left out. */
  show?: boolean;
  /** A destructive action: red, and set apart at the foot of the More menu. */
  danger?: boolean;
  /** Stay an outline button even as the first (primary) one, such as Unsubscribe. */
  quiet?: boolean;
  /** The button's class when it shows in the header (the page's own danger style, say). */
  className?: string;
}

interface HeaderActionsProps {
  actions: HeaderAction[];
  /**
   * The keys that show as buttons, in order; the first is the primary action.
   * Every other action sits in the More menu, in the order given in `actions`.
   */
  visible: string[];
  /** Shown after the buttons and before More, such as the comments toggle. */
  afterVisible?: ReactNode;
}

/**
 * A detail page's header actions: a primary action, at most one or two more,
 * and the rest under "More", so the header stays readable however many things
 * the page can do. An action not shown to this user (`show: false`) is absent
 * from both.
 */
export function HeaderActions({ actions, visible, afterVisible }: HeaderActionsProps) {
  const { t } = useTranslation('common');
  const offered = actions.filter((a) => a.show !== false);
  const shown = visible
    .map((key) => offered.find((a) => a.key === key))
    .filter((a): a is HeaderAction => Boolean(a));
  const more = offered.filter((a) => !shown.includes(a));
  const regular = more.filter((a) => !a.danger);
  const destructive = more.filter((a) => a.danger);

  return (
    <>
      {shown.map((action, i) => (
        <Button
          key={action.key}
          size="sm"
          variant={i === 0 && !action.quiet ? 'default' : 'outline'}
          className={action.className}
          onClick={action.onClick}
          disabled={action.disabled}
        >
          {action.icon} {action.label}
        </Button>
      ))}
      {afterVisible}
      {more.length > 0 && (
        <Menu position="bottom-end" withinPortal>
          <Menu.Target>
            <Button size="sm" variant="outline" aria-label={t('headerActions.moreLabel')}>
              {t('headerActions.more')} <ChevronDown />
            </Button>
          </Menu.Target>
          <Menu.Dropdown>
            {regular.map((a) => (
              <Menu.Item key={a.key} leftSection={a.icon} disabled={a.disabled} onClick={a.onClick}>
                {a.label}
              </Menu.Item>
            ))}
            {regular.length > 0 && destructive.length > 0 && <Menu.Divider />}
            {destructive.map((a) => (
              <Menu.Item key={a.key} color="red" leftSection={a.icon} disabled={a.disabled} onClick={a.onClick}>
                {a.label}
              </Menu.Item>
            ))}
          </Menu.Dropdown>
        </Menu>
      )}
    </>
  );
}
