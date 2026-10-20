import { type RefObject, useEffect, useRef } from 'react'

const FOCUSABLE = 'a[href], area[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), summary, [tabindex]:not([tabindex="-1"])'

function focusableIn(container: HTMLElement) {
  return Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE)).filter((element) => element.getClientRects().length > 0)
}

/**
 * Modal behaviour for a dialog element: move focus inside on open, keep Tab and
 * Shift+Tab inside, close on Escape, and return focus to the opener on close.
 * The caller makes the page behind the dialog `inert`.
 */
export function useModalDialog(open: boolean, dialogRef: RefObject<HTMLElement | null>, onClose: () => void) {
  const onCloseRef = useRef(onClose)
  useEffect(() => { onCloseRef.current = onClose }, [onClose])

  useEffect(() => {
    if (!open) return
    const dialog = dialogRef.current
    if (!dialog) return
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null
    const items = focusableIn(dialog)
    const initial = items.find((element) => element.matches('input, select, textarea')) ?? items[0] ?? dialog
    initial.focus({ preventScroll: true })

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        onCloseRef.current()
        return
      }
      if (event.key !== 'Tab') return
      const controls = focusableIn(dialog)
      if (!controls.length) {
        event.preventDefault()
        dialog.focus()
        return
      }
      const first = controls[0]
      const last = controls[controls.length - 1]
      const active = document.activeElement
      const outside = !active || !dialog.contains(active)
      if (event.shiftKey && (outside || active === first)) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && (outside || active === last)) {
        event.preventDefault()
        first.focus()
      }
    }
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('keydown', onKeyDown)
      if (opener?.isConnected) opener.focus({ preventScroll: true })
    }
  }, [open, dialogRef])
}
