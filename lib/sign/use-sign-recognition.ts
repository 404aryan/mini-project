'use client'

import { useCallback, useEffect, useRef, useState, type RefObject } from 'react'
import { createHandOverlay } from './hand-overlay'
import { KnnSignRecognizer, numberLabel, parseDataset, spellingLabel } from './knn-classifier'
import { SignStabilizer, type StableSign } from './stabilizer'
import type { SignCandidate, SignEvent, SignRecognizer, SignSource, TokenKind, TranscriptToken } from './types'
import type { TrackingStatus } from './signer-tracker'
import { UnifiedSignRecognizer } from './unified-recognizer'
import { addStoredSamples, readBundledRecognitionDataset, readRecognitionDataset, subscribeSampleChanges } from './sample-store'
import { readableSignLabel } from '../islVocabulary'

type Snapshot = StableSign & { handCount: number; tokenId: string; activity?: string; routing?: string; candidates?: SignCandidate[]; quality?: string[]; at?: number }
type ActiveRecognizer = SignRecognizer & { labels: string[]; sampleCount: number; replace(input: unknown): void; dispose?: () => void; reset?: () => void; error?: string; warning?: string; usesTrainedModel?: boolean; confirmCandidate?: (label: string) => boolean }
const initial: Snapshot = { phase: 'no-hand', label: null, confidence: 0, progress: 0, commit: null, handCount: 0, tokenId: '', activity: 'ready', candidates: [] }
// Names what each source's score measures; none of them is a probability of being right.
const SCORE_BASIS: Record<SignSource, string> = {
  'word-model': 'word model vote share', 'personal-words': 'personal recording similarity',
  'thumbs-up-shortcut': 'gesture classifier score', 'letters-numbers': 'handshape reference score',
}
/** Frame timestamps share the performance clock; events store wall-clock milliseconds. */
function signEvent(id: string, label: string, kind: TokenKind, source: SignSource, commit: SignEvent['commit'], start: number, end: number, confidence: number): SignEvent {
  const text = readableSignLabel(label), clock = (time: number) => Math.round(performance.timeOrigin + time)
  return { id, kind, canonical: `${kind}:${text.replaceAll(' ', '_')}`, text, source, commit, startedAt: clock(Math.min(start, end)), endedAt: clock(end),
    ...(confidence > 0 && Number.isFinite(confidence) ? { score: { value: Math.round(confidence * 100) / 100, basis: SCORE_BASIS[source] } } : {}) }
}

/** `personal: false` measures the shipped models alone, ignoring recordings saved in this browser. */
export function useSignRecognition({ active, live, videoRef, canvasRef, ringRef, onCommit, kind = 'static', bodyTracking = false, personal = true }: {
  active: boolean; live: boolean; videoRef: RefObject<HTMLVideoElement | null>
  canvasRef: RefObject<HTMLCanvasElement | null>; ringRef: RefObject<SVGCircleElement | null>
  onCommit: (token: TranscriptToken) => void
  kind?: 'static' | 'words' | 'auto' | 'numbers'; bodyTracking?: boolean; personal?: boolean
}) {
  const [model, setModel] = useState<'loading' | 'ready' | 'unavailable'>('loading')
  const [dataset, setDataset] = useState({ loading: true, labels: 0, samples: 0, readySigns: [] as string[], error: '', kind })
  const [snapshot, setSnapshot] = useState(initial)
  const [retry, setRetry] = useState(0)
  const [tracking, setTracking] = useState<TrackingStatus>({ mode: 'loading', pose: false, face: false, message: '', fps: 0, p50Ms: 0, p95Ms: 0 })
  const [libraryRevision, setLibraryRevision] = useState(0)
  const recognizerRef = useRef<ActiveRecognizer | null>(null)
  const kindRef = useRef(kind)
  const onCommitRef = useRef(onCommit)
  onCommitRef.current = onCommit
  const nextId = useRef(0)
  // Hands-visible segment behind the next sign; brief tracking gaps do not restart it.
  const segment = useRef<{ start: number | null; lastHand: number; last: number }>({ start: null, lastHand: -Infinity, last: 0 })
  const offered = useRef<SignCandidate[]>([])
  const loopKind = bodyTracking ? 'signer' : kind

  useEffect(() => () => { recognizerRef.current?.dispose?.(); recognizerRef.current = null }, [active, kind])

  useEffect(() => {
    if (!active) return
    let cancelled = false
    setModel('loading')
    if (bodyTracking) { setModel('ready'); return }
    void import('./hand-tracker').then(({ warmHandTracker }) => warmHandTracker())
      .then(() => { if (!cancelled) setModel('ready') })
      .catch(() => { if (!cancelled) setModel('unavailable') })
    return () => { cancelled = true }
  }, [active, retry, bodyTracking])

  useEffect(() => {
    if (!active) { recognizerRef.current = null; return }
    let cancelled = false
    if (kindRef.current !== kind) recognizerRef.current = null
    kindRef.current = kind
    // Keep the current classifier through a refresh. Window focus and library
    // updates must not look like a hand release or restart the held-letter lock.
    setDataset((d) => ({ ...d, kind, labels: d.kind === kind ? d.labels : 0, samples: d.kind === kind ? d.samples : 0, readySigns: d.kind === kind ? d.readySigns : [], loading: true, error: '' }))
    const readStatic = () => personal ? readRecognitionDataset() : readBundledRecognitionDataset()
    const readWords = async () => {
      if (personal) return (await import('./word-store')).readWordRecognitionDataset({ personalOnly: true })
      const { emptyWordDataset } = await import('./word-data')
      return { dataset: emptyWordDataset(), personal: emptyWordDataset(), warning: '' }
    }
    const load = async (): Promise<{ saved: unknown; warning: string; recognizer: ActiveRecognizer } | null> => {
      if (kind === 'auto') {
        const [wordRecognizers, { trainedWordLabels }] = await Promise.all([import('./word-recognizer'), import('./word-data')])
        const [{ dataset: letters, warning: staticWarning }, { dataset: words, personal: own, warning: wordWarning }] = await Promise.all([readStatic(), readWords()])
        if (cancelled) return null
        let current = recognizerRef.current as UnifiedSignRecognizer | null
        let warning = [staticWarning,wordWarning].filter(Boolean).join(' ')
        if (!current) {
          let word: ActiveRecognizer | null = null
          try { word = await wordRecognizers.createTrainedWordRecognizer() }
          catch { /* Personal words and static proposals can still work. */ }
          current = new UnifiedSignRecognizer(word,new KnnSignRecognizer(undefined,spellingLabel))
        }
        if (!current.hasWordBackend) {
          try { if (trainedWordLabels((own ?? words).samples).length) current.setWordBackend(wordRecognizers.createWordRecognizer()) } catch { /* Keep static recognition available. */ }
          warning = [warning,current.hasWordBackend ? 'Built-in word model unavailable. Your personal words, letters and numbers still work.' : 'Word model unavailable. Auto preview can still suggest letters and numbers.'].filter(Boolean).join(' ')
        }
        return { saved: { letters, words: own ?? words }, warning, recognizer: current }
      }
      if (kind === 'words') {
        const [wordRecognizers, { trainedWordLabels }] = await Promise.all([import('./word-recognizer'), import('./word-data')])
        const { dataset: saved, personal: own, warning } = await readWords()
        if (cancelled) return null
        let recognizer: ActiveRecognizer | null = recognizerRef.current, fallback = ''
        if (!recognizer) {
          try {
            recognizer = await wordRecognizers.createTrainedWordRecognizer()
          } catch (error) {
            // Saved personal words still work without the pretrained model.
            if (!trainedWordLabels(own.samples).length) throw error
            recognizer = wordRecognizers.createWordRecognizer()
            fallback = `${error instanceof Error ? error.message : 'The word model could not load.'} Your saved words still work.`
          }
        }
        return { saved: recognizer.usesTrainedModel ? own : saved, warning: [warning, fallback].filter(Boolean).join(' '), recognizer }
      }
      const { dataset: saved, warning } = await readStatic()
      // Numbers intent compares only digit references, so a digit cannot lose to a letter with the same handshape.
      return { saved, warning, recognizer: new KnnSignRecognizer(undefined, kind === 'numbers' ? numberLabel : spellingLabel) }
    }
    void load().then((result) => {
      if (!result) return
      const { saved, warning, recognizer } = result
      if (cancelled) { if (recognizer !== recognizerRef.current) recognizer.dispose?.(); return }
      recognizer.replace(saved)
      recognizerRef.current = recognizer
      const labels = kind === 'numbers' ? recognizer.labels.filter(label => /^[0-9]$/.test(label)) : recognizer.labels
      setDataset({ loading: false, labels: labels.length, samples: recognizer.sampleCount, readySigns: [...labels], error: warning, kind })
    }).catch((error: unknown) => {
      if (!cancelled) {
        recognizerRef.current = null
        setDataset({ loading: false, labels: 0, samples: 0, readySigns: [], error: error instanceof Error ? error.message : 'Sample data unavailable.', kind })
      }
    })
    return () => { cancelled = true }
  }, [active, retry, libraryRevision, kind, personal])

  useEffect(() => {
    if (!active || !personal) return
    if (kind === 'words' || kind === 'auto') {
      let cancelled = false, cleanup: (() => void) | undefined
      void import('./word-store').then(({ subscribeWordChanges }) => {
        if (!cancelled) cleanup = subscribeWordChanges(() => setLibraryRevision((n) => n + 1))
      })
      const staticCleanup = kind === 'auto' ? subscribeSampleChanges(() => setLibraryRevision(n => n+1)) : undefined
      return () => { cancelled = true; cleanup?.(); staticCleanup?.() }
    }
    return subscribeSampleChanges(() => setLibraryRevision((n) => n + 1))
  }, [active, kind, personal])

  const importSamples = useCallback(async (input: unknown) => {
    if (kind === 'words' || kind === 'auto' && (input as { normalization?: string })?.normalization === 'sequence-wrist-motion-v1') {
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
    recognizerRef.current?.reset?.()
    segment.current = { start: null, lastHand: -Infinity, last: 0 }
    offered.current = []
    const stabilizer = new SignStabilizer()
    const overlay = createHandOverlay(canvasRef.current, videoRef.current, ringRef.current)
    let stop: (() => void) | undefined
    let lastPublish = -Infinity, lastTracking = -Infinity, lastPhase = '', candidate: string | null = null, tokenId = '', committedId = '', matcherError = '', observedKind = kindRef.current
    const start = bodyTracking ? import('./signer-tracker').then(module => module.startSignerTracking) : import('./hand-tracker').then(module => module.startHandTracking)
    void start.then(startTracking => startTracking(videoRef.current!, {
      signal: abort.signal,
      onStatus(status: TrackingStatus) {
        if (!abort.signal.aborted && (status.mode !== 'signer' || performance.now()-lastTracking > 500)) {
          lastTracking = performance.now(); setTracking(status)
        }
      },
      onFrame(frame) {
        if (abort.signal.aborted) return
        const frameKind = kindRef.current
        const span = segment.current
        if (frame.hands.length) {
          if (span.start === null || frame.timestamp-span.lastHand > 1200) span.start = frame.timestamp
          span.lastHand = frame.timestamp
        }
        span.last = frame.timestamp
        if (frameKind !== observedKind) {
          observedKind = frameKind; stabilizer.reset(); candidate = null; matcherError = ''; lastPhase = ''; lastPublish = -Infinity
        }
        const recognizer = recognizerRef.current
        if (recognizer?.warning && recognizer.warning !== matcherError) {
          matcherError = recognizer.warning
          setDataset(current => ({ ...current, labels: recognizer.labels.length, readySigns: [...recognizer.labels], error: matcherError }))
        }
        if (recognizer?.error && recognizer.error !== matcherError) {
          matcherError = recognizer.error
          setDataset((current) => ({ ...current, labels: 0, error: matcherError }))
        }
        const rawPrediction = recognizer?.error ? { label: null, confidence: 0 } : recognizer?.predict(frame) ?? { label: null, confidence: 0 }
        const prediction = frameKind === 'numbers' && rawPrediction.label && !/^[0-9]$/.test(rawPrediction.label) ? { label: null, confidence: 0 } : rawPrediction
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
          const commitKind = prediction.kind ?? (frameKind === 'words' ? 'word' : /^[0-9]$/.test(stable.commit) ? 'number' : 'letter')
          const source = prediction.source ?? (commitKind !== 'word' ? 'letters-numbers' : recognizer?.usesTrainedModel ? 'word-model' : 'personal-words')
          onCommitRef.current({ id: tokenId, text: stable.commit, kind: commitKind,
            sign: signEvent(tokenId, stable.commit, commitKind, source, 'automatic', span.start ?? frame.timestamp, frame.timestamp, stable.confidence) })
          span.start = null
          try { navigator.vibrate?.(10) } catch { /* Optional haptics. */ }
        }
        // Raw landmark arrays and per-frame ring updates never enter React state.
        offered.current = prediction.candidates ?? []
        if (stable.commit || stable.phase !== lastPhase || frame.timestamp - lastPublish >= 120) {
          lastPublish = frame.timestamp; lastPhase = stable.phase
          setSnapshot({ ...stable, handCount: frame.hands.length, tokenId, activity: prediction.wordEvent, routing: prediction.routing, candidates: prediction.candidates, quality: frame.signer?.quality, at: Math.round(performance.timeOrigin + frame.timestamp) })
        }
      },
      onError() { if (!abort.signal.aborted) { overlay.clear(); setModel('unavailable'); setSnapshot(initial) } },
    })).then((cleanup) => { stop = cleanup; if (abort.signal.aborted) cleanup() })
      .catch(() => { if (!abort.signal.aborted) setModel('unavailable') })
    return () => { abort.abort(); stop?.(); overlay.destroy(); recognizerRef.current?.reset?.() }
  }, [active, live, model, videoRef, canvasRef, ringRef, loopKind, bodyTracking])

  const retryTracker = useCallback(() => {
    recognizerRef.current?.dispose?.(); recognizerRef.current = null
    setModel('loading')
    void import('./hand-tracker').then(({ resetHandTracker }) => resetHandTracker())
      .catch(() => {})
      .finally(() => setRetry((n) => n + 1))
  }, [])

  const confirmCandidate = useCallback((label: string) => {
    if (!active || !live || (kind !== 'words' && kind !== 'auto') || !recognizerRef.current?.confirmCandidate?.(label)) return
    const tokenId = String(++nextId.current)
    const candidate = offered.current.find(entry => (entry.id ?? entry.label) === label)
    const confirmation = kind === 'auto' ? (recognizerRef.current as UnifiedSignRecognizer).consumeConfirmation()
      : { label, kind: 'word' as const, source: candidate?.source, confidence: candidate?.confidence ?? 0 }
    if (!confirmation?.label) return
    const confirmedKind = confirmation.kind ?? 'word'
    const source = confirmation.source ?? (confirmedKind !== 'word' ? 'letters-numbers' : recognizerRef.current?.usesTrainedModel ? 'word-model' : 'personal-words')
    const span = segment.current
    onCommitRef.current({ id: tokenId, text: confirmation.label, kind: confirmedKind,
      sign: signEvent(tokenId, confirmation.label, confirmedKind, source, 'confirmed', span.start ?? span.last, span.last, confirmation.confidence) })
    span.start = null
    setSnapshot(current => ({ ...current, label: confirmation.label, phase: 'committed', activity: 'committed', progress: 1, tokenId, candidates: [] }))
  }, [active, live, kind])

  return { model, dataset, snapshot, tracking, importSamples, retry: retryTracker, confirmCandidate }
}
