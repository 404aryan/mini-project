import { extractFeatures, FEATURE_LENGTH, featureHandCount, NORMALIZATION } from './features'
import type { SignDataset, SignFrame, SignPrediction, SignRecognizer, SignSample } from './types'

export const MIN_SAMPLES_PER_LABEL = 3
export const STATIC_LABELS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'.split('')

export function parseDataset(input: unknown): SignDataset {
  if (!input || typeof input !== 'object') throw new Error('Expected a versioned ISL sample file.')
  const value = input as Partial<SignDataset>
  if (value.version !== 1 || value.normalization !== NORMALIZATION || !Array.isArray(value.samples)) throw new Error('Use dataset version 1 with wrist-maxdist-v1 normalization.')
  if (value.samples.length > 5000) throw new Error('Import at most 5,000 samples at a time.')
  const ids = new Set<string>()
  const samples = value.samples.map((sample, index) => {
    if (!sample || typeof sample.id !== 'string' || !sample.id || sample.id.length > 100 || ids.has(sample.id)
      || !STATIC_LABELS.includes(sample.label) || !Array.isArray(sample.features) || sample.features.length !== FEATURE_LENGTH
      || !sample.features.every((n) => typeof n === 'number' && Number.isFinite(n) && Math.abs(n) <= 1.00001)
      || featureHandCount(sample.features) === 0
      || (sample.recordedAt !== undefined && (!Number.isFinite(sample.recordedAt) || sample.recordedAt < 0))) throw new Error(`Sample ${index + 1} is invalid. Each unique sample needs an A–Z / 0–9 label and 126 normalized features.`)
    ids.add(sample.id)
    return { id: sample.id, label: sample.label, features: [...sample.features], ...(sample.recordedAt !== undefined ? { recordedAt: sample.recordedAt } : {}) }
  })
  return { version: 1, normalization: NORMALIZATION, samples }
}

/** Distance/vote scores are heuristic similarity scores, not calibrated probabilities. */
export class KnnSignRecognizer implements SignRecognizer {
  private samples: (SignSample & { handCount: number })[] = []
  labels: string[] = []
  sampleCount = 0

  constructor(private dataset?: SignDataset) {}

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
    const dataset = parseDataset(input)
    const counts = new Map<string, number>()
    dataset.samples.forEach((s) => counts.set(s.label, (counts.get(s.label) ?? 0) + 1))
    this.labels = [...counts.keys()].filter((label) => counts.get(label)! >= MIN_SAMPLES_PER_LABEL).sort()
    this.samples = dataset.samples.filter((s) => this.labels.includes(s.label)).map((sample) => ({ ...sample, handCount: featureHandCount(sample.features) }))
    this.sampleCount = dataset.samples.length
  }

  predict(frame: SignFrame): SignPrediction {
    return this.predictFeatures(extractFeatures(frame.hands))
  }

  predictFeatures(vector: number[]): SignPrediction {
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
      neighbours.push({ label: sample.label, distance: Math.sqrt(squared / dimensions) })
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
