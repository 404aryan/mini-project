'use client'

import { useCallback, useEffect, useRef, useState, type RefObject } from 'react'
import { createHandOverlay } from './hand-overlay'
import { KnnSignRecognizer, parseDataset } from './knn-classifier'
import { SignStabilizer, type StableSign } from './stabilizer'
import type { SignRecognizer, TranscriptToken } from './types'
import { addStoredSamples, readRecognitionDataset, subscribeSampleChanges } from './sample-store'

type Snapshot = StableSign & { handCount: number; tokenId: string; activity?: string; candidates?: { label: string; confidence: number }[] }
type ActiveRecognizer = SignRecognizer & { labels: string[]; sampleCount: number; replace(input: unknown): void; dispose?: () => void; reset?: () => void; error?: string; usesTrainedModel?: boolean; confirmCandidate?: (label: string) => boolean }
const initial: Snapshot = { phase: 'no-hand', label: null, confidence: 0, progress: 0, commit: null, handCount: 0, tokenId: '', activity: 'ready', candidates: [] }

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
        const [{ readWordRecognitionDataset }, wordRecognizers, { trainedWordLabels }] = await Promise.all([import('./word-store'), import('./word-recognizer'), import('./word-data')])
        const { dataset: saved, personal, warning } = await readWordRecognitionDataset({ personalOnly: true })
        if (cancelled) return null
        let recognizer: ActiveRecognizer | null = recognizerRef.current, fallback = ''
        if (!recognizer) {
          try {
            recognizer = await wordRecognizers.createTrainedWordRecognizer()
          } catch (error) {
            // Saved personal words still work without the pretrained model.
            if (!trainedWordLabels(personal.samples).length) throw error
            recognizer = wordRecognizers.createWordRecognizer()
            fallback = `${error instanceof Error ? error.message : 'The word model could not load.'} Your saved words still work.`
          }
        }
        return { saved: recognizer.usesTrainedModel ? personal : saved, warning: [warning, fallback].filter(Boolean).join(' '), recognizer }
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
      await addStoredWords(parseWordDataset(input))
    } else {
      const parsed = parseDataset(input)
      await addStoredSamples(parsed)
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
    let lastPublish = -Infinity, lastPhase = '', candidate: string | null = null, tokenId = '', committedId = '', matcherError = ''
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
        const stable: StableSign = prediction.wordEvent ? {
          phase: prediction.wordEvent === 'committed' ? 'committed' : prediction.label ? 'holding' : frame.hands.length ? 'low-confidence' : 'no-hand',
          label: prediction.label, confidence: prediction.confidence, progress: prediction.progress ?? 0,
          commit: prediction.completed ? prediction.label : null,
        } : stabilizer.update(prediction, frame.timestamp, frame.hands.length > 0)
        overlay.draw(frame, stable)
        if (stable.label !== candidate) {
          candidate = stable.label
          if (candidate) tokenId = String(++nextId.current)
        }
        if (stable.commit) {
          // Every committed sign gets its own transcript id, even when the same
          // label repeats without the candidate changing in between.
          if (tokenId === committedId) tokenId = String(++nextId.current)
          committedId = tokenId
          onCommitRef.current({ id: tokenId, text: stable.commit })
          try { navigator.vibrate?.(10) } catch { /* Optional haptics. */ }
        }
        // Raw landmark arrays and per-frame ring updates never enter React state.
        if (stable.commit || stable.phase !== lastPhase || frame.timestamp - lastPublish >= 120) {
          lastPublish = frame.timestamp; lastPhase = stable.phase
          setSnapshot({ ...stable, handCount: frame.hands.length, tokenId, activity: prediction.wordEvent, candidates: prediction.candidates })
        }
      },
      onError() { if (!abort.signal.aborted) { overlay.clear(); setModel('unavailable'); setSnapshot(initial) } },
    })).then((cleanup) => { stop = cleanup; if (abort.signal.aborted) cleanup() })
      .catch(() => { if (!abort.signal.aborted) setModel('unavailable') })
    return () => { abort.abort(); stop?.(); overlay.destroy(); if (kind === 'words') recognizerRef.current?.reset?.() }
  }, [active, live, model, videoRef, canvasRef, ringRef, kind])

  const retryTracker = useCallback(() => {
    recognizerRef.current?.dispose?.(); recognizerRef.current = null
    setModel('loading')
    void import('./hand-tracker').then(({ resetHandTracker }) => resetHandTracker())
      .catch(() => {})
      .finally(() => setRetry((n) => n + 1))
  }, [])

  const confirmCandidate = useCallback((label: string) => {
    if (!active || !live || kind !== 'words' || !recognizerRef.current?.confirmCandidate?.(label)) return
    const tokenId = String(++nextId.current)
    onCommitRef.current({ id: tokenId, text: label })
    setSnapshot(current => ({ ...current, label, phase: 'committed', activity: 'committed', progress: 1, tokenId, candidates: [] }))
  }, [active, live, kind])

  return { model, dataset, snapshot, importSamples, retry: retryTracker, confirmCandidate }
}
