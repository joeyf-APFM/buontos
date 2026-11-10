import { useCallback, useRef, type ReactNode, type RefObject } from 'react';
import { useTranslation } from 'react-i18next';
import { Modal } from '@mantine/core';
import { alertDialogRole } from '@/mantine/alert-dialog-role';
import { focusIsFree } from '@/mantine/focus-free';
import { useLayeredEscape } from '@/mantine/use-layered-escape';
import { Z_INDEX } from '@/mantine/z-index';
import classes from './dialog.module.css';

const WIDTHS = { sm: 420, md: 560, lg: 720, xl: 960 } as const;

export interface DialogProps {
  opened: boolean;
  onClose: () => void;
  title: ReactNode;
  /** Rendered as the accessible description, under the title. */
  description?: ReactNode;
  /** 420 / 560 / 720 / 960 px. @default 'md' */
  size?: 'sm' | 'md' | 'lg' | 'xl';
  /** `alertdialog` for confirms: no corner close, a response is needed. @default 'dialog' */
  role?: 'dialog' | 'alertdialog';
  /** Focus goes here once the dialog has closed, if `focusIsFree` says it may. */
  returnFocusTo?: RefObject<HTMLElement | null>;
  /** The right-aligned action row, under the body. */
  footer?: ReactNode;
  /** @default false, as the Radix dialogs (and waves 0–1) */
  closeOnClickOutside?: boolean;
  /**
   * Called once the dialog has closed and its exit transition has ended,
   * with its content element, for a caller that puts focus back itself
   * (such as after a reload). With it, or with `returnFocusTo`, Mantine's
   * own focus return is off.
   */
  onExited?: (content: HTMLElement | null) => void;
  /**
   * The corner close's name. `null` leaves it unnamed, for a close that was
   * unnamed before (ruling R16). @default common:actions.close ("Close")
   */
  closeLabel?: string | null;
  /** The body. A confirm may have none: its description says it all. */
  children?: ReactNode;
}

/**
 * The kit's modal dialog: a Mantine Modal with the dialog look (1px border,
 * 8px corners, a 14px navy title, the description, the body and a footer
 * row), stacked at `Z_INDEX.modal`.
 *
 * - Escape closes it unless a layer above it took the key first (an open
 *   Select's list, a Radix popover or dialog): `useLayeredEscape`.
 * - The corner close comes last, as Radix's did, so focus starts in the
 *   content (or on its `data-autofocus` element).
 */
export function Dialog({
  opened,
  onClose,
  title,
  description,
  size = 'md',
  role = 'dialog',
  returnFocusTo,
  footer,
  closeOnClickOutside = false,
  onExited,
  closeLabel,
  children,
}: DialogProps) {
  const { t } = useTranslation('common');
  useLayeredEscape(opened, onClose);

  // The last content element, kept after it unmounts: focusIsFree needs it
  const content = useRef<HTMLElement | null>(null);
  const contentRef = useCallback(
    (node: HTMLElement | null) => {
      if (!node) return;
      content.current = node;
      if (role === 'alertdialog') alertDialogRole(node);
    },
    [role],
  );

  const exited = () => {
    onExited?.(content.current);
    const target = returnFocusTo?.current;
    if (target?.isConnected && focusIsFree(content.current)) target.focus();
  };

  const name = closeLabel === null ? undefined : closeLabel ?? t('actions.close');

  return (
    <Modal.Root
      opened={opened}
      onClose={onClose}
      size={WIDTHS[size]}
      centered
      zIndex={Z_INDEX.modal}
      closeOnClickOutside={closeOnClickOutside}
      closeOnEscape={false}
      returnFocus={!returnFocusTo && !onExited}
      onExitTransitionEnd={exited}
      // On the content alone: Modal.Content's className would also land on
      // the full-window layer that centres it (Mantine 8.3.18)
      classNames={{ content: classes.content }}
    >
      <Modal.Overlay />
      <Modal.Content ref={contentRef}>
        <Modal.Header className={classes.header} data-with-close={role === 'dialog' ? '' : undefined}>
          <Modal.Title className={classes.title}>{title}</Modal.Title>
        </Modal.Header>
        {/* Mantine points aria-describedby at its Modal body: only the description */}
        {description && <Modal.Body className={classes.description}>{description}</Modal.Body>}
        {children != null && <div className={classes.body}>{children}</div>}
        {footer && <div className={classes.footer}>{footer}</div>}
        {role === 'dialog' && <Modal.CloseButton className={classes.close} aria-label={name} />}
      </Modal.Content>
    </Modal.Root>
  );
}
