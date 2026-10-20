'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { AnimatePresence, motion } from 'motion/react'
import { usePrefersReducedMotion } from '@/lib/sign/use-reduced-motion'
import { ArrowLeft, Camera, CameraOff, Check, ChevronLeft, ChevronRight, Download, Hand, LoaderCircle, RotateCcw, ShieldCheck, Square, Trash2, Undo2, Upload } from 'lucide-react'
import { useSignMode, warmSignModel } from '@/lib/sign/use-sign-mode'
import { useSampleLibrary } from '@/lib/sign/use-sample-library'
import { MIN_SAMPLES_PER_LABEL, parseDataset, STATIC_LABELS } from '@/lib/sign/knn-classifier'
import { addStoredSamples, downloadDataset, emptyDataset, MAX_SAMPLE_FILE_BYTES, mergeDatasets, removeStoredSamples } from '@/lib/sign/sample-store'
import { createHandOverlay } from '@/lib/sign/hand-overlay'
import { SampleRecorder, type RecordingSnapshot } from '@/lib/sign/recorder'
import type { SignSample } from '@/lib/sign/types'
import { useUnsavedGuard } from '@/lib/sign/use-unsaved-guard'
import { HandOverlay } from './hand-overlay'
import { SamplePreview } from './sample-preview'

const cameraCopy = {
  idle: ['Make room for your hands.', 'Open your camera when you’re ready. Choose the ISL label you know, then record a steady pose.'],
  primer: ['Your camera. Your device.', 'Video never leaves your device; hand tracking runs locally. Only normalized landmark samples are saved here, never photos or audio.'],
  requesting: ['Opening your camera…', 'Choose Allow in the browser’s camera prompt.'],
  denied: ['Let your camera in.', 'Allow Camera in the site controls beside your address bar. Check device privacy settings, then retry.'],
  missing: ['No camera found.', 'Connect a camera or try a device with a built-in camera.'],
  busy: ['Your camera is busy.', 'Close other apps using your camera, check device settings, then retry.'],
  unsupported: ['A camera-friendly browser, please.', 'Use HTTPS or localhost in a browser with camera support.'],
  paused: ['Your camera is paused.', 'Leaving the page or a camera interruption turns capture off and cancels the current round. Resume when you’re ready.'],
  live: ['', ''],
}
const EMPTY_OVERLAY = { label: null, confidence: 0, progress: 0, commit: null, phase: 'no-hand' as const }

export function TrainingStudio() {
  const camera = useSignMode({ surface: 'training' })
  const library = useSampleLibrary()
  const reduced = usePrefersReducedMotion()
  const [label, setLabel] = useState('A')
  const [hands, setHands] = useState<1 | 2>(2)
  const [handCount, setHandCount] = useState(0)
  const [model, setModel] = useState<'loading' | 'ready' | 'error'>('loading')
  const [modelRetry, setModelRetry] = useState(0)
  const [recording, setRecording] = useState<RecordingSnapshot | null>(null)
  const [saving, setSaving] = useState(false)
  const [notice, setNotice] = useState('Choose a label, then open your camera. Nothing is recorded automatically.')
  const [pending, setPending] = useState<SignSample[]>([])
  const [undo, setUndo] = useState<SignSample[]>([])
  const [page, setPage] = useState(0)
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const recorderRef = useRef<SampleRecorder | null>(null)
  const mounted = useRef(false)
  const labelButtons = useRef<(HTMLButtonElement | null)[]>([])
  const live = camera.status === 'live'
  const busy = !!recording || saving || pending.length > 0
  const confirmLeave = useUnsavedGuard(pending.length > 0)
  const counts = useMemo(() => {
    const result = new Map<string, number>()
    library.dataset.samples.forEach((sample) => result.set(sample.label, (result.get(sample.label) ?? 0) + 1))
    return result
  }, [library.dataset])
  const trained = [...counts.values()].filter((n) => n >= MIN_SAMPLES_PER_LABEL).length
  const selected = library.dataset.samples.filter((sample) => sample.label === label)
  const visible = selected.slice().reverse().slice(page * 12, page * 12 + 12)
  const pages = Math.max(1, Math.ceil(selected.length / 12))
  const attach = useCallback((video: HTMLVideoElement | null) => { videoRef.current = video; camera.attachVideo(video) }, [camera.attachVideo])

  useEffect(() => { mounted.current = true; return () => { mounted.current = false; recorderRef.current = null } }, [])
  useEffect(() => { setPage(0) }, [label, selected.length])

  const cancelRecording = useCallback((message = 'Round cancelled. No samples from this round were saved.') => {
    if (!recorderRef.current) return
    recorderRef.current = null; setRecording(null); setNotice(message)
  }, [])
  const stopCamera = () => { cancelRecording(); camera.close() }
  const leave = (event: { preventDefault(): void }) => { if (confirmLeave(event)) stopCamera() }

  useEffect(() => {
    const suspend = () => cancelRecording('Recording cancelled while the page was away. Saved samples are unchanged.')
    const visibility = () => { if (document.hidden) suspend() }
    const escape = (event: KeyboardEvent) => { if (event.key === 'Escape') { if (recorderRef.current) cancelRecording(); else camera.close() } }
    document.addEventListener('visibilitychange', visibility); document.addEventListener('keydown', escape)
    window.addEventListener('pagehide', suspend)
    return () => { document.removeEventListener('visibilitychange', visibility); document.removeEventListener('keydown', escape); window.removeEventListener('pagehide', suspend) }
  }, [cancelRecording, camera.close])

  useEffect(() => {
    if (!camera.active) return
    let cancelled = false
    setModel('loading')
    void import('@/lib/sign/hand-tracker').then(({ warmHandTracker }) => warmHandTracker())
      .then(() => { if (!cancelled) setModel('ready') })
      .catch(() => { if (!cancelled) setModel('error') })
    return () => { cancelled = true }
  }, [camera.active, modelRetry])

  useEffect(() => {
    if (!live) { cancelRecording(); setHandCount(0) }
  }, [live, cancelRecording])

  useEffect(() => {
    if (!live || model !== 'ready' || !videoRef.current || !canvasRef.current) return
    const abort = new AbortController()
    const overlay = createHandOverlay(canvasRef.current, videoRef.current, null)
    let lastCount = -1, stop: (() => void) | undefined
    void import('@/lib/sign/hand-tracker').then(({ startHandTracking }) => startHandTracking(videoRef.current!, {
      signal: abort.signal,
      onFrame(frame) {
        if (abort.signal.aborted) return
        overlay.draw(frame, EMPTY_OVERLAY)
        if (frame.hands.length !== lastCount) { lastCount = frame.hands.length; setHandCount(lastCount) }
        recorderRef.current?.update(frame)
      },
      onError() { if (!abort.signal.aborted) { overlay.clear(); cancelRecording('Hand tracking stopped. Retry the model before recording.'); setModel('error') } },
    })).then((cleanup) => { stop = cleanup; if (abort.signal.aborted) cleanup() })
      .catch(() => { if (!abort.signal.aborted) { cancelRecording(); setModel('error') } })
    return () => { abort.abort(); stop?.(); overlay.destroy() }
  }, [live, model, cancelRecording])

  const saveBatch = useCallback(async (samples: SignSample[]) => {
    setSaving(true); setPending(samples)
    try {
      await addStoredSamples(samples)
      await library.refresh()
      if (mounted.current) { setPending([]); setNotice(`${samples.length} ${samples[0]?.label ?? ''} samples saved on this device. Review the poses below.`) }
    } catch (error) {
      if (mounted.current) setNotice(`${samples.length} poses are unsaved. ${error instanceof Error ? error.message : 'Device storage failed.'} Retry saving or export a backup.`)
    } finally { if (mounted.current) setSaving(false) }
  }, [library.refresh])

  useEffect(() => {
    if (!recording) return
    const timer = window.setInterval(() => {
      const recorder = recorderRef.current
      if (!recorder) return
      const snapshot = recorder.tick(performance.now())
      if (snapshot.phase === 'complete') {
        recorderRef.current = null; setRecording(null)
        if (recorder.samples.length) void saveBatch([...recorder.samples])
        else setNotice('No steady poses captured. Bring your hands fully into view, then try another round.')
      } else setRecording(snapshot)
    }, 100)
    return () => clearInterval(timer)
  }, [!!recording, saveBatch])

  const startRecording = () => {
    if (busy || !live || model !== 'ready' || library.loading) return
    if (library.dataset.samples.length > 4988) { setNotice('The 5,000-sample library is nearly full. Export a backup and remove some poses before recording.'); return }
    const recorder = new SampleRecorder(label, performance.now(), { hands, batchId: crypto.randomUUID() })
    recorderRef.current = recorder; setRecording(recorder.tick(performance.now())); setNotice(`Get ready to hold ${label}. Only real, steady camera frames will be saved.`)
  }

  const remove = async (samples: SignSample[]) => {
    setSaving(true)
    try {
      await removeStoredSamples(samples.map((sample) => sample.id)); await library.refresh()
      if (mounted.current) { setUndo(samples); setNotice(`Removed ${samples.length} saved pose${samples.length === 1 ? '' : 's'}. You can undo this deletion.`) }
    } catch (error) { if (mounted.current) setNotice(error instanceof Error ? error.message : 'Could not delete samples.') }
    finally { if (mounted.current) setSaving(false) }
  }
  const undoDelete = async () => {
    setSaving(true)
    try { await addStoredSamples(undo); await library.refresh(); if (mounted.current) { setUndo([]); setNotice('Deleted poses restored.') } }
    catch (error) { if (mounted.current) setNotice(error instanceof Error ? error.message : 'Could not restore samples.') }
    finally { if (mounted.current) setSaving(false) }
  }
  const exportSamples = () => {
    try {
      let merged = library.dataset, skipped = false
      try { merged = mergeDatasets(library.dataset, { ...emptyDataset(), samples: pending }) } catch { skipped = pending.length > 0 }
      downloadDataset(merged)
      setNotice(skipped ? 'Exported your saved samples. The unsaved round conflicts with them, so export it separately.' : 'Exported isl-samples.json. Keep this file as a backup of your landmark samples.')
    } catch (error) { setNotice(error instanceof Error ? error.message : 'Could not export the sample file.') }
  }
  // Exports only the unsaved round, so it can be recovered even when it
  // conflicts with the stored library.
  const exportPending = () => {
    try { downloadDataset({ ...emptyDataset(), samples: pending }, 'isl-samples-unsaved.json'); setNotice('Exported the unsaved round as isl-samples-unsaved.json. Import it later to add these poses.') }
    catch (error) { setNotice(error instanceof Error ? error.message : 'Could not export the unsaved round.') }
  }
  const openCamera = () => {
    if (camera.status === 'primer') camera.acceptPrivacy()
    else if (camera.active) void camera.requestCamera()
    else camera.open({ x: 0, y: 0 })
  }
  const retryModel = async () => {
    setModel('loading')
    try { const { resetHandTracker } = await import('@/lib/sign/hand-tracker'); await resetHandTracker(); if (mounted.current) setModelRetry((n) => n + 1) }
    catch { if (mounted.current) setModel('error') }
  }
  const [cameraTitle, cameraDescription] = cameraCopy[camera.status]

  return <main className="training-studio">
    <header className="train-header"><Link href="/" className="brand" onClick={leave}><Hand size={21} /><span>yap &amp; render</span></Link><span className="train-beta">Training Studio · Beta</span><Link className="train-back" href="/?mode=sign" onClick={leave}><ArrowLeft size={15} /> Live recognition</Link></header>
    <nav className="train-vocabulary-nav" aria-label="Training vocabulary"><Link href="/sign/train" aria-current="page">Letters &amp; numbers</Link><Link href="/sign/train/words" onClick={leave}>Words <span>Beta</span></Link></nav>
    <div className="train-heading"><p className="eyebrow"><span className="eyebrow-dot" /> A vocabulary shaped by you</p><h1>Your hands.<br /><em>Your vocabulary.</em></h1><p>Choose an ISL sign you know. Hold it, record it, make it yours.<br />Your camera stays private. Your samples stay on this device.</p></div>
    <div className="train-stats" aria-label="Training library summary"><span><strong>{library.dataset.samples.length}</strong> saved poses</span><span><strong>{trained} / 36</strong> labels ready</span><span><ShieldCheck size={15} /> Landmarks only · no video stored</span></div>
    {library.error && <div className="train-storage-error" role="status"><p>{library.error} Your previously saved data has not been replaced.</p><button type="button" onClick={() => { void library.refresh() }}><RotateCcw size={13} /> Retry storage</button></div>}
    <div className="train-workspace">
      <section className="train-label-panel" aria-labelledby="train-label-title"><p className="eyebrow">01 / Pick a sign</p><h2 id="train-label-title">Letters &amp; numbers</h2><p className="train-small">Record only the ISL poses you know. We don’t supply invented sign examples.</p>
        <div className="train-label-grid" role="group" aria-label="Sign labels">{STATIC_LABELS.map((value, index) => <button key={value} ref={(element) => { labelButtons.current[index] = element }} type="button" data-label={value} aria-label={`Train ${value} ${counts.get(value) ?? 0} samples`} aria-pressed={value === label} disabled={busy} onClick={() => setLabel(value)} onKeyDown={(event) => {
          const direction = event.key === 'ArrowRight' ? 1 : event.key === 'ArrowLeft' ? -1 : event.key === 'ArrowDown' ? 6 : event.key === 'ArrowUp' ? -6 : 0
          if (direction || event.key === 'Home' || event.key === 'End') {
            event.preventDefault()
            const next = event.key === 'Home' ? 0 : event.key === 'End' ? STATIC_LABELS.length - 1 : (index + direction + STATIC_LABELS.length) % STATIC_LABELS.length
            labelButtons.current[next]?.focus()
          }
        }}><span>{value}</span>{' '}<small className={(counts.get(value) ?? 0) >= 3 ? 'is-ready' : ''}>{counts.get(value) ?? 0}</small></button>)}</div>
        <label className="train-hands-label">Hands in this sign<select aria-label="Hands to record" value={hands} disabled={busy} onChange={(event) => setHands(Number(event.target.value) as 1 | 2)}><option value={2}>Two hands · ISL fingerspelling</option><option value={1}>One hand</option></select></label>
        <p className="train-small">At least 3 samples unlock a label. Record several rounds with small angle and distance changes for better coverage.</p>
      </section>
      <section className="train-capture-panel" aria-labelledby="train-capture-title"><div className="train-capture-title"><div><p className="eyebrow">02 / Hold your pose</p><h2 id="train-capture-title">Your <em>{label}</em> pose</h2></div><span className="train-hand-status">{live ? `${handCount} hands in view` : 'Camera off'}</span></div>
        <div className={`train-camera ${live ? 'is-live' : ''}`}><div className="sign-viewfinder train-viewfinder"><video ref={attach} autoPlay playsInline muted className="sign-camera-video" aria-label="Mirrored training camera preview" /><HandOverlay canvasRef={canvasRef} />
          {camera.active && <div className="sign-model-chip" role="status">{model === 'loading' ? <LoaderCircle size={13} className="sign-spinner" /> : model === 'ready' ? <Check size={13} /> : <CameraOff size={13} />}{model === 'loading' ? 'Loading hand model…' : model === 'ready' ? 'Hand model ready' : 'Hand model unavailable'}{model === 'error' && <button type="button" aria-label="Retry training hand model" onClick={() => { void retryModel() }}><RotateCcw size={12} /></button>}</div>}
          {!live && <div className="sign-camera-message"><span className="sign-message-icon"><ShieldCheck size={26} /></span><h3>{cameraTitle}</h3><p>{cameraDescription}</p>{camera.status !== 'requesting' && camera.status !== 'unsupported' && <button type="button" className="sign-camera-button" onClick={openCamera} onPointerEnter={warmSignModel} onFocus={warmSignModel}><Camera size={15} />{camera.status === 'primer' ? 'Got it. Open my camera' : camera.status === 'idle' ? 'Open training camera' : 'Retry camera'}</button>}</div>}
          <AnimatePresence>{recording?.phase === 'countdown' && <motion.div key="countdown" className="train-countdown" role="status" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}><motion.strong key={recording.countdown} initial={{ scale: reduced ? 1 : .7, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ type: 'spring', stiffness: 220, damping: 20 }}>{recording.countdown}</motion.strong><span>Get ready to sign {label}</span></motion.div>}</AnimatePresence>
          {live && <div className="train-view-hint">{recording?.phase === 'recording' ? <><span className="train-record-dot" />{recording.count} / {recording.target} · {recording.reason}</> : `Keep ${hands === 2 ? 'both hands' : 'one hand'} in frame. The preview is mirrored.`}</div>}
        </div></div>
        <div className="train-record-controls"><button type="button" className="train-record-button" onClick={recording ? () => cancelRecording() : startRecording} disabled={saving || (!recording && (!live || model !== 'ready' || library.loading || pending.length > 0))}>{recording ? <Square size={14} /> : <span className="train-record-dot" />}{recording ? 'Cancel round' : `Record ${label} samples`}</button>{camera.active && <button type="button" className="train-camera-stop" onClick={stopCamera}><CameraOff size={14} /> Stop camera</button>}<span className="train-small">3–2–1, then up to 12 steady samples.</span></div>
        {recording?.phase === 'recording' && <progress className="train-record-progress" aria-label="Samples collected this round" max={recording.target} value={recording.count} />}
        <p className="train-notice" role="status">{saving ? 'Saving changes on this device…' : notice}</p>
        {pending.length > 0 && !saving && <div className="train-unsaved"><strong>{pending.length} poses waiting to be saved</strong><button type="button" onClick={() => { void saveBatch(pending) }}>Retry save</button><button type="button" onClick={exportPending}>Export unsaved poses</button><button type="button" onClick={() => { setPending([]); setNotice('Unsaved round discarded. Saved samples are unchanged.') }}>Discard unsaved round</button></div>}
      </section>
    </div>
    <section className="train-library" aria-labelledby="train-library-title"><div className="train-library-heading"><div><p className="eyebrow">03 / Keep the good poses</p><h2 id="train-library-title">Your <em>{label}</em> samples <span>{selected.length}</span></h2><p className="train-small">Landmark previews, not photographs. Remove a pose if it doesn’t match your intended sign.</p></div><div className="train-file-actions"><button type="button" disabled={library.loading || saving || (!library.dataset.samples.length && !pending.length)} onClick={exportSamples}><Download size={14} /> Export JSON</button><label className={`sign-import-button ${busy ? 'is-disabled' : ''}`}><Upload size={14} /> Import JSON<input type="file" accept="application/json,.json" aria-label="Import training sample JSON" disabled={busy || library.loading} onChange={async (event) => {
      const file = event.target.files?.[0]; event.target.value = ''
      if (!file) return
      setSaving(true)
      try {
        if (file.size > MAX_SAMPLE_FILE_BYTES) throw new Error('Choose a JSON sample file smaller than 25 MB.')
        const incoming = parseDataset(JSON.parse(await file.text()))
        await addStoredSamples(incoming); await library.refresh()
        if (mounted.current) setNotice(`Imported ${incoming.samples.length} poses. Matching IDs were kept once; existing poses were preserved.`)
      } catch (error) { if (mounted.current) setNotice(error instanceof Error ? error.message : 'Import failed. Saved samples are unchanged.') }
      finally { if (mounted.current) setSaving(false) }
    }} /></label></div></div>
      {library.loading ? <p className="train-empty">Loading your saved samples…</p> : !selected.length ? <div className="train-empty"><Hand size={28} strokeWidth={1.3} /><h3>A little practice starts here.</h3><p>Record your first {label} round. Only your real hand landmarks will appear here.</p></div> : <div className="train-sample-grid">{visible.map((sample, index) => <article className="train-sample-card" key={sample.id}><SamplePreview sample={sample} /><div><span>Pose {String(selected.length - page * 12 - index).padStart(2, '0')}</span><button type="button" disabled={busy} aria-label={`Delete ${label} sample ${selected.length - page * 12 - index}`} onClick={() => { void remove([sample]) }}><Trash2 size={13} /></button></div><small>{sample.recordedAt ? new Date(sample.recordedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'Imported landmark pose'}</small></article>)}</div>}
      <div className="train-library-footer"><div>{selected.length > 0 && <button type="button" disabled={busy} onClick={() => { void remove(selected) }}><Trash2 size={13} /> Delete all {label} samples</button>}{undo.length > 0 && <button type="button" disabled={busy} onClick={() => { void undoDelete() }}><Undo2 size={13} /> Undo last deletion</button>}</div>{pages > 1 && <div className="train-pagination"><button type="button" aria-label="Previous sample page" disabled={page === 0} onClick={() => setPage((n) => n - 1)}><ChevronLeft size={16} /></button><span>{page + 1} / {pages}</span><button type="button" aria-label="Next sample page" disabled={page >= pages - 1} onClick={() => setPage((n) => n + 1)}><ChevronRight size={16} /></button></div>}</div>
    </section>
    <footer className="train-footer"><span><ShieldCheck size={14} /> Stored in this browser · export a backup before clearing site data</span><Link href="/?mode=sign" onClick={leave}>Try your vocabulary live <ArrowLeft size={14} /></Link></footer>
  </main>
}
