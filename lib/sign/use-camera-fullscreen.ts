'use client'

import { useCallback, useEffect, useRef, useState, type RefObject } from 'react'

/** Expand the entire signing surface so captions and controls stay with video. */
export function useCameraFullscreen(active: boolean, surface: RefObject<HTMLElement | null>) {
  const [expanded, setExpanded] = useState(false)
  const [pending, setPending] = useState(false)
  const [notice, setNotice] = useState('')
  const buttonRef = useRef<HTMLButtonElement | null>(null)
  const expandedRef = useRef(false)
  const generation = useRef(0)
  const lastExit = useRef(0)
  const restoreFocus = useCallback(() => requestAnimationFrame(() => buttonRef.current?.focus({ preventScroll: true })), [])
  const leave = useCallback(async () => {
    generation.current++
    expandedRef.current = false
    setExpanded(false); setNotice(''); setPending(false)
    lastExit.current = Date.now()
    if (surface.current && document.fullscreenElement === surface.current) {
      try { await document.exitFullscreen() } catch { /* The browser may have already exited. */ }
    }
    restoreFocus()
  }, [restoreFocus, surface])

  useEffect(() => {
    if (!active) return
    const element = surface.current
    const change = () => {
      const full = !!element && document.fullscreenElement === element
      if (!full && expandedRef.current) { lastExit.current = Date.now(); restoreFocus() }
      expandedRef.current = full; setExpanded(full); setNotice('')
    }
    // Capture Escape before the camera dialog's close handler. Some browsers
    // exit native fullscreen before dispatching keydown; guard that exit too.
    const escape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      if (expandedRef.current || document.fullscreenElement === surface.current || Date.now() - lastExit.current < 350) {
        event.preventDefault(); event.stopImmediatePropagation()
        if (expandedRef.current || document.fullscreenElement) void leave()
      }
    }
    document.addEventListener('fullscreenchange', change)
    window.addEventListener('keydown', escape, true)
    return () => {
      generation.current++; expandedRef.current = false
      setExpanded(false); setPending(false); setNotice('')
      document.removeEventListener('fullscreenchange', change)
      window.removeEventListener('keydown', escape, true)
      if (element && document.fullscreenElement === element) void document.exitFullscreen().catch(() => {})
    }
  }, [active, leave, restoreFocus, surface])

  const toggle = async () => {
    if (!active || pending) return
    if (expandedRef.current) { await leave(); return }
    const element = surface.current
    if (!element) return
    const ticket = ++generation.current
    setPending(true)
    try {
      if (!element.requestFullscreen || !document.fullscreenEnabled) throw new Error('Fullscreen unavailable')
      await element.requestFullscreen()
      if (ticket !== generation.current) {
        if (document.fullscreenElement === element) await document.exitFullscreen()
        return
      }
      expandedRef.current = true; setExpanded(true); setNotice('')
    } catch {
      if (ticket !== generation.current) return
      expandedRef.current = true; setExpanded(true)
      setNotice('Expanded view. Browser fullscreen is unavailable here; press Escape or Exit expanded view to return.')
    } finally { if (ticket === generation.current) setPending(false) }
  }
  return { expanded, pending, notice, buttonRef, toggle }
}
