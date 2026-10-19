'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { AnimatePresence, LayoutGroup, motion, useMotionTemplate, useMotionValue, useSpring } from 'motion/react'
import { usePrefersReducedMotion } from '@/lib/sign/use-reduced-motion'
import { ArrowUpRight, Camera, CameraOff, Check, Hand, LoaderCircle, LockKeyhole, RotateCcw, ShieldCheck, Upload, X } from 'lucide-react'
import type { CameraStatus, PortalOrigin } from '@/lib/sign/use-sign-mode'
import { useSignRecognition } from '@/lib/sign/use-sign-recognition'
import type { TranscriptToken } from '@/lib/sign/types'
import { HandOverlay } from './hand-overlay'
import { Transcript } from './transcript'
import { MAX_SAMPLE_FILE_BYTES } from '@/lib/sign/sample-store'
import { appendRecognizedToken } from '@/lib/sign/transcript-tokens'

const messages = {
  primer: ['A little space for your hands.', 'Video never leaves your device; hand tracking runs locally. We only ask for your camera, never your microphone.'],
  idle: ['Your hands have a voice.', 'Start your camera when you’re ready. Keep both hands in view, with a little room to move.'],
  requesting: ['Opening your camera…', 'Choose Allow in your browser’s camera prompt. Your preview stays on this device.'],
  denied: ['Your camera needs an invitation.', 'Open the site controls beside your browser’s address bar, allow Camera, then try again. If needed, allow your browser in your device’s camera privacy settings.'],
  missing: ['No camera found.', 'Connect a camera, or try this page on a phone or laptop with a built-in camera.'],
  unsupported: ['Let’s find a camera-friendly window.', 'Open this page over HTTPS (or localhost) in a browser that supports camera access.'],
  busy: ['Your camera is taking a moment.', 'Close any other app using the camera, check your device’s camera settings, then try again.'],
  paused: ['Take your time. We’re paused.', 'Your camera is off after leaving the page or a camera interruption. Resume when you’re ready to bring your hands back into the conversation.'],
  live: ['', ''],
} satisfies Record<CameraStatus, [string, string]>

export function SignStage({ active, status, origin, attachVideo, onAccept, onRetry, onClose }: {
  active: boolean; status: CameraStatus; origin: PortalOrigin
  attachVideo: (video: HTMLVideoElement | null) => void
  onAccept: () => void; onRetry: () => void; onClose: () => void
}) {
  const reduced = usePrefersReducedMotion()
  const [viewport, setViewport] = useState({ width: 0, height: 0 })
  const [offline, setOffline] = useState(false)
  const [tokens, setTokens] = useState<TranscriptToken[]>([])
  const [importError, setImportError] = useState('')
  const [kind, setKind] = useState<'static' | 'words'>('static')
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const ringRef = useRef<SVGCircleElement | null>(null)
  const manualId = useRef(0)
  const stageRef = useRef<HTMLElement | null>(null)
  const frameRef = useRef<HTMLDivElement | null>(null)
  const onCommit = useCallback((token: TranscriptToken) => setTokens((current) => appendRecognizedToken(current, token, kind === 'words')), [kind])
  const attach = useCallback((video: HTMLVideoElement | null) => { videoRef.current = video; attachVideo(video) }, [attachVideo])
  const live = status === 'live'
  const recognition = useSignRecognition({ active, live, videoRef, canvasRef, ringRef, onCommit, kind })
  const { model, snapshot } = recognition
  const dataset = recognition.dataset.kind === kind ? recognition.dataset : { ...recognition.dataset, loading: true, labels: 0, samples: 0, readySigns: [], error: '' }
  const words = kind === 'words'
  useEffect(() => { if (new URLSearchParams(location.search).get('recognizer') === 'words') setKind('words') }, [])
  const chooseKind = (value: 'static' | 'words') => {
    setKind(value); setImportError('')
    const url = new URL(location.href)
    if (value === 'words') url.searchParams.set('recognizer', 'words')
    else url.searchParams.delete('recognizer')
    history.replaceState(null, '', url)
  }
  useEffect(() => {
    if (!active) return
    // The stage can arrive after its lazy bundle; establish focus on mount too.
    const frame = requestAnimationFrame(() => stageRef.current?.querySelector<HTMLButtonElement>('.sign-stage-close')?.focus({ preventScroll: true }))
    return () => cancelAnimationFrame(frame)
  }, [active])
  useEffect(() => {
    if (!active) return
    const pip = document.querySelector<HTMLElement>('.sign-avatar-pip')
    const stage = stageRef.current
    if (!pip || !stage || !frameRef.current) return
    const position = () => {
      const frame = frameRef.current!.getBoundingClientRect()
      const mobile = innerWidth < 1000
      const top = Math.max(80, frame.top + 18)
      pip.style.setProperty('--sign-pip-visible', live && frame.bottom > (mobile ? top + 145 : 200) ? '1' : '0')
      pip.style.setProperty('--sign-pip-top', mobile ? `${top}px` : 'auto')
      pip.style.setProperty('--sign-pip-right', mobile ? `${Math.max(18, innerWidth - frame.right + 18)}px` : '24px')
      pip.style.setProperty('--sign-pip-bottom', mobile ? 'auto' : '105px')
    }
    const resize = new ResizeObserver(position)
    resize.observe(frameRef.current)
    position(); stage.addEventListener('scroll', position, { passive: true }); window.addEventListener('resize', position)
    return () => {
      resize.disconnect(); stage.removeEventListener('scroll', position); window.removeEventListener('resize', position)
      ;['visible', 'top', 'right', 'bottom'].forEach((name) => pip.style.removeProperty(`--sign-pip-${name}`))
    }
  }, [active, live])
  useEffect(() => {
    const resize = () => setViewport({ width: innerWidth, height: innerHeight })
    const network = () => setOffline(!navigator.onLine)
    resize(); network()
    window.addEventListener('resize', resize)
    window.addEventListener('online', network); window.addEventListener('offline', network)
    return () => {
      window.removeEventListener('resize', resize)
      window.removeEventListener('online', network); window.removeEventListener('offline', network)
    }
  }, [])
  const radius = Math.ceil(Math.hypot(Math.max(origin.x, viewport.width - origin.x), Math.max(origin.y, viewport.height - origin.y))) + 20
  const revealTarget = useMotionValue(0)
  const revealRadius = useSpring(revealTarget, { stiffness: 85, damping: 22 })
  const portalClip = useMotionTemplate`circle(${revealRadius}px at ${origin.x}px ${origin.y}px)`
  useEffect(() => { revealTarget.set(active ? radius : 0) }, [active, radius, revealTarget])
  const [title, copy] = messages[status]
  const Icon = status === 'primer' ? ShieldCheck : status === 'requesting' ? LoaderCircle : status === 'idle' || status === 'paused' ? Camera : CameraOff
  const holding = live && snapshot.phase === 'holding' && !!snapshot.label
  const handLocked = live && !!snapshot.label && (holding || snapshot.phase === 'committed')
  const trackingCopy = model === 'unavailable' ? 'Hand tracking unavailable · retry above'
    : model === 'loading' ? 'Warming up your hand tracker'
    : !snapshot.handCount ? 'Bring your hands into frame'
    : dataset.loading ? 'Preparing sign recognition…'
    : !dataset.labels ? 'Recognition is taking a moment · retry below'
    : snapshot.phase === 'committed' ? `${snapshot.label} added · ${words ? 'lower your hands before the next word' : 'release or change sign'}`
    : holding ? `Hold ${snapshot.label}${words ? ' at its finish' : ' steady'}`
    : words ? 'Sign a supported word in about 2 seconds, then hold its finish. Lower hands between words.' : 'Keep the sign steady · check the supported signs below'
  return <LayoutGroup id="sign-live"><motion.section ref={stageRef} id="sign-stage" className={`sign-stage ${live ? 'is-live' : ''} ${handLocked ? 'has-hand-lock' : ''}`}
    aria-labelledby="sign-stage-title" aria-hidden={!active} inert={!active}
    style={{ pointerEvents: active ? 'auto' : 'none', clipPath: reduced ? 'none' : portalClip }} initial={false}
    animate={{ opacity: active ? 1 : 0 }}
    transition={{ opacity: { duration: reduced ? .15 : .18, delay: active || reduced ? 0 : .3 } }}>
    <header className="sign-stage-header">
      <a className="sign-wordmark" href="#top" onClick={(event) => { event.preventDefault(); onClose() }}>yap <span>&amp;</span> render</a>
      <span className="sign-beta">Beta · {dataset.loading ? 'Preparing recognition' : `${dataset.labels} ${words ? 'words' : 'signs'} ready`}</span>
      <button type="button" className="sign-stage-close" aria-label="Close Sign to Text" onClick={onClose}><X size={20} /></button>
    </header>
    <div className="sign-stage-heading">
      <p className="eyebrow"><span className="eyebrow-dot" /> The other side of the conversation</p>
      <h2 id="sign-stage-title">You Sign. <em>We Speak.</em></h2>
      <p>A little movement. A whole new way to be heard.</p>
      <div className="sign-recognition-modes" role="group" aria-label="Recognition vocabulary">
        <button type="button" aria-pressed={!words} onClick={() => chooseKind('static')}>Letters &amp; numbers</button>
        <button type="button" aria-pressed={words} onClick={() => chooseKind('words')}>Words <span>Beta</span></button>
      </div>
    </div>
    <motion.div ref={frameRef} className="sign-viewfinder" initial={false}
      animate={{ scale: active && !reduced ? 1 : reduced ? 1 : 1.06, opacity: active ? 1 : 0 }}
      transition={{ type: 'spring', stiffness: 130, damping: 24, delay: active && !reduced ? .14 : 0 }}>
      <video ref={attach} autoPlay playsInline muted className="sign-camera-video" aria-label="Mirrored camera preview" />
      <HandOverlay canvasRef={canvasRef} />
      <div className="sign-camera-shade" />
      <div className={`sign-model-chip ${model === 'loading' ? 'is-loading' : ''}`} role="status">
        {model === 'loading' ? <LoaderCircle size={13} className="sign-spinner" /> : model === 'ready' ? <Check size={13} /> : <CameraOff size={13} />}
        <span>{model === 'loading' ? 'Loading hand model…' : model === 'ready' ? 'Hand model ready' : 'Hand model unavailable · preview still works'}</span>
        {model === 'unavailable' && <button type="button" aria-label="Retry hand tracking" onClick={recognition.retry}><RotateCcw size={13} /></button>}
      </div>
      <div className="sign-brackets" aria-hidden="true">
        {[0, 1, 2, 3].map((i) => <svg key={i} className={`sign-corner sign-corner-${i}`} viewBox="0 0 32 32"><motion.path d="M 1 31 V 1 H 31" strokeDasharray="60" initial={false} animate={{ strokeDashoffset: active ? 0 : 60 }} transition={{ delay: active && !reduced ? .3 + i * .08 : 0, duration: reduced ? 0 : .45 }} /></svg>)}
      </div>
      {active && live && !reduced && <motion.div key="scan" className="sign-scan-sweep" initial={{ y: '-100%' }} animate={{ y: '0%' }} transition={{ duration: 1.4, delay: .2 }}><motion.div className="sign-scan-line" initial={{ opacity: 0 }} animate={{ opacity: [0, .7, 0] }} transition={{ duration: 1.4, delay: .2 }} /></motion.div>}
      <AnimatePresence mode="wait">
        {!live && <motion.div key={status} className="sign-camera-message" role="status" initial={{ opacity: 0, y: reduced ? 0 : 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: .18 }}>
          <span className="sign-message-icon"><Icon size={27} strokeWidth={1.4} className={status === 'requesting' ? 'sign-spinner' : ''} /></span>
          <h3>{title}</h3><p>{copy}</p>
          {status !== 'requesting' && status !== 'unsupported' && <button type="button" className="sign-camera-button" onClick={status === 'primer' ? onAccept : onRetry}>
            {status === 'primer' ? 'Got it. Open my camera' : status === 'paused' ? 'Resume camera' : status === 'idle' ? 'Open my camera' : 'Try camera again'} <ArrowUpRight size={17} />
          </button>}
          {status === 'primer' && <span className="sign-permission-note"><LockKeyhole size={11} /> Just you, your camera, and your browser.</span>}
        </motion.div>}
      </AnimatePresence>
      {live && <div className="sign-preview-hint" role="status"><span className="dock-live-dot" /> {trackingCopy}</div>}
      <div className={`sign-hold-indicator ${holding ? 'is-holding' : ''}`} aria-hidden="true">
        <svg viewBox="0 0 64 64"><circle className="sign-ring-track" cx="32" cy="32" r="26" /><circle ref={ringRef} className="sign-ring-progress" cx="32" cy="32" r="26" strokeDasharray={2 * Math.PI * 26} strokeDashoffset={2 * Math.PI * 26} /></svg>
        <AnimatePresence>{holding && <motion.span key={snapshot.tokenId} layoutId={reduced || words ? undefined : `sign-token-${snapshot.tokenId}`} className={`sign-candidate ${words ? 'is-word' : ''}`} initial={{ scale: reduced ? 1 : .8, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ opacity: 0 }} transition={{ type: 'spring', stiffness: 260, damping: 20 }}>{snapshot.label}</motion.span>}</AnimatePresence>
      </div>
      <span className="sign-frame-index" aria-hidden="true">01 / YOUR SIDE</span>
    </motion.div>
    <aside className={`sign-dataset-notice ${dataset.labels ? 'has-samples' : ''}`} aria-label="Recognition status">
      <div><strong>{dataset.loading ? 'Getting recognition ready…' : dataset.labels ? `${dataset.labels} ${words ? 'ISL words' : 'ISL signs'} ready to recognize` : 'Recognition could not start'}</strong><p>{dataset.labels ? (words ? 'Sign in about 2 seconds, hold the finish briefly, then lower your hands.' : 'Keep both hands fully in view. Hold a supported sign steady until it appears in your text.') : dataset.loading ? 'Your built-in sign library is loading automatically.' : 'Please retry recognition. You can also use Edit text while it reconnects.'}</p>
        {dataset.labels > 0 && <details className="sign-ready-signs"><summary>See supported {words ? 'words' : 'letters & numbers'}</summary><p>{dataset.readySigns.join(' · ')}</p></details>}
        {!dataset.loading && !dataset.labels && <button type="button" className="sign-import-button" onClick={recognition.retry}><RotateCcw size={13} /> Retry recognition</button>}
        {dataset.error && <p className="sign-import-error" role="status">{dataset.error}</p>}
      </div>
      <details className="sign-personalize"><summary>Personalize recognition</summary><div className="sign-dataset-actions"><Link href={words ? '/sign/train/words' : '/sign/train'} onClick={() => onClose()}>Training Studio <ArrowUpRight size={13} /></Link><label className="sign-import-button"><Upload size={13} /> Import {words ? 'words' : 'samples'}<input type="file" accept="application/json,.json" aria-label={words ? 'Import ISL word recordings' : 'Import ISL training samples'} onChange={async (event) => {
        const file = event.target.files?.[0]
        event.target.value = ''
        if (!file) return
        try {
          if (file.size > (words ? 12 * 1024 * 1024 : MAX_SAMPLE_FILE_BYTES)) throw new Error(`Choose a JSON file smaller than ${words ? 12 : 25} MB.`)
          await recognition.importSamples(JSON.parse(await file.text())); setImportError('')
        } catch (error) { setImportError(error instanceof Error ? error.message : 'Sample file could not be read.') }
      }} /></label></div></details>
      {(importError || (!dataset.labels && dataset.samples > 0)) && <p className="sign-import-error" role="status">{importError || `${dataset.samples} samples imported. Add at least 3 real samples per label before recognition can start.`}</p>}
      {dataset.labels > 0 && <span className="sign-session-note">Built-in signs load automatically. Optional personal recordings stay on this device.</span>}
    </aside>
    <Transcript active={active} tokens={tokens} wordMode={words}
      onSpace={() => setTokens((current) => current.length < 1200 ? [...current, { id: `manual-${++manualId.current}`, text: ' ' }] : current)}
      onBackspace={() => setTokens((current) => current.slice(0, -1))} onClear={() => setTokens([])}
      onEdit={(text) => setTokens(Array.from(text).slice(0, 1200).map((char) => ({ id: `manual-${++manualId.current}`, text: char })))} />
    <div className="sign-stage-footer">
      <span><ShieldCheck size={14} /> Private by design · video stays on your device</span>
      <span><Hand size={14} /> {words ? 'On-device word motions · experimental personal vocabulary' : 'On-device fingerspelling · static signs'}</span>
      {offline && <span role="status">You’re offline. Loaded models and imported samples still work; AI sentence cleanup needs a connection.</span>}
    </div>
  </motion.section></LayoutGroup>
}
