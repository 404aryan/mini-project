import type { Landmark } from './types'

export const LANDMARKS_PER_HAND = 21
export const FEATURES_PER_HAND = LANDMARKS_PER_HAND * 3
export const FEATURE_LENGTH = FEATURES_PER_HAND * 2
export const NORMALIZATION = 'wrist-maxdist-v1' as const

export function validHand(hand: readonly Landmark[]) {
  return hand.length === LANDMARKS_PER_HAND && hand.every((p) => Number.isFinite(p.x) && Number.isFinite(p.y) && Number.isFinite(p.z))
}

/** Raw camera coordinates: never use handedness labels or mirrored preview pixels. */
export function orderedHands(hands: readonly (readonly Landmark[])[]) {
  return hands.filter(validHand).slice(0, 2).sort((a, b) => a[0].x - b[0].x)
}

export function extractFeatures(hands: readonly (readonly Landmark[])[]): number[] {
  const vector = Array<number>(FEATURE_LENGTH).fill(0)
  orderedHands(hands).forEach((hand, index) => {
    const wrist = hand[0]
    const scale = Math.max(...hand.map((p) => Math.hypot(p.x - wrist.x, p.y - wrist.y, p.z - wrist.z)))
    if (scale < 1e-6) return
    hand.forEach((p, joint) => {
      const offset = index * FEATURES_PER_HAND + joint * 3
      vector[offset] = (p.x - wrist.x) / scale
      vector[offset + 1] = (p.y - wrist.y) / scale
      vector[offset + 2] = (p.z - wrist.z) / scale
    })
  })
  return vector
}

export const RELATION_LENGTH = 3

/**
 * The second hand's wrist relative to the first (ordered by camera x), in units
 * of the two hands' mean size. Hand shapes are wrist-centred, so this is what
 * keeps two-hand signs that differ only in placement apart. Null unless there
 * are exactly two valid hands. Matches relation() in scripts/prepare-sign-data.py.
 */
export function extractRelation(hands: readonly (readonly Landmark[])[]): number[] | null {
  const ordered = orderedHands(hands)
  if (ordered.length !== 2) return null
  const size = (hand: readonly Landmark[]) => Math.max(...hand.map((p) => Math.hypot(p.x - hand[0].x, p.y - hand[0].y, p.z - hand[0].z)))
  const scale = (size(ordered[0]) + size(ordered[1])) / 2
  if (!(scale > 1e-6)) return null
  const [first, second] = ordered
  return [(second[0].x - first[0].x) / scale, (second[0].y - first[0].y) / scale, (second[0].z - first[0].z) / scale]
}

export function featureHandCount(vector: readonly number[]) {
  return [0, FEATURES_PER_HAND].filter((offset) => vector.slice(offset, offset + FEATURES_PER_HAND).some((n) => Math.abs(n) > 1e-6)).length
}

/** Match object-fit: cover and the CSS-only mirrored video, including portrait crops. */
export function previewPoint(p: Landmark, width: number, height: number, videoWidth: number, videoHeight: number, fit: 'cover' | 'contain' = 'cover', mirrored = true) {
  const scale = (fit === 'contain' ? Math.min : Math.max)(width / videoWidth, height / videoHeight)
  const x = p.x * videoWidth * scale + (width - videoWidth * scale) / 2
  return { x: mirrored ? width - x : x, y: p.y * videoHeight * scale + (height - videoHeight * scale) / 2 }
}
