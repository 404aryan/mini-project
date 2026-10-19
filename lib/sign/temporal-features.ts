import { extractFeatures, orderedHands } from './features'
import type { SignFrame } from './types'

export const TEMPORAL_FRAME_SIZE = 135
export const TEMPORAL_FEATURE_SIZE = TEMPORAL_FRAME_SIZE * 16

/** Same measured coordinates/features as scripts/train-word-model.py. */
export function temporalFrame(frame: SignFrame): number[] {
  const hands = orderedHands(frame.hands), vector = [...extractFeatures(hands), ...Array<number>(9).fill(0)]
  const scales: number[] = []
  hands.forEach((hand, index) => {
    vector[126 + index] = 1
    vector[128 + index * 2] = hand[0].x
    vector[129 + index * 2] = hand[0].y
    scales.push(Math.max(...hand.map(point => Math.hypot(point.x-hand[0].x, point.y-hand[0].y, point.z-hand[0].z))))
  })
  if (hands.length === 2) {
    const scale = (scales[0]+scales[1])/2
    if (scale > 1e-6) ['x', 'y', 'z'].forEach((axis, i) => {
      const key = axis as 'x' | 'y' | 'z'
      vector[132+i] = Math.max(-12, Math.min(12, (hands[1][0][key]-hands[0][0][key])/scale))
    })
  }
  return vector
}

export function temporalEmbedding(frames: readonly (readonly number[])[]): number[] {
  if (!frames.length || frames.some(frame => frame.length !== TEMPORAL_FRAME_SIZE || !frame.every(Number.isFinite))) return []
  const mean = Array<number>(TEMPORAL_FRAME_SIZE).fill(0), variance = [...mean]
  const minimum = Array<number>(TEMPORAL_FRAME_SIZE).fill(Infinity), maximum = minimum.map(() => -Infinity)
  for (const frame of frames) for (let i = 0; i < TEMPORAL_FRAME_SIZE; i++) {
    mean[i] += frame[i]/frames.length
    minimum[i] = Math.min(minimum[i], frame[i]); maximum[i] = Math.max(maximum[i], frame[i])
  }
  for (const frame of frames) for (let i = 0; i < TEMPORAL_FRAME_SIZE; i++) variance[i] += (frame[i]-mean[i])**2/frames.length
  const result = [...mean, ...variance.map(Math.sqrt), ...minimum, ...maximum]
  for (let sample = 0; sample < 12; sample++) {
    const position = sample*(frames.length-1)/11, low = Math.floor(position), high = Math.ceil(position), mix = position-low
    for (let i = 0; i < TEMPORAL_FRAME_SIZE; i++) result.push(frames[low][i]*(1-mix)+frames[high][i]*mix)
  }
  return result
}

export function temporalMovement(a: readonly number[], b: readonly number[]) {
  let squared = 0
  for (let i = 0; i < 126; i++) squared += (a[i]-b[i])**2/126
  for (let i = 128; i < 132; i++) squared += (a[i]-b[i])**2*4
  return Math.sqrt(squared)
}
