import * as React from "react";

type FocusHandler = (event: Event) => void;

/**
 * Return focus to whatever opened a dialog, even when it was opened from state (`open` + `onOpenChange`) rather than
 * through a Radix `<DialogTrigger>`.
 *
 * Why: Radix restores focus on close only to its own Trigger. Dialogs opened by `setOpen(true)` from a plain button
 * therefore dropped focus to <body>, losing keyboard and screen-reader users (WCAG 2.4.3). We remember the focused
 * element when the dialog opens and focus it again on close, unless the caller already handled it.
 */
export function useReturnFocus(
  onOpenAutoFocus?: FocusHandler,
  onCloseAutoFocus?: FocusHandler,
) {
  const returnTo = React.useRef<HTMLElement | null>(null);

  const handleOpen = React.useCallback(
    (event: Event) => {
      const active = document.activeElement;
      returnTo.current =
        active instanceof HTMLElement && active !== document.body
          ? active
          : null;
      onOpenAutoFocus?.(event);
    },
    [onOpenAutoFocus],
  );

  const handleClose = React.useCallback(
    (event: Event) => {
      onCloseAutoFocus?.(event);
      if (event.defaultPrevented) return;
      const el = returnTo.current;
      returnTo.current = null;
      if (el && el.isConnected) {
        event.preventDefault();
        el.focus({ preventScroll: true });
      }
    },
    [onCloseAutoFocus],
  );

  return { onOpenAutoFocus: handleOpen, onCloseAutoFocus: handleClose };
}
