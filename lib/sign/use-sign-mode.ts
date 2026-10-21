'use client'

import { useCallback, useEffect, useRef, useState } from 'react'

export type PortalOrigin = { x: number; y: number }
export type CameraStatus = 'idle' | 'primer' | 'requesting' | 'live' | 'denied' | 'missing' | 'unsupported' | 'busy' | 'paused'
const PRIVACY_KEY = 'yap-render-camera-privacy-v1'

function hasConsent() {
  try { return localStorage.getItem(PRIVACY_KEY) === 'accepted' } catch { return false }
}

export function warmSignModel() {
  // Neither importing nor initialising the model requests camera access.
  void import('./hand-tracker').then(({ warmHandTracker }) => warmHandTracker()).catch(() => {})
}

export function useSignMode({ surface = 'stage' }: { surface?: 'stage' | 'training' } = {}) {
  const pageMode = surface === 'stage'
  const [active, setActive] = useState(false)
  const [status, setStatus] = useState<CameraStatus>('idle')
  const [origin, setOrigin] = useState<PortalOrigin>({ x: 0, y: 0 })
  const streamRef = useRef<MediaStream | null>(null)
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const generation = useRef(0)
  const activeRef = useRef(false)
  const privacyAcceptedRef = useRef(false)
  const statusRef = useRef(status)
  statusRef.current = status
  const returnFocusRef = useRef<HTMLElement | null>(null)

  const stopCamera = useCallback(() => {
    generation.current += 1
    streamRef.current?.getTracks().forEach((track) => {
      track.onended = null
      track.onmute = null
      track.stop()
    })
    streamRef.current = null
    if (videoRef.current) videoRef.current.srcObject = null
  }, [])

  // Both the immediate and the late (lazy stage) attachment use this, so a
  // preview that cannot play always releases the camera and asks for a retry.
  const playPreview = useCallback(async (video: HTMLVideoElement, stream: MediaStream, ticket: number) => {
    if (video.srcObject !== stream) video.srcObject = stream
    try {
      await video.play()
    } catch (error) {
      // A newer load of the same element replaced this play() call.
      if (error instanceof Error && error.name === 'AbortError') return
      if (ticket !== generation.current) return
      stopCamera()
      setStatus('busy')
      throw error
    }
  }, [stopCamera])

  const requestCamera = useCallback(async () => {
    stopCamera()
    if (!activeRef.current) return
    if (!privacyAcceptedRef.current && !hasConsent()) { setStatus('primer'); return }
    privacyAcceptedRef.current = true
    if (document.hidden) { setStatus('paused'); return }
    if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
      setStatus('unsupported')
      return
    }
    const ticket = generation.current
    setStatus('requesting')
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'user', width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: false,
      })
      // A permission prompt can resolve after exit, a retry, or backgrounding.
      if (ticket !== generation.current || !activeRef.current || document.hidden) {
        stream.getTracks().forEach((track) => track.stop())
        return
      }
      streamRef.current = stream
      // Listen before play(): camera loss can happen while playback is pending.
      // Muted tracks have stopped delivering usable frames; require a fresh tap
      // rather than leaving a frozen preview and recognition marked as live.
      const pause = () => {
        if (ticket !== generation.current) return
        stopCamera()
        setStatus('paused')
      }
      const tracks = stream.getVideoTracks()
      if (!tracks.length || tracks.some((track) => track.readyState === 'ended')) { pause(); return }
      tracks.forEach((track) => { track.onended = pause; track.onmute = pause })
      // Without a video yet, the lazily loaded stage attaches and plays it.
      if (videoRef.current) await playPreview(videoRef.current, stream, ticket)
      if (ticket !== generation.current) return
      setStatus('live')
    } catch (error) {
      if (ticket !== generation.current) return
      stopCamera()
      const name = error instanceof Error ? error.name : ''
      setStatus(name === 'NotAllowedError' || name === 'SecurityError' ? 'denied'
        : name === 'NotFoundError' || name === 'OverconstrainedError' ? 'missing' : 'busy')
    }
  }, [playPreview, stopCamera])

  const updateUrl = useCallback((sign: boolean) => {
    if (!pageMode) return
    const url = new URL(window.location.href)
    if (sign) url.searchParams.set('mode', 'sign')
    else url.searchParams.delete('mode')
    if (url.href !== window.location.href) window.history.pushState(null, '', url)
  }, [pageMode])

  const close = useCallback((writeUrl = true) => {
    stopCamera() // The camera light goes off before the reverse animation starts.
    activeRef.current = false
    setActive(false)
    setStatus('idle')
    if (writeUrl) updateUrl(false)
    requestAnimationFrame(() => returnFocusRef.current?.focus({ preventScroll: true }))
  }, [stopCamera, updateUrl])

  const open = useCallback((point: PortalOrigin, explicit = true) => {
    if (explicit) updateUrl(true)
    const consent = privacyAcceptedRef.current || hasConsent()
    privacyAcceptedRef.current = consent
    if (activeRef.current) {
      if (explicit && consent && (statusRef.current === 'idle' || statusRef.current === 'paused')) void requestCamera()
      return
    }
    setOrigin(point)
    returnFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null
    activeRef.current = true
    setActive(true)
    warmSignModel()
    setStatus(consent ? 'idle' : 'primer')
    // Deep links select the mode; only a deliberate user action starts video.
    if (explicit && consent) void requestCamera()
  }, [requestCamera, updateUrl])

  const acceptPrivacy = useCallback(() => {
    privacyAcceptedRef.current = true
    try { localStorage.setItem(PRIVACY_KEY, 'accepted') } catch { /* Session still works without storage. */ }
    void requestCamera()
  }, [requestCamera])

  const attachVideo = useCallback((video: HTMLVideoElement | null) => {
    videoRef.current = video
    if (video && streamRef.current) void playPreview(video, streamRef.current, generation.current).catch(() => {})
  }, [playPreview])

  useEffect(() => {
    const syncUrl = () => {
      if (new URLSearchParams(window.location.search).get('mode') === 'sign') {
        const icon = document.querySelector('[data-sign-portal-origin]')
        const rect = icon?.getBoundingClientRect()
        open({ x: rect ? rect.left + rect.width / 2 : innerWidth / 2, y: rect ? rect.top + rect.height / 2 : innerHeight - 48 }, false)
      } else close(false)
    }
    if (pageMode) {
      syncUrl()
      window.addEventListener('popstate', syncUrl)
    }
    const suspend = () => {
      if (activeRef.current) {
        stopCamera()
        setStatus(privacyAcceptedRef.current ? 'paused' : 'primer')
      }
    }
    const visibility = () => { if (document.hidden) suspend() }
    document.addEventListener('visibilitychange', visibility)
    // A page may enter the back/forward cache without React unmounting.
    window.addEventListener('pagehide', suspend)
    return () => {
      activeRef.current = false
      stopCamera()
      window.removeEventListener('popstate', syncUrl)
      document.removeEventListener('visibilitychange', visibility)
      window.removeEventListener('pagehide', suspend)
    }
  }, [close, open, stopCamera, pageMode])

  useEffect(() => {
    if (!active || !pageMode) return
    const previous = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const focusTimer = requestAnimationFrame(() => document.querySelector<HTMLButtonElement>('.sign-stage-close')?.focus({ preventScroll: true }))
    const escape = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !event.defaultPrevented && !document.fullscreenElement) close()
      if (event.key === 'Tab') {
        const controls = Array.from(document.querySelectorAll<HTMLElement>('.sign-stage a[href], .sign-stage button:not(:disabled), .sign-stage input:not(:disabled), .sign-stage select:not(:disabled), .sign-stage textarea:not(:disabled), .sign-stage summary, .sign-stage [tabindex]:not([tabindex="-1"]), .sign-pip-open, .sign-pip-confirm button, .mode-dock button')).filter((element) => element.getClientRects().length > 0 && !(element.closest('.mode-dock') && document.querySelector('.sign-stage.is-expanded')))
        const index = controls.indexOf(document.activeElement as HTMLElement)
        if (!controls.length) return
        // Focus on another control inside the stage or dock keeps normal tab order;
        // only focus that escaped the dialog is pulled back in.
        if (index === -1 && document.activeElement?.closest('.sign-stage, .sign-pip-open, .sign-pip-confirm, .mode-dock')) return
        if (event.shiftKey && index <= 0) { event.preventDefault(); controls[controls.length - 1].focus() }
        else if (!event.shiftKey && (index === controls.length - 1 || index === -1)) { event.preventDefault(); controls[0].focus() }
      }
    }
    document.addEventListener('keydown', escape)
    return () => { cancelAnimationFrame(focusTimer); document.body.style.overflow = previous; document.removeEventListener('keydown', escape) }
  }, [active, close, pageMode])

  useEffect(() => {
    if (!pageMode) return
    // Let the hero paint before idle work; avoid contending with page startup.
    let idle: number | undefined
    const timer = window.setTimeout(() => {
      if ('requestIdleCallback' in window) idle = window.requestIdleCallback(warmSignModel)
      else warmSignModel()
    }, 4000)
    return () => {
      clearTimeout(timer)
      if (idle !== undefined) window.cancelIdleCallback(idle)
    }
  }, [pageMode])

  const pauseCamera = useCallback(() => {
    stopCamera()
    if (activeRef.current) setStatus('paused')
  }, [stopCamera])

  return { active, status, origin, open, close, acceptPrivacy, requestCamera, pauseCamera, attachVideo }
}
