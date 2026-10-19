import type { SignPrediction } from './types'

export type StableSign = {
  label: string | null; confidence: number; progress: number; commit: string | null
  phase: 'no-hand' | 'low-confidence' | 'holding' | 'committed'
}

export class SignStabilizer {
  private history: SignPrediction[] = []
  private candidate: string | null = null
  private since = 0
  private committed: string | null = null
  private releaseAt: number | null = null
  private lastTime = -Infinity

  constructor(private options = { window: 9, threshold: .8, voteRatio: .7, holdMs: 700, releaseMs: 200 }) {}

  reset() {
    this.history = []; this.candidate = null; this.committed = null
    this.since = 0; this.releaseAt = null; this.lastTime = -Infinity
  }

  update(prediction: SignPrediction, now: number, hasHand: boolean): StableSign {
    if (now < this.lastTime || now - this.lastTime > 400) {
      // A delayed frame invalidates hold timing, but is not evidence of release.
      this.history = []; this.candidate = null; this.releaseAt = null
    }
    this.lastTime = now
    const valid = hasHand && prediction.label !== null && prediction.confidence >= this.options.threshold
    if (!valid) {
      this.releaseAt ??= now
      if (now - this.releaseAt >= this.options.releaseMs) this.committed = null
    } else this.releaseAt = null
    const empty = (phase: StableSign['phase']): StableSign => ({ label: null, confidence: 0, progress: 0, commit: null, phase })
    if (!hasHand) { this.history = []; this.candidate = null; return empty('no-hand') }
    this.history.push(valid ? prediction : { label: null, confidence: 0 })
    if (this.history.length > this.options.window) this.history.shift()
    const counts = new Map<string, SignPrediction[]>()
    this.history.forEach((p) => { if (p.label) counts.set(p.label, [...(counts.get(p.label) ?? []), p]) })
    const winner = [...counts].sort((a, b) => b[1].length - a[1].length)[0]
    if (!winner || winner[1].length < Math.ceil(this.options.window * this.options.voteRatio)) {
      this.candidate = null
      return empty('low-confidence')
    }
    const [label, votes] = winner
    const confidence = votes.reduce((n, p) => n + p.confidence, 0) / votes.length
    if (this.committed === label) return { label, confidence, progress: 1, commit: null, phase: 'committed' }
    if (this.candidate !== label) {
      this.candidate = label; this.since = now
      // A stable, different sign also unlocks repeated letters.
      if (this.committed !== label) this.committed = null
    }
    const progress = Math.min(1, Math.max(0, (now - this.since) / this.options.holdMs))
    if (progress === 1 && valid && prediction.label === label) {
      this.committed = label
      return { label, confidence, progress, commit: label, phase: 'committed' }
    }
    return { label, confidence, progress, commit: null, phase: 'holding' }
  }
}
