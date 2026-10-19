import type { SignFrame, SignPrediction, SignRecognizer } from './types'
import { temporalEmbedding, temporalFrame, temporalMovement } from './temporal-features'
import type { ForestResult, TemporalModel } from './temporal-forest'
import { DtwSignRecognizer } from './dtw-classifier'
import { parseWordDataset, type WordDataset } from './word-data'

type Timed = { vector: number[]; timestamp: number }
const empty = (): SignPrediction => ({ label: null, confidence: 0, wordEvent: 'ready', candidates: [], progress: 0 })

/** Variable-duration signing with a completed-word event, independent of the
 * letters' 700ms hold gate. No single best-guess label is automatically added. */
export class TemporalWordRecognizer implements SignRecognizer {
  labels: string[] = []
  sampleCount = 0
  error = ''
  private personal = new DtwSignRecognizer()
  private frames: Timed[] = []
  private previous: Timed | null = null
  private lastSample = -Infinity
  private lastQuery = -Infinity
  private lastPresent = -Infinity
  private lastMoving = -Infinity
  private generation = 0
  private pending = false
  private result: ForestResult = { label: null, confidence: 0, candidates: [] }
  private agreement = { label: '', count: 0 }
  private committed: SignPrediction | null = null
  private commitPending = false
  private released = false
  constructor(readonly model: TemporalModel,
    private match: (windows: number[][], done: (result: ForestResult) => void) => void,
    private terminate: () => void = () => {}) { this.updateLabels() }
  async init() {}
  private updateLabels() {
    this.labels = [...new Set([...this.model.vocabulary.map(label => label.replaceAll('_', ' ')), ...this.personal.labels])].sort()
    this.sampleCount = this.model.trainingObservations + this.personal.sampleCount
  }
  replace(input: unknown) { this.personal.replace(parseWordDataset(input)); this.updateLabels() }
  dispose() { this.generation++; this.terminate() }
  reset() {
    this.generation++; this.pending = false; this.frames = []; this.previous = null; this.personal.reset()
    this.lastSample = this.lastQuery = this.lastPresent = this.lastMoving = -Infinity
    this.result = { label: null, confidence: 0, candidates: [] }; this.agreement = { label: '', count: 0 }
    this.committed = null; this.commitPending = false; this.released = false
  }
  private request(now: number, final: boolean) {
    if (this.pending || this.frames.length < 5 || (!final && now-this.lastQuery < 280)) return
    const windows: number[][] = []
    for (const duration of [.6, 1, 1.6, 2.4, 3.8]) {
      const frames = this.frames.filter(frame => frame.timestamp >= this.frames.at(-1)!.timestamp-duration*1000)
      if (frames.length >= 5 && (windows.length === 0 || frames.length !== Math.min(this.frames.length, Math.round(duration*10)+1))) windows.push(temporalEmbedding(frames.map(frame => frame.vector)))
      else if (frames.length >= 5) windows.push(temporalEmbedding(frames.map(frame => frame.vector)))
    }
    const generation = this.generation
    this.pending = true; this.lastQuery = now
    this.match(windows, result => {
      if (generation !== this.generation) return
      this.pending = false; this.result = result
      if (result.label) {
        this.agreement = { label: result.label, count: this.agreement.label === result.label ? this.agreement.count+1 : 1 }
        if ((final || this.agreement.count >= 2 && now-this.lastMoving >= 250) && !this.committed) {
          this.committed = { ...result, wordEvent: 'committed', progress: 1 }
          this.commitPending = true
        }
      } else this.agreement = { label: '', count: 0 }
    })
  }
  predict(frame: SignFrame): SignPrediction {
    if (this.commitPending && this.committed) { this.commitPending = false; return { ...this.committed, completed: true } }
    const now = frame.timestamp, present = frame.hands.length > 0
    if (!present) {
      if (now-this.lastPresent >= 220 && this.frames.length && !this.released) {
        this.released = true
        if (!this.committed) this.request(now, true)
      }
      return this.committed ? { ...this.committed, completed: false } : { ...empty(), wordEvent: this.pending ? 'matching' : this.frames.length ? 'uncertain' : 'ready', candidates: this.result.candidates }
    }
    if (this.released || now-this.lastPresent > 1200 && this.frames.length) this.reset()
    this.lastPresent = now
    if (this.committed) return { ...this.committed, completed: false }
    const personal = this.personal.predict(frame)
    // A personal template still gets its own completed-motion behavior.
    if (personal.label && personal.confidence >= .8) {
      this.committed = { ...personal, wordEvent: 'committed', progress: 1 }
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
