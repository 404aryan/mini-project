'use client'

import { useCallback, useEffect, useRef, useState, type RefObject } from 'react'
import { createHandOverlay } from './hand-overlay'
import { KnnSignRecognizer, parseDataset } from './knn-classifier'
import { SignStabilizer, type StableSign } from './stabilizer'
import type { SignRecognizer, TranscriptToken } from './types'
import { addStoredSamples, readRecognitionDataset, subscribeSampleChanges } from './sample-store'

type Snapshot = StableSign & { handCount: number; tokenId: string }
type ActiveRecognizer = SignRecognizer & { labels: string[]; sampleCount: number; replace(input: unknown): void; dispose?: () => void; reset?: () => void; error?: string }
const initial: Snapshot = { phase: 'no-hand', label: null, confidence: 0, progress: 0, commit: null, handCount: 0, tokenId: '' }

export function useSignRecognition({ active, live, videoRef, canvasRef, ringRef, onCommit, kind = 'static' }: {
  active: boolean; live: boolean; videoRef: RefObject<HTMLVideoElement | null>
  canvasRef: RefObject<HTMLCanvasElement | null>; ringRef: RefObject<SVGCircleElement | null>
  onCommit: (token: TranscriptToken) => void
  kind?: 'static' | 'words'
}) {
  const [model, setModel] = useState<'loading' | 'ready' | 'unavailable'>('loading')
  const [dataset, setDataset] = useState({ loading: true, labels: 0, samples: 0, readySigns: [] as string[], error: '', kind })
  const [snapshot, setSnapshot] = useState(initial)
  const [retry, setRetry] = useState(0)
  const [libraryRevision, setLibraryRevision] = useState(0)
  const recognizerRef = useRef<ActiveRecognizer | null>(null)
  const kindRef = useRef(kind)
  const onCommitRef = useRef(onCommit)
  onCommitRef.current = onCommit
  const nextId = useRef(0)

  useEffect(() => () => { recognizerRef.current?.dispose?.(); recognizerRef.current = null }, [active, kind])

  useEffect(() => {
    if (!active) return
    let cancelled = false
    setModel('loading')
    void import('./hand-tracker').then(({ warmHandTracker }) => warmHandTracker())
      .then(() => { if (!cancelled) setModel('ready') })
      .catch(() => { if (!cancelled) setModel('unavailable') })
    return () => { cancelled = true }
  }, [active, retry])

  useEffect(() => {
    if (!active) { recognizerRef.current = null; return }
    let cancelled = false
    if (kindRef.current !== kind) recognizerRef.current = null
    kindRef.current = kind
    // Keep the current classifier through a refresh. Window focus and library
    // updates must not look like a hand release or restart the held-letter lock.
    setDataset((d) => ({ ...d, kind, labels: d.kind === kind ? d.labels : 0, samples: d.kind === kind ? d.samples : 0, readySigns: d.kind === kind ? d.readySigns : [], loading: true, error: '' }))
    const load = async (): Promise<{ saved: unknown; warning: string; recognizer: ActiveRecognizer } | null> => {
      if (kind === 'words') {
        const [{ readWordRecognitionDataset }, { DtwSignRecognizer }, { createWordRecognizer }] = await Promise.all([import('./word-store'), import('./dtw-classifier'), import('./word-recognizer')])
        const { dataset: saved, warning } = await readWordRecognitionDataset()
        if (cancelled) return null
        const recognizer = recognizerRef.current instanceof DtwSignRecognizer ? recognizerRef.current : createWordRecognizer()
        return { saved, warning, recognizer }
      }
      const { dataset: saved, warning } = await readRecognitionDataset()
      return { saved, warning, recognizer: new KnnSignRecognizer() }
    }
    void load().then((result) => {
      if (!result) return
      const { saved, warning, recognizer } = result
      if (cancelled) { if (recognizer !== recognizerRef.current) recognizer.dispose?.(); return }
      recognizer.replace(saved)
      recognizerRef.current = recognizer
      setDataset({ loading: false, labels: recognizer.labels.length, samples: recognizer.sampleCount, readySigns: [...recognizer.labels], error: warning, kind })
    }).catch((error: unknown) => {
      if (!cancelled) {
        recognizerRef.current = null
        setDataset({ loading: false, labels: 0, samples: 0, readySigns: [], error: error instanceof Error ? error.message : 'Sample data unavailable.', kind })
      }
    })
    return () => { cancelled = true }
  }, [active, retry, libraryRevision, kind])

  useEffect(() => {
    if (!active) return
    if (kind === 'words') {
      let cancelled = false, cleanup: (() => void) | undefined
      void import('./word-store').then(({ subscribeWordChanges }) => {
        if (!cancelled) cleanup = subscribeWordChanges(() => setLibraryRevision((n) => n + 1))
      })
      return () => { cancelled = true; cleanup?.() }
    }
    return subscribeSampleChanges(() => setLibraryRevision((n) => n + 1))
  }, [active, kind])

  const importSamples = useCallback(async (input: unknown) => {
    if (kind === 'words') {
      const [{ parseWordDataset }, { addStoredWords }] = await Promise.all([import('./word-data'), import('./word-store')])
      await addStoredWords(parseWordDataset(input).samples)
    } else {
      const parsed = parseDataset(input)
      await addStoredSamples(parsed.samples)
    }
    setLibraryRevision((n) => n + 1)
  }, [kind])

  useEffect(() => {
    setSnapshot(initial)
    if (!active || !live || model !== 'ready' || !videoRef.current || !canvasRef.current) return
    const abort = new AbortController()
    if (kind === 'words') recognizerRef.current?.reset?.()
    const stabilizer = new SignStabilizer()
    const overlay = createHandOverlay(canvasRef.current, videoRef.current, ringRef.current)
    let stop: (() => void) | undefined
    let lastPublish = -Infinity, lastPhase = '', candidate: string | null = null, tokenId = '', matcherError = ''
    void import('./hand-tracker').then(({ startHandTracking }) => startHandTracking(videoRef.current!, {
      signal: abort.signal,
      onFrame(frame) {
        if (abort.signal.aborted) return
        const recognizer = recognizerRef.current
        if (recognizer?.error && recognizer.error !== matcherError) {
          matcherError = recognizer.error
          setDataset((current) => ({ ...current, labels: 0, error: matcherError }))
        }
        const prediction = recognizer?.error ? { label: null, confidence: 0 } : recognizer?.predict(frame) ?? { label: null, confidence: 0 }
        const stable = stabilizer.update(prediction, frame.timestamp, frame.hands.length > 0)
        overlay.draw(frame, stable)
        if (stable.label !== candidate) {
          candidate = stable.label
          if (candidate) tokenId = String(++nextId.current)
        }
        if (stable.commit) {
          onCommitRef.current({ id: tokenId, text: stable.commit })
          try { navigator.vibrate?.(10) } catch { /* Optional haptics. */ }
        }
        // Raw landmark arrays and per-frame ring updates never enter React state.
        if (stable.commit || stable.phase !== lastPhase || frame.timestamp - lastPublish >= 120) {
          lastPublish = frame.timestamp; lastPhase = stable.phase
          setSnapshot({ ...stable, handCount: frame.hands.length, tokenId })
        }
      },
      onError() { if (!abort.signal.aborted) { overlay.clear(); setModel('unavailable'); setSnapshot(initial) } },
    })).then((cleanup) => { stop = cleanup; if (abort.signal.aborted) cleanup() })
      .catch(() => { if (!abort.signal.aborted) setModel('unavailable') })
    return () => { abort.abort(); stop?.(); overlay.destroy(); if (kind === 'words') recognizerRef.current?.reset?.() }
  }, [active, live, model, videoRef, canvasRef, ringRef, kind])

  const retryTracker = useCallback(() => {
    setModel('loading')
    void import('./hand-tracker').then(({ resetHandTracker }) => resetHandTracker())
      .catch(() => {})
      .finally(() => setRetry((n) => n + 1))
  }, [])

  return { model, dataset, snapshot, importSamples, retry: retryTracker }
}
