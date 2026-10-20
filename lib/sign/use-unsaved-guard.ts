'use client'

import { useCallback, useEffect } from 'react'

const LEAVE_MESSAGE = 'You have recordings that are not saved yet. Leave and lose them?'

/**
 * Warns before a reload, tab close or in-app link drops recordings that only
 * exist in memory after a failed save. The returned handler cancels a link
 * click when the user chooses to stay, and returns whether leaving goes ahead.
 */
export function useUnsavedGuard(unsaved: boolean) {
  useEffect(() => {
    if (!unsaved) return
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = '' }
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [unsaved])
  return useCallback((event: { preventDefault(): void }) => {
    if (!unsaved || window.confirm(LEAVE_MESSAGE)) return true
    event.preventDefault()
    return false
  }, [unsaved])
}
