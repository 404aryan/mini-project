import { extractFeatures, featureHandCount, orderedHands } from './features'
import type { SignFrame, Landmark } from './types'

/** Pose normalization plus wrist trajectories in initial hand-size units.
 * Absolute camera positions and frames are never stored. Preview smoothing is not used. */
export class SequenceEncoder {
  private anchors: { wrist: Landmark; scale: number }[] = []
  reset() { this.anchors = [] }
  encode(frame: SignFrame): number[] | null {
    const hands = orderedHands(frame.hands), pose = extractFeatures(hands)
    if (!hands.length || featureHandCount(pose) !== hands.length) return null
    if (this.anchors.length !== hands.length) this.anchors = hands.map((hand) => ({
      wrist: { ...hand[0] }, scale: Math.max(...hand.map((p) => Math.hypot(p.x - hand[0].x, p.y - hand[0].y, p.z - hand[0].z))),
    }))
    const motion = Array<number>(6).fill(0)
    hands.forEach((hand, index) => {
      const { wrist, scale } = this.anchors[index]
      motion[index * 3] = (hand[0].x - wrist.x) / scale
      motion[index * 3 + 1] = (hand[0].y - wrist.y) / scale
      motion[index * 3 + 2] = (hand[0].z - wrist.z) / scale
    })
    return motion.every((n) => Number.isFinite(n) && Math.abs(n) <= 12) ? [...pose, ...motion] : null
  }
}

export function wordFrameSquared(a: readonly number[], b: readonly number[], hands: number) {
  let pose = 0, motion = 0
  for (let i = 0; i < hands * 63; i++) pose += (a[i] - b[i]) ** 2
  for (let i = 126; i < 126 + hands * 3; i++) motion += (a[i] - b[i]) ** 2
  return .65 * pose / (hands * 63) + .35 * motion / (hands * 3)
}

export function sequenceMotion(frames: readonly number[][], hands: number) {
  return frames.length ? Math.sqrt(Math.max(...frames.map((frame) => wordFrameSquared(frame, frames[0], hands)))) : 0
}

export function rebaseSequence(frames: readonly number[][]) {
  return frames.map((frame) => frame.map((n, index) => index < 126 ? n : n - frames[0][index]))
}
