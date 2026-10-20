import type { PortalOrigin } from './use-sign-mode'

/** Every entry point opens the portal at the same visible dock icon. */
export function signPortalOrigin(): PortalOrigin {
  const rect = document.querySelector('[data-sign-portal-origin]')?.getBoundingClientRect()
  return rect ? { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 }
    : { x: innerWidth / 2, y: innerHeight - 48 }
}
