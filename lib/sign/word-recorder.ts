import type { SignFrame } from './types'
import { featureHandCount } from './features'
import { SequenceEncoder, sequenceMotion } from './sequence-features'
import { WORD_FRAMES, WORD_LABELS, WORD_MAX_FRAME_GAP_MS, WORD_MIN_FRAME_GAP_MS, type WordSample } from './word-data'

export type WordRecordingSnapshot = { phase: 'countdown' | 'recording' | 'complete'; countdown: number; count: number; reason: string }
export class WordRecorder {
  sample: WordSample | null = null
  private encoder = new SequenceEncoder()
  private frames: number[][] = []
  private lastCapture = -Infinity
  private firstCapture = 0
  private done = false
  private reason = 'Get your starting pose ready'
  constructor(private label: string, private startAt: number, private options: { hands: 1 | 2; id: string; recordedAt?: () => number }) {
    if (!WORD_LABELS.some((word) => word === label)) throw new Error('Choose a word from the training list.')
  }
  tick(now: number): WordRecordingSnapshot {
    if (!this.done && now - this.startAt >= 10000) { this.done = true; this.reason = 'No complete motion captured. Keep your hands visible and try again.' }
    return { phase: this.done ? 'complete' : now - this.startAt < 3000 ? 'countdown' : 'recording', countdown: Math.max(0, Math.ceil((this.startAt + 3000 - now) / 1000)), count: this.frames.length, reason: this.reason }
  }
  update(frame: SignFrame) {
    if (this.tick(frame.timestamp).phase !== 'recording') return this.tick(frame.timestamp)
    const vector = this.encoder.encode(frame)
    if (!vector || featureHandCount(vector.slice(0, 126)) !== this.options.hands) {
      this.reason = `Keep ${this.options.hands === 2 ? 'both hands' : 'one hand'} visible throughout the motion. Try another round.`
      if (this.frames.length) this.done = true
      else this.encoder.reset()
      return this.tick(frame.timestamp)
    }
    if (this.frames.length && frame.timestamp - this.lastCapture > WORD_MAX_FRAME_GAP_MS) { this.done = true; this.reason = 'Camera frames stalled. No partial motion was saved.'; return this.tick(frame.timestamp) }
    if (frame.timestamp - this.lastCapture < WORD_MIN_FRAME_GAP_MS) return this.tick(frame.timestamp)
    if (!this.frames.length) this.firstCapture = frame.timestamp
    this.lastCapture = frame.timestamp; this.frames.push(vector); this.reason = 'Sign once now, then hold the finish'
    if (this.frames.length === WORD_FRAMES) {
      this.done = true
      if (sequenceMotion(this.frames, this.options.hands) < .035) this.reason = 'No clear motion captured. Use letters mode for still poses, or try the word again.'
      else {
        this.sample = { id: this.options.id, label: this.label, handCount: this.options.hands, frames: this.frames, durationMs: frame.timestamp - this.firstCapture, recordedAt: (this.options.recordedAt ?? Date.now)() }
        this.reason = 'Motion captured'
      }
    }
    return this.tick(frame.timestamp)
  }
}
