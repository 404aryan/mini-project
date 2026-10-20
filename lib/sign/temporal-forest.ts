import { TEMPORAL_FEATURE_SIZE } from './temporal-features'

export type TemporalModel = {
  version: 1; features: 'hand-temporal-stats-v1'; featureLength: number; nodeWidth: number; nodeCount: number
  roots: number[]; labels: string[]; vocabulary: string[]; threshold: number; margin: number; weights: string
  trainingObservations: number; missing: string[]; sha256?: string
}
export type WordCandidate = { label: string; confidence: number }
export type ForestResult = { label: string | null; confidence: number; candidates: WordCandidate[] }

export class TemporalForest {
  constructor(readonly model: TemporalModel, private nodes: Float32Array) {
    if (model.version !== 1 || model.features !== 'hand-temporal-stats-v1' || model.featureLength !== TEMPORAL_FEATURE_SIZE
      || model.nodeWidth !== 10 || nodes.length !== model.nodeCount*10 || !nodes.every(Number.isFinite)
      || !model.labels.length || !model.roots.length || model.roots.some(root => !Number.isInteger(root) || root < 0 || root >= model.nodeCount)
      || !Number.isFinite(model.threshold) || model.threshold < .3 || model.threshold > 1 || !Number.isFinite(model.margin) || model.margin < .05) throw new Error('The word model is invalid. Please reload recognition.')
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
    return { label: best.label !== '__NONE__' && best.confidence >= this.model.threshold && best.confidence-second >= this.model.margin ? best.label.replaceAll('_', ' ') : null, confidence: best.confidence, candidates }
  }
}
