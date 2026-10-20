import type { SignFrame, SignPrediction, SignRecognizer } from './types'
import { temporalEmbedding, temporalFrame, temporalMovement } from './temporal-features'
import type { ForestResult, TemporalModel } from './temporal-forest'
import { DtwSignRecognizer } from './dtw-classifier'
import { parseWordDataset } from './word-data'

type Timed = { vector: number[]; timestamp: number }
const empty = (): SignPrediction => ({ label: null, confidence: 0, wordEvent: 'ready', candidates: [], progress: 0 })

/** Variable-duration signing with a completed-word event, independent of the
 * letters' 700ms hold gate. No single best-guess label is automatically added. */
export class TemporalWordRecognizer implements SignRecognizer {
  readonly usesTrainedModel = true
  labels: string[] = []
  sampleCount = 0
  error = ''
  private frames: Timed[] = []
  private previous: Timed | null = null
  private lastSample = -Infinity
  private lastQuery = -Infinity
  private lastPresent = -Infinity
  private lastMoving = -Infinity
  private lastTick = -Infinity
  private generation = 0
  private pending = false
  private pendingFinal = false
  private result: ForestResult = { label: null, confidence: 0, candidates: [] }
  private agreement = { label: '', count: 0 }
  private committed: SignPrediction | null = null
  private commitPending = false
  private released = false
  private thumbsUpSince: number | null = null
  private thumbsUpLast = -Infinity
  constructor(readonly model: TemporalModel,
    private match: (windows: number[][], done: (result: ForestResult) => void) => void,
    private terminate: () => void = () => {},
    private personal = new DtwSignRecognizer()) { this.updateLabels() }
  async init() {}
  private updateLabels() {
    this.labels = [...new Set([...this.model.vocabulary.map(label => label.replaceAll('_', ' ')), ...this.personal.labels])].sort()
    this.sampleCount = this.model.trainingObservations + this.personal.sampleCount
  }
  replace(input: unknown) { this.personal.replace(parseWordDataset(input)); this.updateLabels() }
  confirmCandidate(label: string) {
    const candidate = this.result.candidates.find(candidate => candidate.label === label)
    if (!candidate || this.committed) return false
    this.generation++; this.pending = false; this.pendingFinal = false; this.commitPending = false
    this.committed = { ...candidate, wordEvent: 'committed', progress: 1, candidates: [], source: candidate.source ?? 'word-model' }
    return true
  }
  dispose() { this.generation++; this.terminate() }
  reset() {
    this.generation++; this.pending = false; this.pendingFinal = false; this.frames = []; this.previous = null; this.personal.reset()
    this.lastSample = this.lastQuery = this.lastPresent = this.lastMoving = this.lastTick = -Infinity
    this.result = { label: null, confidence: 0, candidates: [] }; this.agreement = { label: '', count: 0 }
    this.committed = null; this.commitPending = false; this.released = false
    this.thumbsUpSince = null; this.thumbsUpLast = -Infinity
  }
  /** Words the user trained themselves are matched only by their own templates. */
  private personalOverride(result: ForestResult): ForestResult {
    const own = new Set(this.personal.labels)
    if (!own.size) return result
    const candidates = result.candidates.filter(candidate => !own.has(candidate.label))
    return { label: result.label && own.has(result.label) ? null : result.label, confidence: result.label && own.has(result.label) ? 0 : result.confidence, candidates }
  }
  private request(now: number, final: boolean) {
    if (this.pending) { this.pendingFinal ||= final; return }
    if (this.frames.length < 5 || (!final && now-this.lastQuery < 280)) return
    const windows: number[][] = [], sizes = new Set<number>()
    for (const duration of [.6, 1, 1.6, 2.4, 3.8]) {
      const frames = this.frames.filter(frame => frame.timestamp >= this.frames.at(-1)!.timestamp-duration*1000)
      if (frames.length >= 5 && !sizes.has(frames.length)) { windows.push(temporalEmbedding(frames.map(frame => frame.vector))); sizes.add(frames.length) }
    }
    const generation = this.generation
    this.pending = true; this.lastQuery = now
    this.match(windows, result => {
      if (generation !== this.generation) return
      this.pending = false; result = this.personalOverride(result); this.result = result
      if (this.pendingFinal && !final) { this.pendingFinal = false; this.request(this.lastTick, true); return }
      if (this.lastTick-now > 700) return
      if (result.label) {
        this.agreement = { label: result.label, count: this.agreement.label === result.label ? this.agreement.count+1 : 1 }
        if ((final || this.agreement.count >= 2 && now-this.lastMoving >= 250) && !this.committed) {
          this.committed = { ...result, wordEvent: 'committed', progress: 1, source: 'word-model' }
          this.commitPending = true
        }
      } else this.agreement = { label: '', count: 0 }
      this.pendingFinal = false
    })
  }
  predict(frame: SignFrame): SignPrediction {
    this.lastTick = frame.timestamp
    if (this.commitPending && this.committed) { this.commitPending = false; return { ...this.committed, completed: true } }
    const now = frame.timestamp, present = frame.hands.length > 0
    if (!present) {
      // A thumbs-up must be held continuously; leaving the frame restarts it.
      this.thumbsUpSince = null
      if (now-this.lastPresent >= 220 && (this.frames.length || this.committed) && !this.released) {
        this.released = true
        if (!this.committed) this.request(now, true)
      }
      return this.committed ? { ...this.committed, completed: false } : { ...empty(), wordEvent: this.pending ? 'matching' : this.frames.length ? 'uncertain' : 'ready', candidates: this.result.candidates }
    }
    if (this.released || now-this.lastPresent > 1200 && (this.frames.length || this.committed)) { this.reset(); this.lastTick = now }
    this.lastPresent = now
    if (this.committed) return { ...this.committed, completed: false }
    // The avatar's YES is a thumbs-up. Use the separately trained MediaPipe
    // gesture classifier for that explicit shape rather than requiring motion.
    // No other canned hand shape is silently relabelled as an ISL word.
    // A personally trained YES replaces this pretrained shortcut too.
    const thumbsUp = frame.gestures?.find(gesture => gesture.name === 'Thumb_Up' && gesture.score >= .7)
    if (thumbsUp && this.labels.includes('YES') && !this.personal.labels.includes('YES')) {
      // A gap in tracking (stalled camera, dropped frames) restarts the hold.
      if (now-this.thumbsUpLast > 200) this.thumbsUpSince = null
      this.thumbsUpLast = now
      if (this.thumbsUpSince === null) { this.thumbsUpSince = now; this.generation++; this.pending = false; this.pendingFinal = false }
      this.result = { label: 'YES', confidence: thumbsUp.score, candidates: [{ label: 'YES', confidence: thumbsUp.score, source: 'thumbs-up-shortcut' }] }
      if (now-this.thumbsUpSince >= 500) {
        this.generation++; this.pending = false; this.pendingFinal = false
        this.committed = { label: 'YES', confidence: thumbsUp.score, wordEvent: 'committed', progress: 1, source: 'thumbs-up-shortcut' }
        return { ...this.committed, completed: true }
      }
      return { label: 'YES', confidence: thumbsUp.score, wordEvent: 'collecting', progress: (now-this.thumbsUpSince)/500,
        candidates: [{ label: 'YES', confidence: thumbsUp.score, source: 'thumbs-up-shortcut' }], source: 'thumbs-up-shortcut' }
    }
    this.thumbsUpSince = null
    const personal = this.personal.predict(frame)
    // A personal template still gets its own completed-motion behavior.
    if (personal.label && personal.confidence >= .8) {
      this.committed = { ...personal, wordEvent: 'committed', progress: 1, source: 'personal-words' }
      return { ...this.committed, completed: true }
    }
    if (now-this.lastSample >= 90) {
      const vector = temporalFrame(frame)
      if (this.previous && temporalMovement(vector, this.previous.vector) > .025) this.lastMoving = now
      this.previous = { vector, timestamp: now }; this.lastSample = now
      this.frames.push(this.previous)
      this.frames = this.frames.filter(entry => entry.timestamp >= now-4000)
    }
    this.request(now, false)
    return { label: this.result.label, confidence: this.result.confidence, candidates: this.result.candidates,
      wordEvent: this.frames.length < 5 ? 'collecting' : this.pending ? 'matching' : this.result.label ? 'collecting' : 'uncertain',
      progress: Math.min(.9, this.frames.length/15) }
  }
}
