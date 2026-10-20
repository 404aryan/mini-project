import { TEMPORAL_FEATURE_SIZE } from './temporal-features'
import type { SignSource } from './types'

export type TemporalModel = {
  version: 1; features: 'hand-temporal-stats-v1'; featureLength: number; nodeWidth: number; nodeCount: number
  roots: number[]; labels: string[]; vocabulary: string[]; threshold: number; margin: number; weights: string
  trainingObservations: number; missing: string[]; sha256?: string
  /** Classes with calibration evidence. Others are only ever offered as candidates. */
  autoAccept?: string[]
}
export type WordCandidate = { label: string; confidence: number; source?: SignSource }
/** `top` is the highest-scoring class even when it is rejected or is no-sign. */
export type ForestResult = { label: string | null; confidence: number; candidates: WordCandidate[]; top?: string }

/** Pick one answer from windows ordered shortest first. The last spans the whole
 * buffered sign; a shorter window counts only when that window's top label is
 * the same, so the tail of one sign cannot be accepted as a different word.
 * Mirrored by Scored.decide in scripts/train-word-model.py. */
export function chooseWindow(results: readonly ForestResult[]): ForestResult {
  const whole = results.at(-1)?.top
  const accepted = results.filter(result => result.label && result.label === whole).sort((a,b) => b.confidence-a.confidence)[0]
  const best = [...results].sort((a,b) => b.confidence-a.confidence)[0]
  return accepted ?? (best ? { ...best, label: null } : { label: null, confidence: 0, candidates: [] })
}

export class TemporalForest {
  private autoAccept: ReadonlySet<string> | null
  constructor(readonly model: TemporalModel, private nodes: Float32Array) {
    if (model.version !== 1 || model.features !== 'hand-temporal-stats-v1' || model.featureLength !== TEMPORAL_FEATURE_SIZE
      || model.nodeWidth !== 10 || nodes.length !== model.nodeCount*10 || !nodes.every(Number.isFinite)
      || !model.labels.length || !model.roots.length || model.roots.some(root => !Number.isInteger(root) || root < 0 || root >= model.nodeCount)
      || !Number.isFinite(model.threshold) || model.threshold < .3 || model.threshold > 1 || !Number.isFinite(model.margin) || model.margin < .05
      || model.autoAccept !== undefined && (!Array.isArray(model.autoAccept) || model.autoAccept.some(label => !model.labels.includes(label) || label === '__NONE__'))) throw new Error('The word model is invalid. Please reload recognition.')
    this.autoAccept = model.autoAccept ? new Set(model.autoAccept) : null
    // Validate every branch once, before the worker handles any live frames.
    for (let offset = 0; offset < nodes.length; offset += 10) {
      if (nodes[offset] >= 0 && (!Number.isInteger(nodes[offset]) || nodes[offset] >= TEMPORAL_FEATURE_SIZE
        || ![nodes[offset+2], nodes[offset+3]].every(child => Number.isInteger(child) && child >= 0 && child < model.nodeCount))) throw new Error('The word model contains an invalid branch.')
      for (let i = 4; i < 10; i += 2) if (!Number.isInteger(nodes[offset+i]) || nodes[offset+i] < 0 || nodes[offset+i] >= model.labels.length || nodes[offset+i+1] < 0 || nodes[offset+i+1] > 1.00001) throw new Error('The word model contains an invalid prediction.')
    }
  }
  predict(features: readonly number[]): ForestResult {
    const none: ForestResult = { label: null, confidence: 0, candidates: [] }
    if (features.length !== TEMPORAL_FEATURE_SIZE || !features.every(Number.isFinite)) return none
    const scores = new Float64Array(this.model.labels.length)
    for (const root of this.model.roots) {
      let index = root, depth = 0
      while (this.nodes[index*10] >= 0) {
        if (++depth > 100) return none
        const offset = index*10
        index = this.nodes[offset+(features[this.nodes[offset]] <= this.nodes[offset+1] ? 2 : 3)]
      }
      const offset = index*10
      for (let i = 4; i < 10; i += 2) scores[this.nodes[offset+i]] += this.nodes[offset+i+1]/this.model.roots.length
    }
    const ranked = Array.from(scores, (confidence, i) => ({ label: this.model.labels[i], confidence })).sort((a,b) => b.confidence-a.confidence)
    const best = ranked[0], second = ranked[1]?.confidence ?? 0
    const candidates = ranked.filter(candidate => candidate.label !== '__NONE__' && candidate.confidence >= .12).slice(0,3).map(candidate => ({ ...candidate, label: candidate.label.replaceAll('_', ' ') }))
    const accepted = best.label !== '__NONE__' && best.confidence >= this.model.threshold && best.confidence-second >= this.model.margin
      && (!this.autoAccept || this.autoAccept.has(best.label))
    return { label: accepted ? best.label.replaceAll('_', ' ') : null, confidence: best.confidence, candidates, top: best.label.replaceAll('_', ' ') }
  }
}
