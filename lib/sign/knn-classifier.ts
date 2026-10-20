import { extractFeatures, extractRelation, FEATURE_LENGTH, featureHandCount, NORMALIZATION, RELATION_LENGTH } from './features'
import { readProvenance } from './provenance'
import type { SignDataset, SignFrame, SignPrediction, SignRecognizer, SignSample } from './types'

export const MIN_SAMPLES_PER_LABEL = 3
export const STATIC_LABELS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'.split('')
/** Limit for one file or device library. */
export const MAX_IMPORT_SAMPLES = 5000
/** A full device library plus the whole bundled library. */
export const MAX_RECOGNITION_SAMPLES = MAX_IMPORT_SAMPLES * 2
/** How much a one-hand-size difference in hand placement adds to the squared
 * distance. On held-out source poses .01–.08 kept every result (334 correct,
 * 0 wrong) and rejected all 180 poses whose second hand was moved 1.5 hand
 * sizes; the low end leaves room for natural placement differences on webcams. */
export const RELATION_WEIGHT = .02
/** Labels offered only with Numbers intent. The bundled digit-0 photographs are
 * byte-identical to that source's letter-O photographs, so the handshape alone
 * cannot tell 0 from O; adding 0 to spelling turned 12 of 19 cross-source O
 * photographs into 0. */
export const NUMBERS_INTENT_ONLY: ReadonlySet<string> = new Set(['0'])
export const spellingLabel = (label: string) => !NUMBERS_INTENT_ONLY.has(label)
export const numberLabel = (label: string) => /^[0-9]$/.test(label)

export function parseDataset(input: unknown, maxSamples = MAX_IMPORT_SAMPLES): SignDataset {
  if (!input || typeof input !== 'object') throw new Error('Expected a versioned ISL sample file.')
  const value = input as Partial<SignDataset>
  if (value.version !== 1 || value.normalization !== NORMALIZATION || !Array.isArray(value.samples)) throw new Error('Use dataset version 1 with wrist-maxdist-v1 normalization.')
  if (value.samples.length > maxSamples) throw new Error(`Import at most ${maxSamples.toLocaleString('en-US')} samples at a time.`)
  const ids = new Set<string>()
  const samples = value.samples.map((sample, index) => {
    if (!sample || typeof sample.id !== 'string' || !sample.id || sample.id.length > 100 || ids.has(sample.id)
      || !STATIC_LABELS.includes(sample.label) || !Array.isArray(sample.features) || sample.features.length !== FEATURE_LENGTH
      || !sample.features.every((n) => typeof n === 'number' && Number.isFinite(n) && Math.abs(n) <= 1.00001)
      || featureHandCount(sample.features) === 0
      || (sample.relation !== undefined && (featureHandCount(sample.features) !== 2 || !Array.isArray(sample.relation) || sample.relation.length !== RELATION_LENGTH
        || !sample.relation.every((n) => typeof n === 'number' && Number.isFinite(n) && Math.abs(n) <= 50)))
      || (sample.recordedAt !== undefined && (!Number.isFinite(sample.recordedAt) || sample.recordedAt < 0))) throw new Error(`Sample ${index + 1} is invalid. Each unique sample needs an A–Z / 0–9 label and 126 normalized features.`)
    ids.add(sample.id)
    return { id: sample.id, label: sample.label, features: [...sample.features], ...(sample.relation !== undefined ? { relation: [...sample.relation] } : {}), ...(sample.recordedAt !== undefined ? { recordedAt: sample.recordedAt } : {}), ...readProvenance(sample) }
  })
  return { ...readProvenance(value), version: 1, normalization: NORMALIZATION, samples }
}

/** Distance/vote scores are heuristic similarity scores, not calibrated probabilities. */
export class KnnSignRecognizer implements SignRecognizer {
  private samples: (SignSample & { handCount: number })[] = []
  labels: string[] = []
  sampleCount = 0

  /** `include` limits which labels this recognizer may report, e.g. digits for Numbers intent. */
  constructor(private dataset?: SignDataset, private include: (label: string) => boolean = () => true) {}

  async init() {
    let dataset = this.dataset
    if (!dataset) {
      const response = await fetch('/models/isl-samples.json', { cache: 'no-store' })
      if (!response.ok) throw new Error('Training samples could not be loaded. Import a local sample file to continue.')
      dataset = parseDataset(await response.json())
    }
    this.replace(dataset)
  }

  replace(input: unknown) {
    const dataset = parseDataset(input, MAX_RECOGNITION_SAMPLES)
    // Prediction only compares samples with the same hand count, so each
    // label/hand-count group needs its own minimum number of references.
    const counts = new Map<string, number>()
    const withHands = dataset.samples.filter((sample) => this.include(sample.label)).map((sample) => ({ ...sample, handCount: featureHandCount(sample.features) }))
    const group = (sample: { label: string; handCount: number }) => `${sample.label}:${sample.handCount}`
    withHands.forEach((s) => counts.set(group(s), (counts.get(group(s)) ?? 0) + 1))
    this.samples = withHands.filter((s) => counts.get(group(s))! >= MIN_SAMPLES_PER_LABEL)
    this.labels = [...new Set(this.samples.map((s) => s.label))].sort()
    this.sampleCount = dataset.samples.length
  }

  predict(frame: SignFrame): SignPrediction {
    return this.predictFeatures(extractFeatures(frame.hands), extractRelation(frame.hands))
  }

  /** `relation` adds hand placement for two-hand poses when the reference has it too. */
  predictFeatures(vector: number[], relation?: readonly number[] | null): SignPrediction {
    const hands = featureHandCount(vector)
    if (!hands || vector.length !== FEATURE_LENGTH || !vector.every(Number.isFinite) || !this.samples.length) return { label: null, confidence: 0 }
    // Keep only k neighbours; avoid allocating/sorting every stored sample per frame.
    const neighbours: { label: string; distance: number }[] = []
    const dimensions = hands * 63
    for (const sample of this.samples) {
      if (sample.handCount !== hands) continue
      const limit = neighbours.length === 5 ? neighbours[4].distance ** 2 * dimensions : Infinity
      let squared = 0
      for (let index = 0; index < FEATURE_LENGTH; index++) {
        squared += (vector[index] - sample.features[index]) ** 2
        if (squared > limit) break
      }
      if (squared > limit) continue
      let placement = 0
      if (relation && sample.relation) for (let index = 0; index < RELATION_LENGTH; index++) placement += (relation[index] - sample.relation[index]) ** 2
      neighbours.push({ label: sample.label, distance: Math.sqrt(squared / dimensions + RELATION_WEIGHT * placement / RELATION_LENGTH) })
      neighbours.sort((a, b) => a.distance - b.distance)
      if (neighbours.length > 5) neighbours.pop()
    }
    const maxDistance = .22
    if (!neighbours.length || neighbours[0].distance > maxDistance) return { label: null, confidence: 0 }
    const votes = new Map<string, { weight: number; distance: number; count: number }>()
    let totalWeight = 0
    neighbours.forEach(({ label, distance }) => {
      const weight = 1 / Math.max(distance, .002)
      const vote = votes.get(label) ?? { weight: 0, distance: 0, count: 0 }
      vote.weight += weight; vote.distance += distance; vote.count += 1
      votes.set(label, vote); totalWeight += weight
    })
    const [label, best] = [...votes].sort((a, b) => b[1].weight - a[1].weight)[0]
    const confidence = (best.weight / totalWeight) * Math.max(0, 1 - best.distance / best.count / maxDistance)
    return { label, confidence }
  }
}
