import type { SignCandidate, SignFrame, SignPrediction, SignRecognizer, TokenKind } from './types'
import { SignStabilizer } from './stabilizer'
import { temporalFrame, temporalMovement } from './temporal-features'

export type RecognitionBackend = SignRecognizer & { labels: string[]; sampleCount: number; replace(input: unknown): void;
  reset?: () => void; dispose?: () => void; confirmCandidate?: (label: string) => boolean; error?: string; usesTrainedModel?: boolean }
const empty = (activity: SignPrediction['wordEvent'] = 'ready'): SignPrediction => ({ label: null, confidence: 0, progress: 0, wordEvent: activity, candidates: [] })

/** Auto is a confirmation-only preview until independent mixed-stream validation.
 * Scores are never compared across model types and static poses inside motions
 * can never automatically insert letters. Explicit spelling has its own gate. */
export class UnifiedSignRecognizer implements SignRecognizer {
  readonly usesTrainedModel = true
  readonly confirmationOnly = true
  private stable = new SignStabilizer()
  private previous: number[] | null = null
  private lastMoving = -Infinity
  private lastPresent = -Infinity
  private lastTick = -Infinity
  private blocked = false
  private blockAnchor: number[] | null = null
  private confirmedLabel = ''
  private pendingCommit: SignPrediction | null = null
  private offers = new Map<string, SignCandidate & { expires: number }>()
  private bodyWrists = new Map<string,{x:number;y:number}>()
  constructor(private words: RecognitionBackend | null, private letters: RecognitionBackend) {}
  get hasWordBackend() { return this.words !== null }
  setWordBackend(words: RecognitionBackend) { this.words?.dispose?.(); this.words = words; this.reset() }
  get labels() { return [...(this.words?.error ? [] : this.words?.labels ?? []), ...this.letters.labels.map(label => `${/\d/.test(label) ? 'number' : 'letter'}:${label}`)] }
  get sampleCount() { return (this.words?.sampleCount ?? 0) + this.letters.sampleCount }
  get error() { return '' }
  get warning() { return this.words?.error ? 'Word matching stopped. Letters and numbers still work; retry recognition to reload words.' : '' }
  async init() {}
  replace(input: unknown) {
    const data = input as { words: unknown; letters: unknown }
    this.letters.replace(data.letters); this.words?.replace(data.words)
    // Drop offers from the previous dataset and invalidate outstanding queries.
    this.reset()
  }
  reset() {
    this.stable.reset(); this.words?.reset?.(); this.offers.clear(); this.previous = null
    this.lastMoving = this.lastPresent = this.lastTick = -Infinity
    this.blocked = false; this.blockAnchor = null; this.pendingCommit = null
    this.bodyWrists.clear()
  }
  dispose() { this.reset(); this.words?.dispose?.(); this.letters.dispose?.() }
  confirmCandidate(id: string) {
    const offer = this.offers.get(id)
    if (!offer || offer.expires < this.lastTick || this.blocked || offer.kind === 'word' && this.words?.error) return false
    this.pendingCommit = { label: offer.label, confidence: offer.confidence, kind: offer.kind, source: offer.source, completed: true,
      wordEvent: 'committed', candidates: [], progress: 1, routing: 'confirmed' }
    this.blocked = true; this.blockAnchor = this.previous
    this.confirmedLabel = offer.label
    this.offers.clear(); this.words?.reset?.()
    return true
  }
  /** Confirmation is emitted synchronously by the hook; consume its event once. */
  consumeConfirmation() { const prediction = this.pendingCommit; this.pendingCommit = null; return prediction }
  predict(frame: SignFrame): SignPrediction {
    const now = frame.timestamp
    if (now < this.lastTick || now-this.lastTick > 700) { this.words?.reset?.(); this.stable.reset(); this.offers.clear(); this.previous = null }
    this.lastTick = now
    const vector = frame.hands.length ? temporalFrame(frame) : null
    if (vector && this.previous && temporalMovement(vector,this.previous) > .012) this.lastMoving = now
    const observed = new Map<string,{x:number;y:number}>()
    for (const hand of frame.signer?.hands ?? []) {
      const point = hand.bodyRelative?.[0], previous = this.bodyWrists.get(hand.id)
      if (!point) continue
      if (previous && Math.hypot(point.x-previous.x,point.y-previous.y) > .06) this.lastMoving = now
      observed.set(hand.id,point)
    }
    this.bodyWrists = observed
    if (vector) this.previous = vector
    if (this.blocked) {
      const moved = vector && this.blockAnchor && temporalMovement(vector,this.blockAnchor) > .16
      const different = this.stable.update(this.letters.predict(frame),now,!!frame.hands.length)
      if ((!frame.hands.length && now-this.lastPresent > 250) || moved || different.progress === 1 && different.label !== this.confirmedLabel) {
        this.blocked = false; this.stable.reset(); this.words?.reset?.(); this.offers.clear()
      } else {
        if (frame.hands.length) this.lastPresent = now
        return { ...empty(), routing: 'confirmed-hold' }
      }
    }
    if (frame.hands.length) this.lastPresent = now
    const word = this.words?.error ? empty() : this.words?.predict(frame) ?? empty()
    if (this.words?.error) for (const [id,offer] of this.offers) if (offer.kind === 'word') this.offers.delete(id)
    const letter = this.letters.predict(frame)
    const stable = this.stable.update(letter,now,frame.hands.length > 0)
    for (const [id,offer] of this.offers) if (offer.expires < now) this.offers.delete(id)
    // Motion owns its entire window. Do not show a letter from inside a word.
    if (now-this.lastMoving < 1000) for (const [id,offer] of this.offers) if (offer.kind !== 'word') this.offers.delete(id)
    const candidates = word.candidates?.length ? word.candidates : word.label ? [{ label: word.label, confidence: word.confidence, source: word.source }] : []
    const wordSource = word.source ?? (this.words?.usesTrainedModel ? 'word-model' : 'personal-words')
    for (const candidate of (frame.hands.length || now-this.lastPresent < 1000 ? candidates : []).slice(0,3)) {
      const id = `word:${candidate.label.replaceAll(' ','_')}`
      this.offers.set(id,{ ...candidate,id,kind: 'word',source: candidate.source ?? wordSource,expires: now+1600 })
    }
    if (stable.label && stable.progress === 1 && now-this.lastMoving >= 1000 && frame.hands.length) {
      const kind: TokenKind = /^[0-9]$/.test(stable.label) ? 'number' : 'letter'
      const id = `${kind}:${stable.label}`
      this.offers.set(id,{ id,label: stable.label,confidence: stable.confidence,kind,source: 'letters-numbers',expires: now+500 })
    }
    return { ...empty(word.wordEvent), candidates: [...this.offers.values()].map(({ expires: _expires,...candidate }) => candidate),
      routing: now-this.lastMoving < 1000 ? 'reading-motion' : this.offers.size ? 'confirm-type' : 'collecting', progress: stable.progress }
  }
}
