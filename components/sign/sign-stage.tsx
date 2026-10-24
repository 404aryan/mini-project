'use client'

import { useCallback, useEffect, useReducer, useRef, useState, type CSSProperties } from 'react'
import Link from 'next/link'
import { AnimatePresence, LayoutGroup, motion, useMotionTemplate, useMotionValue, useSpring } from 'motion/react'
import { usePrefersReducedMotion } from '@/lib/sign/use-reduced-motion'
import { ArrowUpRight, Camera, CameraOff, Check, Hand, LoaderCircle, LockKeyhole, Maximize, Minimize, FlipHorizontal2, Pause, RotateCcw, ShieldCheck, Upload, X } from 'lucide-react'
import type { CameraStatus, PortalOrigin } from '@/lib/sign/use-sign-mode'
import { useSignRecognition } from '@/lib/sign/use-sign-recognition'
import type { TranscriptToken } from '@/lib/sign/types'
import { HandOverlay } from './hand-overlay'
import { Transcript, TranscriptCaption } from './transcript'
import { MAX_SAMPLE_FILE_BYTES } from '@/lib/sign/sample-store'
import { emptyTranscript, transcriptReducer } from '@/lib/sign/transcript-tokens'
import { MAX_WORD_FILE_BYTES } from '@/lib/sign/word-data'
import { useCameraFullscreen } from '@/lib/sign/use-camera-fullscreen'
import { VocabularyCoverage } from './vocabulary-coverage'

const messages = {
  primer: ['A little space for your hands.', 'Video stays on this device. Hand, body and face tracking run locally. Camera only — no microphone.'],
  idle: ['Your hands have a voice.', 'Frame your head, elbows and both hands, with room to move. Recognition currently tracks hands.'],
  requesting: ['Opening your camera…', 'Choose Allow in your browser’s camera prompt. Your preview stays on this device.'],
  denied: ['Your camera needs an invitation.', 'Open the site controls beside your browser’s address bar, allow Camera, then try again. If needed, allow your browser in your device’s camera privacy settings.'],
  missing: ['No camera found.', 'Connect a camera, or try this page on a phone or laptop with a built-in camera.'],
  unsupported: ['Let’s find a camera-friendly window.', 'Open this page over HTTPS (or localhost) in a browser that supports camera access.'],
  busy: ['Your camera is taking a moment.', 'Close any other app using the camera, check your device’s camera settings, then try again.'],
  paused: ['Take your time. We’re paused.', 'Your camera is off. Resume when you’re ready to bring your hands back into the conversation.'],
  live: ['', ''],
} satisfies Record<CameraStatus, [string, string]>
const CAMERA_RATIO_KEY = 'yap-render-camera-ratio-v1'
const usableRatio = (ratio: number) => Number.isFinite(ratio) && ratio > .3 && ratio < 4

export function SignStage({ active, status, origin, attachVideo, onAccept, onRetry, onPause, onClose, onAvatarPreview }: {
  active: boolean; status: CameraStatus; origin: PortalOrigin
  attachVideo: (video: HTMLVideoElement | null) => void
  onAccept: () => void; onRetry: () => void; onPause: () => void; onClose: () => void
  /** Reports whether the avatar picture-in-picture is showing, so the page can make it clickable. */
  onAvatarPreview?: (visible: boolean) => void
}) {
  const reduced = usePrefersReducedMotion()
  const [viewport, setViewport] = useState({ width: 0, height: 0 })
  const [offline, setOffline] = useState(false)
  const [transcript, dispatchTranscript] = useReducer(transcriptReducer, emptyTranscript)
  const [importError, setImportError] = useState('')
  const [kind, setKind] = useState<'static' | 'words' | 'auto' | 'numbers'>('auto')
  const [bodyTracking, setBodyTracking] = useState(true)
  const [mirrored, setMirrored] = useState(true)
  const [showAvatar, setShowAvatar] = useState(false)
  /** The camera's own width / height. Once known, the frame keeps this shape instead of following the viewport. */
  const [cameraRatio, setCameraRatio] = useState<number | null>(null)
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const ringRef = useRef<SVGCircleElement | null>(null)
  const stageRef = useRef<HTMLElement | null>(null)
  const frameRef = useRef<HTMLDivElement | null>(null)
  const fullscreen = useCameraFullscreen(active, stageRef)
  const onCommit = useCallback((token: TranscriptToken) => dispatchTranscript({ type: 'commit', token, words: kind === 'words' }), [kind])
  const attach = useCallback((video: HTMLVideoElement | null) => { videoRef.current = video; attachVideo(video) }, [attachVideo])
  const live = status === 'live'
  const recognition = useSignRecognition({ active, live, videoRef, canvasRef, ringRef, onCommit, kind, bodyTracking })
  const { model, snapshot } = recognition
  const dataset = recognition.dataset.kind === kind ? recognition.dataset : { ...recognition.dataset, loading: true, labels: 0, samples: 0, readySigns: [], error: '' }
  const words = kind === 'words' || kind === 'auto'
  useEffect(() => {
    // The stage stays mounted, so Back/Forward must re-read the recognizer too.
    const sync = () => {
      const value = new URLSearchParams(location.search).get('recognizer')
      setKind(value === 'words' || value === 'static' || value === 'numbers' ? value : 'auto')
    }
    sync()
    window.addEventListener('popstate', sync)
    return () => window.removeEventListener('popstate', sync)
  }, [])
  const chooseKind = (value: 'static' | 'words' | 'auto' | 'numbers') => {
    setKind(value); setImportError('')
    const url = new URL(location.href)
    if (value === 'auto') url.searchParams.delete('recognizer')
    else url.searchParams.set('recognizer', value)
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
    let shown: boolean | null = null
    const position = () => {
      const frame = frameRef.current!.getBoundingClientRect()
      const mobile = innerWidth < 1000
      const top = Math.max(80, frame.top + 18)
      const visible = live && showAvatar && !fullscreen.expanded && innerWidth >= 1480 && frame.bottom > 200
      pip.style.setProperty('--sign-pip-visible', visible ? '1' : '0')
      if (visible !== shown) { shown = visible; onAvatarPreview?.(visible) }
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
      onAvatarPreview?.(false)
    }
  }, [active, live, showAvatar, fullscreen.expanded, onAvatarPreview])
  useEffect(() => {
    // Start from the last camera's shape so the frame does not jump when video arrives.
    try { const saved = Number(localStorage.getItem(CAMERA_RATIO_KEY)); if (usableRatio(saved)) setCameraRatio(saved) } catch { /* Storage is optional. */ }
    const video = videoRef.current
    if (!video) return
    const measure = () => {
      if (!video.videoWidth || !video.videoHeight) return
      const ratio = Math.round(video.videoWidth / video.videoHeight * 1e4) / 1e4
      if (!usableRatio(ratio)) return
      setCameraRatio(ratio)
      try { localStorage.setItem(CAMERA_RATIO_KEY, String(ratio)) } catch { /* Storage is optional. */ }
    }
    measure()
    // `resize` fires when the stream's dimensions change, e.g. a phone rotating.
    video.addEventListener('loadedmetadata', measure); video.addEventListener('resize', measure)
    return () => { video.removeEventListener('loadedmetadata', measure); video.removeEventListener('resize', measure) }
  }, [])
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
    : dataset.loading ? 'Preparing sign recognition…'
    : !dataset.labels ? 'Recognition is taking a moment · retry below'
    : live && bodyTracking && recognition.tracking.mode === 'loading' ? 'Preparing hands, body and face tracking…'
    : snapshot.phase === 'committed' ? `${snapshot.label} added · release or change sign`
    : kind === 'auto' && snapshot.candidates?.length ? 'Possible matches · choose the word, letter or number you intended'
    : !snapshot.handCount ? 'Bring your hands into frame'
    : kind === 'auto' ? snapshot.routing === 'reading-motion' ? 'Reading your movement · finish or pause, then confirm a match' : 'Auto preview · confirm a match below, or choose Spell for names'
    : words && snapshot.label === 'YES' && holding ? 'Thumbs-up detected · keep it steady briefly'
    : words && snapshot.activity === 'matching' ? 'Matching your sign…'
    : words && snapshot.activity === 'collecting' ? 'Reading your movement · finish the sign, then lower your hands'
    : holding ? `Hold ${snapshot.label} steady`
    : words ? 'Sign once, then pause or lower your hands. Possible matches appear below.' : 'Keep the sign steady · release or change sign between characters'
  return <LayoutGroup id="sign-live"><motion.section ref={stageRef} id="sign-stage" className={`sign-stage ${live ? 'is-live' : ''} ${handLocked ? 'has-hand-lock' : ''} ${fullscreen.expanded ? 'is-expanded' : ''} ${snapshot.candidates?.length ? 'has-suggestions' : ''}`}
    aria-labelledby="sign-stage-title" aria-hidden={!active} inert={!active}
    style={{ pointerEvents: active ? 'auto' : 'none', clipPath: reduced || fullscreen.expanded ? 'none' : portalClip }} initial={false}
    animate={{ opacity: active ? 1 : 0 }}
    transition={{ opacity: { duration: reduced ? .15 : .18, delay: active || reduced || fullscreen.expanded ? 0 : .3 } }}>
    <header className="sign-stage-header">
      <div><h2 id="sign-stage-title">You Sign. <em>We Speak.</em></h2><span className="sign-beta">Experimental · {dataset.loading ? 'Preparing recognition' : `${dataset.labels} ${kind === 'words' ? 'word entries' : 'entries'} available`}</span></div>
      <button type="button" className="sign-stage-close" aria-label="Close Sign to Text" onClick={onClose}><X size={20} /></button>
    </header>
    <div className="sign-stage-heading">
      <div className="sign-recognition-modes" role="group" aria-label="Signing intent">
        <button type="button" aria-pressed={kind === 'auto'} onClick={() => chooseKind('auto')}>Auto <span>Preview</span></button>
        <button type="button" aria-pressed={kind === 'static'} onClick={() => chooseKind('static')}>Spell</button>
        <button type="button" aria-pressed={kind === 'numbers'} onClick={() => chooseKind('numbers')}>Numbers</button>
        <button type="button" aria-pressed={kind === 'words'} onClick={() => chooseKind('words')}>Words</button>
      </div>
      <span className="sign-framing-note">Head, elbows and hands in view · {kind === 'auto' ? 'confirm each match' : 'isolated signs'}</span>
    </div>
    <div className={`sign-camera-workspace ${cameraRatio ? 'has-camera-ratio' : ''}`} style={cameraRatio ? { '--sign-camera-ratio': cameraRatio } as CSSProperties : undefined}>
    <motion.div ref={frameRef} className="sign-viewfinder" initial={false}
      animate={{ scale: active && !reduced ? 1 : reduced ? 1 : 1.06, opacity: active ? 1 : 0 }}
      transition={{ type: 'spring', stiffness: 130, damping: 24, delay: active && !reduced ? .14 : 0 }}>
      <video ref={attach} autoPlay playsInline muted className="sign-camera-video" data-mirrored={mirrored} aria-label={mirrored ? 'Mirrored camera preview' : 'Camera preview'} />
      <HandOverlay canvasRef={canvasRef} />
      <div className="sign-camera-shade" />
      <div className={`sign-model-chip ${model === 'loading' ? 'is-loading' : ''}`} role="status">
        {model === 'loading' ? <LoaderCircle size={13} className="sign-spinner" /> : model === 'ready' ? <Check size={13} /> : <CameraOff size={13} />}
        <span>{model === 'loading' ? 'Preparing tracking…' : model !== 'ready' ? 'Tracking unavailable' : !live ? 'Camera ready' : bodyTracking ? recognition.tracking.mode === 'loading' ? 'Loading signer models…' : recognition.tracking.mode === 'hands' ? 'Hands only' : `Hands${recognition.tracking.pose ? ' + body' : ''}${recognition.tracking.face ? ' + face' : ''}` : 'Hands only'}</span>
        {model === 'unavailable' && <button type="button" aria-label="Retry hand tracking" onClick={recognition.retry}><RotateCcw size={13} /></button>}
      </div>
      <div className="sign-camera-controls" role="group" aria-label="Camera controls">
        {live && <button type="button" onClick={onPause} aria-label="Pause camera"><Pause size={16} /><span>Pause</span></button>}
        <button type="button" onClick={() => setMirrored(value => !value)} aria-label="Mirror preview" aria-pressed={mirrored}><FlipHorizontal2 size={16} /><span>Mirror</span></button>
        <button ref={fullscreen.buttonRef} type="button" onClick={fullscreen.toggle} disabled={fullscreen.pending} aria-label={fullscreen.expanded ? 'Exit expanded view' : 'Fullscreen camera and transcript'} aria-pressed={fullscreen.expanded}>
          {fullscreen.expanded ? <Minimize size={16} /> : <Maximize size={16} />}<span>{fullscreen.expanded ? 'Exit' : 'Fullscreen'}</span>
        </button>
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
      <div className={`sign-hold-indicator ${holding ? 'is-holding' : ''}`} aria-hidden="true">
        <svg viewBox="0 0 64 64"><circle className="sign-ring-track" cx="32" cy="32" r="26" /><circle ref={ringRef} className="sign-ring-progress" cx="32" cy="32" r="26" strokeDasharray={2 * Math.PI * 26} strokeDashoffset={2 * Math.PI * 26} /></svg>
        <AnimatePresence>{holding && <motion.span key={snapshot.tokenId} layoutId={reduced || words ? undefined : `sign-token-${snapshot.tokenId}`} className={`sign-candidate ${words ? 'is-word' : ''}`} initial={{ scale: reduced ? 1 : .8, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ opacity: 0 }} transition={{ type: 'spring', stiffness: 260, damping: 20 }}>{snapshot.label}</motion.span>}</AnimatePresence>
      </div>
      <div className="sign-camera-bottom">
        {live && <div className="sign-preview-hint" role="status"><span className="dock-live-dot" /><span>{trackingCopy}{bodyTracking && recognition.tracking.mode === 'signer' && snapshot.quality?.length ? <small className="sign-framing-advice">{snapshot.quality.filter(text => recognition.tracking.face || !text.includes('face')).filter(text => recognition.tracking.pose || !/shoulders|elbows/.test(text))[0]}</small> : null}</span></div>}
        <TranscriptCaption tokens={transcript.tokens} placeholder={kind === 'auto' ? 'Your confirmed signs will appear here.' : words ? 'Your recognized words will appear here.' : 'Your recognized letters or numbers will appear here.'} />
      </div>
    </motion.div>
    <Transcript active={active} transcript={transcript} dispatch={dispatchTranscript} wordMode={words}
      // Live tracking hints are shown on the camera itself; here only fullscreen notices and start-up guidance.
      feedback={fullscreen.notice || (live ? '' : dataset.loading ? 'Preparing recognition…' : 'Start your camera above to recognize signs.')} feedbackLive={!!fullscreen.notice}
      candidates={live && snapshot.phase !== 'committed' ? snapshot.candidates : []}
      onAcceptCandidate={recognition.confirmCandidate} />
    </div>
    <details className="sign-workspace-settings"><summary>Vocabulary, help &amp; personal recordings</summary>
    <aside className={`sign-dataset-notice ${dataset.labels ? 'has-samples' : ''}`} aria-label="Recognition status">
      <div><strong>{dataset.loading ? 'Getting recognition ready…' : dataset.labels ? `${dataset.labels} ${kind === 'auto' ? 'word, letter and number entries' : words ? 'word entries' : 'signs'} available` : 'Recognition could not start'}</strong><p>{dataset.labels ? (kind === 'auto' ? 'Sign a word or hold a letter or number. Confirm a typed match below. Use Spell for names, or Numbers for a sequence of digits.' : words ? 'Try YES: hold a thumbs-up for half a second. For moving signs, sign naturally, then lower your hands. You can confirm a possible match below.' : 'Keep both hands fully in view. Hold a supported sign steady until it appears in your text.') : dataset.loading ? 'Your built-in sign library is loading automatically.' : 'Please retry recognition. You can also use Edit text while it reconnects.'}</p>
        {dataset.labels > 0 && <details className="sign-ready-signs"><summary>See available {kind === 'auto' ? 'vocabulary' : words ? 'words' : 'letters & numbers'}</summary><p>{dataset.readySigns.map(label => label.replace('letter:', 'Letter ').replace('number:', 'Number ')).join(' · ')}</p></details>}
        {!dataset.loading && !dataset.labels && <button type="button" className="sign-import-button" onClick={recognition.retry}><RotateCcw size={13} /> Retry recognition</button>}
        {dataset.error && <p className="sign-import-error" role="status">{dataset.error}</p>}
      </div>
      <details className="sign-personalize"><summary>Personalize recognition</summary><div className="sign-dataset-actions"><Link href={words ? '/sign/train/words' : '/sign/train'} onClick={() => onClose()}>Training Studio <ArrowUpRight size={13} /></Link><label className="sign-import-button"><Upload size={13} /> Import {words ? 'words' : 'samples'}<input type="file" accept="application/json,.json" aria-label={words ? 'Import ISL word recordings' : 'Import ISL training samples'} onChange={async (event) => {
        const file = event.target.files?.[0]
        event.target.value = ''
        if (!file) return
        try {
          if (file.size > (words ? MAX_WORD_FILE_BYTES : MAX_SAMPLE_FILE_BYTES)) throw new Error(`Choose a JSON file smaller than ${words ? 64 : 25} MB.`)
          await recognition.importSamples(JSON.parse(await file.text())); setImportError('')
        } catch (error) { setImportError(error instanceof Error ? error.message : 'Sample file could not be read.') }
      }} /></label></div></details>
      {(importError || (!dataset.labels && dataset.samples > 0)) && <p className="sign-import-error" role="status">{importError || `${dataset.samples} samples imported. Add at least 3 real samples per label before recognition can start.`}</p>}
      {dataset.labels > 0 && <span className="sign-session-note">Built-in signs load automatically. Optional personal recordings stay on this device.</span>}
      <label className="sign-avatar-toggle"><input type="checkbox" checked={showAvatar} disabled={viewport.width < 1480 || fullscreen.expanded} onChange={event => setShowAvatar(event.target.checked)} /> Show avatar reference on wide screens</label>
      <label className="sign-avatar-toggle"><input type="checkbox" checked={bodyTracking} onChange={event => setBodyTracking(event.target.checked)} /> Track body and face with hands</label>
      <p className="sign-session-note">Body and face assist framing and movement checks. The current vocabulary model uses hand features; facial grammar needs new training data. Auto preview always asks you to confirm.</p>
      {live && bodyTracking && <p className="sign-session-note">{recognition.tracking.message} · {recognition.tracking.fps} fps · inference p50 / p95: {recognition.tracking.p50Ms} / {recognition.tracking.p95Ms} ms</p>}
      {live && bodyTracking && snapshot.quality?.length ? <p className="sign-session-note" role="status">Framing: {snapshot.quality.join('. ')}</p> : null}
    </aside>
    <VocabularyCoverage />
    <div className="sign-stage-footer">
      <span><ShieldCheck size={14} /> Private by design · video stays on your device</span>
      <span><Hand size={14} /> {words ? 'On-device word motions · experimental personal vocabulary' : 'On-device fingerspelling · static signs'}</span>
      {offline && <span role="status">You’re offline. Loaded models and imported samples still work; AI sentence cleanup needs a connection.</span>}
    </div>
    </details>
    {(dataset.error || (!dataset.loading && !dataset.labels)) && <p className="sign-workspace-error" role="status">{dataset.error || 'Recognition could not load.'} <button type="button" onClick={recognition.retry}>Retry recognition</button></p>}
  </motion.section></LayoutGroup>
}
