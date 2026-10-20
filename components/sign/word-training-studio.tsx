'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { AnimatePresence, motion } from 'motion/react'
import { ArrowLeft, Camera, CameraOff, Check, Download, Hand, LoaderCircle, RotateCcw, ShieldCheck, Square, Trash2, Undo2, Upload } from 'lucide-react'
import { useSignMode, warmSignModel } from '@/lib/sign/use-sign-mode'
import { usePrefersReducedMotion } from '@/lib/sign/use-reduced-motion'
import { useWordLibrary } from '@/lib/sign/use-word-library'
import { createHandOverlay } from '@/lib/sign/hand-overlay'
import { WordRecorder, type WordRecordingSnapshot } from '@/lib/sign/word-recorder'
import { WORD_LABELS, WORD_FRAMES, MAX_WORD_SAMPLES, MAX_WORD_FILE_BYTES, emptyWordDataset, mergeWordDatasets, parseWordDataset, trainedWordLabels, type WordSample } from '@/lib/sign/word-data'
import { addStoredWords, downloadWords, removeStoredWords } from '@/lib/sign/word-store'
import { HandOverlay } from './hand-overlay'
import { SamplePreview } from './sample-preview'
import { useUnsavedGuard } from '@/lib/sign/use-unsaved-guard'

const EMPTY_OVERLAY = { label: null, confidence: 0, progress: 0, commit: null, phase: 'no-hand' as const }
const cameraCopy = {
  idle: ['Make room for your words.', 'Open the camera when you’re ready. Nothing is recorded automatically.'],
  primer: ['Your camera. Your device.', 'Video never leaves your device; hand tracking runs locally. Only normalized landmark sequences are saved here, never photos or audio.'],
  requesting: ['Opening your camera…', 'Choose Allow in the browser’s camera prompt.'],
  denied: ['Let your camera in.', 'Allow Camera in the site controls beside the address bar. Check device privacy settings, then retry.'],
  missing: ['No camera found.', 'Connect a camera or use a device with a built-in camera.'],
  busy: ['Your camera is busy.', 'Close other apps using the camera, check device settings, then retry.'],
  unsupported: ['A camera-friendly browser, please.', 'Use HTTPS or localhost in a browser with camera support.'],
  paused: ['Your camera is paused.', 'Leaving the page or a camera interruption stops capture and cancels an unfinished motion. Resume when you’re ready.'],
  live: ['', ''],
}

function MotionPreview({ sample }: { sample: WordSample }) {
  const [frame, setFrame] = useState(0)
  return <div className="word-motion-preview"><SamplePreview sample={{ id: sample.id, label: sample.label, features: sample.frames[frame].slice(0, 126) }} motion={{ frames: sample.frames, frame }} /><label>Frame {frame + 1} / {WORD_FRAMES}<input type="range" min={0} max={WORD_FRAMES - 1} value={frame} aria-label={`Review ${sample.label} recording ${sample.id}`} onChange={(event) => setFrame(Number(event.target.value))} /></label></div>
}

export function WordTrainingStudio() {
  const camera = useSignMode({ surface: 'training' }), library = useWordLibrary(), reduced = usePrefersReducedMotion()
  const [label, setLabel] = useState<string>('HELLO'), [hands, setHands] = useState<1 | 2>(2)
  const [model, setModel] = useState<'loading' | 'ready' | 'error'>('loading'), [retry, setRetry] = useState(0)
  const [handCount, setHandCount] = useState(0), [recording, setRecording] = useState<WordRecordingSnapshot | null>(null)
  const [saving, setSaving] = useState(false), [pending, setPending] = useState<WordSample[]>([]), [undo, setUndo] = useState<WordSample[]>([])
  const [notice, setNotice] = useState('Choose a word you know in ISL. Three complete motions make your personal version of it active.')
  const videoRef = useRef<HTMLVideoElement | null>(null), canvasRef = useRef<HTMLCanvasElement | null>(null)
  const recorderRef = useRef<WordRecorder | null>(null), mounted = useRef(false), buttons = useRef<(HTMLButtonElement | null)[]>([])
  const live = camera.status === 'live', busy = !!recording || saving || pending.length > 0
  const confirmLeave = useUnsavedGuard(pending.length > 0)
  const counts = new Map<string, number>()
  library.dataset.samples.forEach((sample) => counts.set(sample.label, (counts.get(sample.label) ?? 0) + 1))
  const selected = library.dataset.samples.filter((sample) => sample.label === label)
  const trainedLabels = trainedWordLabels(library.dataset.samples), trained = trainedLabels.length
  const attach = useCallback((video: HTMLVideoElement | null) => { videoRef.current = video; camera.attachVideo(video) }, [camera.attachVideo])
  const cancel = useCallback((message = 'Motion cancelled. No partial recording was saved.') => {
    if (!recorderRef.current) return
    recorderRef.current = null; setRecording(null); setNotice(message)
  }, [])
  const stopCamera = () => { cancel(); camera.close() }
  const leave = (event: { preventDefault(): void }) => { if (confirmLeave(event)) stopCamera() }
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; recorderRef.current = null } }, [])
  useEffect(() => {
    const suspend = () => cancel('Motion cancelled while the page was away. Saved recordings are unchanged.')
    const visibility = () => { if (document.hidden) suspend() }
    const escape = (event: KeyboardEvent) => { if (event.key === 'Escape') { if (recorderRef.current) cancel(); else camera.close() } }
    document.addEventListener('visibilitychange', visibility); document.addEventListener('keydown', escape); window.addEventListener('pagehide', suspend)
    return () => { document.removeEventListener('visibilitychange', visibility); document.removeEventListener('keydown', escape); window.removeEventListener('pagehide', suspend) }
  }, [cancel, camera.close])
  useEffect(() => { if (!live) { cancel(); setHandCount(0) } }, [live, cancel])
  useEffect(() => {
    if (!camera.active) return
    let cancelled = false
    setModel('loading')
    void import('@/lib/sign/hand-tracker').then(({ warmHandTracker }) => warmHandTracker())
      .then(() => { if (!cancelled) setModel('ready') }).catch(() => { if (!cancelled) setModel('error') })
    return () => { cancelled = true }
  }, [camera.active, retry])
  useEffect(() => {
    if (!live || model !== 'ready' || !videoRef.current || !canvasRef.current) return
    const abort = new AbortController(), overlay = createHandOverlay(canvasRef.current, videoRef.current, null)
    let lastCount = -1, stop: (() => void) | undefined
    void import('@/lib/sign/hand-tracker').then(({ startHandTracking }) => startHandTracking(videoRef.current!, {
      signal: abort.signal,
      onFrame(frame) {
        if (abort.signal.aborted) return
        overlay.draw(frame, EMPTY_OVERLAY)
        if (frame.hands.length !== lastCount) { lastCount = frame.hands.length; setHandCount(lastCount) }
        recorderRef.current?.update(frame)
      },
      onError() { if (!abort.signal.aborted) { overlay.clear(); cancel('Hand tracking stopped. Retry before recording.'); setModel('error') } },
    })).then((cleanup) => { stop = cleanup; if (abort.signal.aborted) cleanup() }).catch(() => { if (!abort.signal.aborted) { cancel(); setModel('error') } })
    return () => { abort.abort(); stop?.(); overlay.destroy() }
  }, [live, model, cancel])
  const save = useCallback(async (samples: WordSample[]) => {
    setSaving(true); setPending(samples)
    try {
      await addStoredWords(samples); await library.refresh()
      if (mounted.current) { setPending([]); setNotice(`${samples[0].label} motion saved on this device. With three complete examples, your version replaces the pretrained match in Words mode.`) }
    } catch (error) { if (mounted.current) setNotice(`Motion is unsaved. ${error instanceof Error ? error.message : 'Storage failed.'} Retry or export a backup.`) }
    finally { if (mounted.current) setSaving(false) }
  }, [library.refresh])
  useEffect(() => {
    if (!recording) return
    const timer = window.setInterval(() => {
      const recorder = recorderRef.current
      if (!recorder) return
      const snapshot = recorder.tick(performance.now())
      if (snapshot.phase === 'complete') {
        recorderRef.current = null; setRecording(null)
        if (recorder.sample) void save([recorder.sample])
        else setNotice(snapshot.reason)
      } else setRecording(snapshot)
    }, 100)
    return () => clearInterval(timer)
  }, [!!recording, save])
  const record = () => {
    if (busy || !live || model !== 'ready' || library.loading) return
    if (selected.length >= MAX_WORD_SAMPLES) { setNotice('Five references are saved for this word. Remove a poor recording before adding another.'); return }
    const recorder = new WordRecorder(label, performance.now(), { hands, id: crypto.randomUUID() })
    recorderRef.current = recorder; setRecording(recorder.tick(performance.now())); setNotice('Get ready. Sign once after 3–2–1, over about two seconds. Hold the finish.')
  }
  const exportWords = () => {
    try {
      let merged = library.dataset, skipped = false
      try { merged = mergeWordDatasets(library.dataset, { ...emptyWordDataset(), samples: pending }) } catch { skipped = pending.length > 0 }
      downloadWords(merged)
      setNotice(skipped ? 'Exported your saved recordings. The unsaved motion conflicts with them, so export it separately.' : 'Exported isl-words.json. Keep a backup before clearing browser data.')
    } catch (error) { setNotice(error instanceof Error ? error.message : 'Could not export word recordings.') }
  }
  // Exports only the unsaved motion, so it can be recovered even when the
  // stored library is full or holds a conflicting recording.
  const exportPending = () => {
    try { downloadWords({ ...emptyWordDataset(), samples: pending }, 'isl-words-unsaved.json'); setNotice('Exported the unsaved motion as isl-words-unsaved.json. Import it later to add it.') }
    catch (error) { setNotice(error instanceof Error ? error.message : 'Could not export the unsaved motion.') }
  }
  const remove = async (samples: WordSample[]) => {
    setSaving(true)
    try { await removeStoredWords(samples.map((sample) => sample.id)); await library.refresh(); if (mounted.current) { setUndo(samples); setNotice('Recording removed. Undo is available during this visit.') } }
    catch (error) { if (mounted.current) setNotice(error instanceof Error ? error.message : 'Could not delete recording.') }
    finally { if (mounted.current) setSaving(false) }
  }
  const restore = async () => {
    setSaving(true)
    try { await addStoredWords(undo); await library.refresh(); if (mounted.current) { setUndo([]); setNotice('Deleted recordings restored.') } }
    catch (error) { if (mounted.current) setNotice(error instanceof Error ? error.message : 'Could not restore recording.') }
    finally { if (mounted.current) setSaving(false) }
  }
  const openCamera = () => {
    if (camera.status === 'primer') camera.acceptPrivacy()
    else if (camera.active) void camera.requestCamera()
    else camera.open({ x: 0, y: 0 })
  }
  const retryModel = async () => {
    setModel('loading')
    try { const { resetHandTracker } = await import('@/lib/sign/hand-tracker'); await resetHandTracker(); if (mounted.current) setRetry((n) => n + 1) }
    catch { if (mounted.current) setModel('error') }
  }
  const [title, copy] = cameraCopy[camera.status]
  return <main className="training-studio word-training-studio">
    <header className="train-header"><Link href="/" className="brand" onClick={leave}><Hand size={21} /><span>yap &amp; render</span></Link><span className="train-beta">Word motions · Beta</span><Link className="train-back" href="/?mode=sign&recognizer=words" onClick={leave}><ArrowLeft size={15} /> Live word recognition</Link></header>
    <nav className="train-vocabulary-nav" aria-label="Training vocabulary"><Link href="/sign/train" onClick={leave}>Letters &amp; numbers</Link><Link href="/sign/train/words" aria-current="page">Words <span>Beta</span></Link></nav>
    <div className="train-heading"><p className="eyebrow"><span className="eyebrow-dot" /> From a pose to a thought</p><h1>A word.<br /><em>In your hands.</em></h1><p>Record an ISL motion you know. Make it part of your vocabulary.<br />Live Words mode already knows many words from its pretrained model. Your own recordings add a personal version that replaces it for that word.</p></div>
    <div className="train-stats" aria-label="Word library summary"><span><strong>{library.dataset.samples.length}</strong> saved motions</span><span><strong>{trained} / {WORD_LABELS.length}</strong> words personally trained</span><span><ShieldCheck size={15} /> Landmark sequences only · no video stored</span></div>
    {library.error && <div className="train-storage-error" role="status"><p>{library.error} Saved recordings have not been replaced.</p><button type="button" onClick={() => { void library.refresh() }}>Retry storage</button></div>}
    <div className="train-workspace">
      <section className="train-label-panel" aria-labelledby="word-label-title"><p className="eyebrow">01 / Pick a word</p><h2 id="word-label-title">Your word list</h2><p className="train-small">Three real recordings with the same hand count make your personal version of a word active. Words the pretrained model knows work without training.</p>
        <div className="train-label-grid word-label-grid" role="group" aria-label="Word labels">{WORD_LABELS.map((word, index) => <button key={word} ref={(element) => { buttons.current[index] = element }} type="button" aria-label={`Train ${word} ${counts.get(word) ?? 0} recordings`} aria-pressed={label === word} disabled={busy} onClick={() => setLabel(word)} onKeyDown={(event) => {
          const direction = event.key === 'ArrowRight' ? 1 : event.key === 'ArrowLeft' ? -1 : event.key === 'ArrowDown' ? 2 : event.key === 'ArrowUp' ? -2 : 0
          if (direction || event.key === 'Home' || event.key === 'End') { event.preventDefault(); buttons.current[event.key === 'Home' ? 0 : event.key === 'End' ? WORD_LABELS.length - 1 : (index + direction + WORD_LABELS.length) % WORD_LABELS.length]?.focus() }
        }}><span>{word}</span><small className={trainedLabels.includes(word) ? 'is-ready' : ''}>{counts.get(word) ?? 0} / {MAX_WORD_SAMPLES}</small></button>)}</div>
        <label className="train-hands-label">Hands throughout the motion<select aria-label="Hands to record" value={hands} disabled={busy} onChange={(event) => setHands(Number(event.target.value) as 1 | 2)}><option value={2}>Two hands</option><option value={1}>One hand</option></select></label><p className="train-small">Keep the same hand count across three recordings. Sign over about two seconds. Save up to five references per word.</p>
      </section>
      <section className="train-capture-panel" aria-labelledby="word-capture-title"><div className="train-capture-title"><div><p className="eyebrow">02 / Sign once</p><h2 id="word-capture-title">Your <em>{label}</em> motion</h2></div><span className="train-hand-status">{live ? `${handCount} hands in view` : 'Camera off'}</span></div>
        <div className={`train-camera ${live ? 'is-live' : ''}`}><div className="sign-viewfinder train-viewfinder"><video ref={attach} autoPlay playsInline muted className="sign-camera-video" aria-label="Mirrored word training camera preview" /><HandOverlay canvasRef={canvasRef} />
          {camera.active && <div className="sign-model-chip" role="status">{model === 'loading' ? <LoaderCircle size={13} className="sign-spinner" /> : model === 'ready' ? <Check size={13} /> : <CameraOff size={13} />}{model === 'loading' ? 'Loading hand model…' : model === 'ready' ? 'Hand model ready' : 'Hand model unavailable'}{model === 'error' && <button type="button" aria-label="Retry word hand model" onClick={() => { void retryModel() }}><RotateCcw size={12} /></button>}</div>}
          {!live && <div className="sign-camera-message"><span className="sign-message-icon"><ShieldCheck size={26} /></span><h3>{title}</h3><p>{copy}</p>{camera.status !== 'requesting' && camera.status !== 'unsupported' && <button type="button" className="sign-camera-button" onClick={openCamera} onPointerEnter={warmSignModel} onFocus={warmSignModel}><Camera size={15} />{camera.status === 'primer' ? 'Got it. Open my camera' : camera.status === 'idle' ? 'Open word camera' : 'Retry camera'}</button>}</div>}
          <AnimatePresence>{recording?.phase === 'countdown' && <motion.div key="countdown" className="train-countdown" role="status" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}><motion.strong key={recording.countdown} initial={{ scale: reduced ? 1 : .7 }} animate={{ scale: 1 }}>{recording.countdown}</motion.strong><span>Get ready to sign {label}</span></motion.div>}</AnimatePresence>
          {live && <div className="train-view-hint">{recording?.phase === 'recording' ? `${recording.count} / ${WORD_FRAMES} · ${recording.reason}` : 'Start in a neutral pose. Sign once after the countdown.'}</div>}
        </div></div>
        <div className="train-record-controls"><button type="button" className="train-record-button" onClick={recording ? () => cancel() : record} disabled={saving || (!recording && (!live || model !== 'ready' || library.loading || pending.length > 0 || selected.length >= MAX_WORD_SAMPLES))}>{recording ? <Square size={14} /> : <span className="train-record-dot" />}{recording ? 'Cancel motion' : `Record ${label} motion`}</button>{camera.active && <button type="button" className="train-camera-stop" onClick={stopCamera}><CameraOff size={14} /> Stop camera</button>}<span className="train-small">3–2–1, then 30 frames over about 2 seconds.</span></div>
        {recording?.phase === 'recording' && <progress className="train-record-progress" aria-label="Motion frames recorded" max={WORD_FRAMES} value={recording.count} />}
        <p className="train-notice" role="status">{saving ? 'Saving motion on this device…' : notice}</p>
        {pending.length > 0 && !saving && <div className="train-unsaved"><strong>Motion waiting to be saved</strong><button type="button" onClick={() => { void save(pending) }}>Retry save</button><button type="button" onClick={exportPending}>Export unsaved motion</button><button type="button" onClick={() => { setPending([]); setNotice('Unsaved motion discarded. Saved recordings are unchanged.') }}>Discard unsaved motion</button></div>}
      </section>
    </div>
    <section className="train-library" aria-labelledby="word-library-title"><div className="train-library-heading"><div><p className="eyebrow">03 / Review the movement</p><h2 id="word-library-title">Your <em>{label}</em> recordings <span>{selected.length}</span></h2><p className="train-small">Scrub the motion frame by frame. The dotted line traces each wrist's path and the dot marks the current frame.</p></div><div className="train-file-actions"><button type="button" disabled={library.loading || saving || (!library.dataset.samples.length && !pending.length)} onClick={exportWords}><Download size={14} /> Export word JSON</button><label className={`sign-import-button ${busy ? 'is-disabled' : ''}`}><Upload size={14} /> Import words<input type="file" accept="application/json,.json" aria-label="Import word recordings" disabled={busy || library.loading} onChange={async (event) => {
      const file = event.target.files?.[0]; event.target.value = ''
      if (!file) return
      setSaving(true)
      try {
        if (file.size > MAX_WORD_FILE_BYTES) throw new Error('Choose a word file smaller than 64 MB.')
        const incoming = parseWordDataset(JSON.parse(await file.text()))
        await addStoredWords(incoming); await library.refresh()
        if (mounted.current) setNotice(`Imported ${incoming.samples.length} word recordings. Matching IDs were kept once.`)
      } catch (error) { if (mounted.current) setNotice(error instanceof Error ? error.message : 'Word import failed. Saved recordings are unchanged.') }
      finally { if (mounted.current) setSaving(false) }
    }} /></label></div></div>
      {library.loading ? <p className="train-empty">Loading word recordings…</p> : !selected.length ? <div className="train-empty"><Hand size={28} strokeWidth={1.3} /><h3>A word starts with you.</h3><p>Record your first {label} motion. No examples are guessed or generated.</p></div> : <div className="train-sample-grid word-sample-grid">{selected.map((sample, index) => <article key={sample.id} className="train-sample-card"><MotionPreview sample={sample} /><div><span>Motion {index + 1}</span><button type="button" disabled={busy} aria-label={`Delete ${label} motion ${index + 1}`} onClick={() => { void remove([sample]) }}><Trash2 size={13} /></button></div><small>{sample.handCount} hand{sample.handCount === 1 ? '' : 's'} · {(sample.durationMs / 1000).toFixed(1)}s · 30 frames</small></article>)}</div>}
      <div className="train-library-footer"><div>{selected.length > 0 && <button type="button" disabled={busy} onClick={() => { void remove(selected) }}><Trash2 size={13} /> Delete all {label} motions</button>}{undo.length > 0 && <button type="button" disabled={busy} onClick={() => { void restore() }}><Undo2 size={13} /> Undo last deletion</button>}</div></div>
    </section>
    <footer className="train-footer"><span><ShieldCheck size={14} /> Stored in this browser · export a backup</span><Link href="/?mode=sign&recognizer=words" onClick={leave}>Try your words live <ArrowLeft size={14} /></Link></footer>
  </main>
}
