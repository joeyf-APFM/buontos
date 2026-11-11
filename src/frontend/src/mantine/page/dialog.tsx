import { useCallback, useLayoutEffect, useRef, type ReactNode, type RefObject } from 'react';
import { useTranslation } from 'react-i18next';
import { Modal } from '@mantine/core';
import { alertDialogRole } from '@/mantine/alert-dialog-role';
import { dropdownTarget, focusIsFree } from '@/mantine/focus-free';
import { useLayeredEscape } from '@/mantine/use-layered-escape';
import { Z_INDEX } from '@/mantine/z-index';
import classes from './dialog.module.css';

const WIDTHS = { sm: 420, md: 560, lg: 720, xl: 960 } as const;

/**
 * The element to give focus back to: the one that had it when the dialog
 * opened, or, for a control in a floating dropdown (a Menu item, a Popover's
 * button), which goes with the dropdown, the dropdown's target. None for the
 * body, or for focus already inside this dialog.
 */
function openerOf(active: Element | null, own: HTMLElement | null): HTMLElement | null {
  if (!(active instanceof HTMLElement) || active === document.body) return null;
  if (own?.contains(active)) return null;
  return dropdownTarget(active) ?? active;
}

/**
 * The content refs of the kit dialogs whose `opened` is true now. A dialog
 * on its way out isn't in it, though its content is still in the DOM.
 */
const openDialogs = new Set<RefObject<HTMLElement | null>>();

/** Whether a kit dialog other than `own` is open now (a newer one took over, as on a 409). */
function otherDialogOpen(own: RefObject<HTMLElement | null>): boolean {
  return [...openDialogs].some((ref) => ref !== own);
}

/** Whether `node` is in the content of a kit dialog that's open now. */
function inOpenDialog(node: Element): boolean {
  const host = node.closest(`.${classes.content}`);
  return !!host && [...openDialogs].some((ref) => ref.current === host);
}

/**
 * Whether focus is in another kit dialog that's closing too (a confirm whose
 * button closed it and its form): it goes to the body once that one leaves.
 */
function focusInClosingDialog(closed: HTMLElement | null): boolean {
  const host = document.activeElement?.closest(`.${classes.content}`);
  return !!host && host !== closed && !inOpenDialog(host);
}

/** About a second of frames: longer than any dialog's exit. */
const SETTLE_FRAMES = 60;

export interface DialogProps {
  opened: boolean;
  onClose: () => void;
  title: ReactNode;
  /** Rendered as the accessible description, under the title. */
  description?: ReactNode;
  /** 420 / 560 / 720 / 960 px. @default 'md' */
  size?: 'sm' | 'md' | 'lg' | 'xl';
  /**
   * A fixed height, such as '80vh', for content that loads after opening, so
   * the dialog doesn't grow and re-centre. Still capped at the window less
   * 2rem above and below. @default the content's height
   */
  height?: string;
  /** `alertdialog` for confirms: no corner close, a response is needed. @default 'dialog' */
  role?: 'dialog' | 'alertdialog';
  /**
   * Focus goes here once the dialog has closed, if `focusIsFree` says it may.
   * Only for an opener that unmounts: by default the kit gives focus back to
   * the element that opened the dialog.
   */
  returnFocusTo?: RefObject<HTMLElement | null>;
  /** The right-aligned action row, under the body. */
  footer?: ReactNode;
  /** @default false, as the Radix dialogs (and waves 0–1) */
  closeOnClickOutside?: boolean;
  /**
   * Called once the dialog has closed and its exit transition has ended,
   * with its content element, for a caller that puts focus back itself
   * (such as after a reload). With it, the kit gives no focus back.
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
 * - The title and the footer stay in view: content taller than the window
 *   scrolls inside the body.
 * - Focus goes back to the opener once the dialog has closed (ruling R41),
 *   never through Mantine's own return, which ignores where focus is: only
 *   if the opener is still there, focus is free (`focusIsFree`), the page
 *   hasn't moved on (the location at open), and no other kit dialog took
 *   over (one is open and the opener isn't inside a kit dialog: the version
 *   prompt a 409 opens). "Open" means `opened` is true, not merely in the
 *   DOM; while another dialog that's closing too still holds focus (a
 *   confirm that closed itself and its form), the check waits for it to
 *   leave. It's checked a frame after the exit, so a dialog
 *   that took over with no transition has its focus by then.
 */
export function Dialog({
  opened,
  onClose,
  title,
  description,
  size = 'md',
  height,
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

  // The opener and the location, recorded as the dialog opens (also when it
  // mounts open): before the Modal mounts its content, a render later
  const opener = useRef<HTMLElement | null>(null);
  const openedAt = useRef<string | null>(null);
  useLayoutEffect(() => {
    if (!opened) return;
    opener.current = openerOf(document.activeElement, content.current);
    openedAt.current = window.location.href;
    openDialogs.add(content);
    return () => {
      openDialogs.delete(content);
    };
  }, [opened]);

  const exited = () => {
    onExited?.(content.current);
    // A caller that puts focus back itself owns it
    if (onExited) return;
    const target = returnFocusTo?.current ?? opener.current;
    const closed = content.current;
    const at = openedAt.current;
    const check = (framesLeft: number) => {
      if (!target?.isConnected || window.location.href !== at) return;
      // An opener in a kit dialog gets focus only while that one is open (not
      // when it's closing too). One outside them gets it only if no other kit
      // dialog is open: that one took over (the version prompt on a 409).
      if (target.closest(`.${classes.content}`) ? !inOpenDialog(target) : otherDialogOpen(content)) return;
      // A dialog closing with this one still holds focus: wait for it to go
      if (focusInClosingDialog(closed) && framesLeft > 0) {
        window.requestAnimationFrame(() => check(framesLeft - 1));
        return;
      }
      if (focusIsFree(closed)) target.focus({ preventScroll: true });
    };
    window.requestAnimationFrame(() => check(SETTLE_FRAMES));
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
      // The kit gives focus back itself (exited, above)
      returnFocus={false}
      onExitTransitionEnd={exited}
      // On the content alone: Modal.Content's className would also land on
      // the full-window layer that centres it (Mantine 8.3.18)
      classNames={{ content: classes.content }}
    >
      <Modal.Overlay />
      <Modal.Content ref={contentRef} style={height ? { height } : undefined}>
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
