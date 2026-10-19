import type { SignFrame, SignPrediction, SignRecognizer } from './types'
import { featureHandCount } from './features'
import { SequenceEncoder, rebaseSequence, sequenceMotion, wordFrameSquared } from './sequence-features'
import { MIN_WORD_SAMPLES, parseWordDataset, trainedWordLabels, WORD_FRAMES, type WordDataset, type WordSample } from './word-data'

const NONE: SignPrediction = { label: null, confidence: 0 }

/** Banded DTW, O(30 × 13) cells and two rows of working memory per template. */
export function dtwDistance(a: readonly number[][], b: readonly number[][], hands: number) {
  if (a.length !== WORD_FRAMES || b.length !== WORD_FRAMES) return Infinity
  let previous = new Float64Array(WORD_FRAMES + 1).fill(Infinity)
  let current = new Float64Array(WORD_FRAMES + 1)
  previous[0] = 0
  for (let i = 1; i <= WORD_FRAMES; i++) {
    current.fill(Infinity)
    for (let j = Math.max(1, i - 6); j <= Math.min(WORD_FRAMES, i + 6); j++) {
      current[j] = wordFrameSquared(a[i - 1], b[j - 1], hands) + Math.min(previous[j], current[j - 1], previous[j - 1])
    }
    ;[previous, current] = [current, previous]
  }
  return Math.sqrt(previous[WORD_FRAMES] / WORD_FRAMES)
}

/** An experimental, personal motion matcher. Scores are similarity, not probability. */
export class DtwSignRecognizer implements SignRecognizer {
  labels: string[] = []
  sampleCount = 0
  private samples: WordSample[] = []
  private encoder = new SequenceEncoder()
  private frames: number[][] = []
  private hands = 0
  private lastSample = -Infinity
  private lastMatch = -Infinity
  private lastFrame = -Infinity
  private releaseAt: number | null = null
  private generation = 0
  private inFlight = false
  private latched: { prediction: SignPrediction; end: number[]; invalidSince: number | null; blocked: boolean } | null = null
  constructor(private dataset?: WordDataset, private matchAsync?: (frames: number[][], hands: number, done: (prediction: SignPrediction) => void) => void) {}
  async init() {
    const input = this.dataset ?? await fetch('/models/isl-words.json', { cache: 'no-store' }).then(async (response) => {
      if (!response.ok) throw new Error('Word recordings unavailable. Record or import your own words.')
      return response.json()
    })
    this.replace(input)
  }
  replace(input: unknown) {
    const dataset = parseWordDataset(input), counts = new Map<string, number>()
    dataset.samples.forEach((sample) => { const key = `${sample.label}:${sample.handCount}`; counts.set(key, (counts.get(key) ?? 0) + 1) })
    this.labels = trainedWordLabels(dataset.samples)
    this.samples = dataset.samples.filter((sample) => counts.get(`${sample.label}:${sample.handCount}`)! >= MIN_WORD_SAMPLES)
    this.sampleCount = dataset.samples.length
    this.generation++; this.inFlight = false
    // Focus/library refresh must preserve a held word, just like a held letter.
    if (this.latched && !this.samples.some((sample) => sample.label === this.latched!.prediction.label && sample.handCount === this.hands)) this.reset()
  }
  reset() {
    this.generation++; this.inFlight = false
    this.encoder.reset(); this.frames = []; this.hands = 0; this.latched = null
    this.lastSample = this.lastMatch = this.lastFrame = -Infinity; this.releaseAt = null
  }
  predictSequence(frames: number[][], hands: number): SignPrediction {
    if (frames.length !== WORD_FRAMES || sequenceMotion(frames, hands) < .035) return NONE
    const scores = new Map<string, number[]>()
    for (const sample of this.samples) {
      if (sample.handCount !== hands) continue
      const list = scores.get(sample.label) ?? []
      list.push(dtwDistance(frames, sample.frames, hands)); scores.set(sample.label, list)
    }
    // Match the closest real performance. Averaging different signers' motion
    // styles can reject even an exact observed sign because another recording
    // of that word follows a different trajectory. Keep the distance and
    // competing-label margin gates below to reject unfamiliar/ambiguous motion.
    const ranked = [...scores].map(([label, values]) => ({ label, distance: Math.min(...values) })).sort((a, b) => a.distance - b.distance)
    const best = ranked[0], runner = ranked[1]
    if (!best || best.distance > .18) return NONE
    const margin = runner ? Math.min(1, (runner.distance - best.distance) / .06) : 1
    const confidence = Math.max(0, 1 - best.distance / .6) * margin
    return confidence >= .8 ? { label: best.label, confidence } : NONE
  }
  predict(frame: SignFrame): SignPrediction {
    const vector = this.encoder.encode(frame)
    if (!vector) {
      this.releaseAt ??= frame.timestamp
      if (frame.timestamp - this.releaseAt >= 200) this.reset()
      return NONE
    }
    const hands = featureHandCount(vector.slice(0, 126))
    this.releaseAt = null
    if (this.latched) {
      if (hands === this.hands && wordFrameSquared(vector, this.latched.end, hands) <= .12 ** 2 && !this.latched.blocked) {
        this.latched.invalidSince = null
        return this.latched.prediction
      }
      this.latched.invalidSince ??= frame.timestamp
      if (frame.timestamp - this.latched.invalidSince >= 200) this.latched.blocked = true
      return NONE
    }
    if (hands !== this.hands || frame.timestamp - this.lastFrame > 250 || frame.timestamp < this.lastFrame) this.frames = []
    this.hands = hands; this.lastFrame = frame.timestamp
    if (frame.timestamp - this.lastSample < 65) return NONE
    this.lastSample = frame.timestamp
    this.frames.push(vector)
    if (this.frames.length > WORD_FRAMES) this.frames.shift()
    if (this.frames.length < WORD_FRAMES || frame.timestamp - this.lastMatch < 250 || this.inFlight) return NONE
    this.lastMatch = frame.timestamp
    if (this.matchAsync) {
      const generation = this.generation, timestamp = frame.timestamp
      this.inFlight = true
      this.matchAsync(rebaseSequence(this.frames), hands, (prediction) => {
        if (generation !== this.generation) return
        this.inFlight = false
        if (prediction.label && this.labels.includes(prediction.label) && hands === this.hands && this.lastFrame - timestamp <= 400) {
          this.latched = { prediction, end: vector, invalidSince: null, blocked: false }
        }
      })
      return NONE
    }
    const prediction = this.predictSequence(rebaseSequence(this.frames), hands)
    if (prediction.label) this.latched = { prediction, end: vector, invalidSince: null, blocked: false }
    return prediction
  }
}
