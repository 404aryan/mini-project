import { extractFeatures, extractRelation, featureHandCount } from './features'
import { STATIC_LABELS } from './knn-classifier'
import type { SignFrame, SignSample } from './types'

export type RecordingSnapshot = {
  phase: 'countdown' | 'recording' | 'complete'; countdown: number; count: number
  target: number; reason: string; timedOut: boolean
}

/** Records actual normalized frames only; no interpolation or generated poses. */
export class SampleRecorder {
  readonly samples: SignSample[] = []
  private previous: number[] | null = null
  private stableSince: number | null = null
  private lastCapture = -Infinity
  private lastFrame = -Infinity
  private done = false
  private reason = 'Get your sign ready'

  constructor(readonly label: string, private startAt: number, private options: {
    hands: 1 | 2; batchId: string; target?: number; recordedAt?: () => number
  }) {
    if (!STATIC_LABELS.includes(label)) throw new Error('Choose a label from A–Z or 0–9.')
  }

  tick(now: number): RecordingSnapshot {
    const elapsed = now - this.startAt
    const timedOut = elapsed >= 11000 && this.samples.length < (this.options.target ?? 12)
    if (timedOut || this.samples.length >= (this.options.target ?? 12)) this.done = true
    return {
      phase: this.done ? 'complete' : elapsed < 3000 ? 'countdown' : 'recording',
      countdown: Math.max(0, Math.min(3, Math.ceil((3000 - elapsed) / 1000))),
      count: this.samples.length, target: this.options.target ?? 12, timedOut, reason: this.reason,
    }
  }

  update(frame: SignFrame) {
    if (this.tick(frame.timestamp).phase !== 'recording') return this.tick(frame.timestamp)
    const features = extractFeatures(frame.hands)
    const hands = featureHandCount(features)
    if (hands !== this.options.hands) {
      this.previous = null; this.stableSince = null
      this.reason = this.options.hands === 2 ? 'Bring both hands into frame' : 'Keep one hand in frame'
      return this.tick(frame.timestamp)
    }
    const movement = this.previous ? Math.sqrt(features.reduce((sum, n, i) => sum + (n - this.previous![i]) ** 2, 0) / (hands * 63)) : Infinity
    if (movement > .035 || frame.timestamp - this.lastFrame > 250) this.stableSince = frame.timestamp
    this.previous = features; this.lastFrame = frame.timestamp
    if (this.stableSince === null || frame.timestamp - this.stableSince < 200) {
      this.reason = 'Hold your sign steady'
      return this.tick(frame.timestamp)
    }
    this.reason = 'Steady · collecting real samples'
    if (frame.timestamp - this.lastCapture >= 250) {
      this.lastCapture = frame.timestamp
      const relation = extractRelation(frame.hands)
      this.samples.push({ id: `${this.options.batchId}-${this.samples.length + 1}`, label: this.label, features, ...(relation ? { relation } : {}), recordedAt: (this.options.recordedAt ?? Date.now)() })
    }
    return this.tick(frame.timestamp)
  }
}
