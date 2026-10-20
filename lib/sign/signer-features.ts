import type { Landmark, SignerObservation } from './types'

export const SIGNER_SCHEMA = 'signer-frame-v2' as const
const finite = (p: Landmark | undefined): p is Landmark => !!p && [p.x, p.y, p.z].every(Number.isFinite)
const visible = (p: Landmark | undefined): p is Landmark => finite(p) && (p.visibility ?? 1) >= .55
const distance = (a: Landmark, b: Landmark) => Math.hypot(a.x - b.x, a.y - b.y)

/** Identity is metadata for v2. Never reorder legacy model coordinates. */
export class HandIdentityTracker {
  private tracks: { id: string; point: Landmark; velocity: Landmark; side: 'left' | 'right' | 'unknown'; time: number }[] = []
  private serial = 0
  reset() { this.tracks = [] }
  update(hands: readonly (readonly Landmark[])[], pose: Landmark[], now: number) {
    this.tracks = this.tracks.filter(track => now >= track.time && now - track.time <= 350)
    const available = new Set(this.tracks), assigned = new Set<string>()
    return hands.map(hand => {
      const wrist = hand[0]
      const left = visible(pose[15]) ? distance(wrist, pose[15]) : Infinity
      const right = visible(pose[16]) ? distance(wrist, pose[16]) : Infinity
      let side: 'left' | 'right' | 'unknown' = Math.min(left, right) < .18 && Math.abs(left - right) > .025 ? left < right ? 'left' : 'right' : 'unknown'
      if (assigned.has(side)) side = 'unknown'
      if (side !== 'unknown') assigned.add(side)
      const ranked = [...available].map(track => {
        const dt = Math.min(now - track.time, 150)
        const predicted = { ...track.point, x: track.point.x + track.velocity.x * dt, y: track.point.y + track.velocity.y * dt }
        return { track, cost: distance(wrist, predicted) + (side !== 'unknown' && track.side !== 'unknown' && side !== track.side ? .7 : 0) }
      }).sort((a,b) => a.cost - b.cost)
      const previous = ranked[0]?.cost < .3 ? ranked[0].track : null
      if (previous) available.delete(previous)
      const time = previous ? Math.max(1, now - previous.time) : 1
      const track = { id: previous?.id ?? `hand-${++this.serial}`, point: { ...wrist },
        velocity: { x: previous ? (wrist.x - previous.point.x) / time : 0, y: previous ? (wrist.y - previous.point.y) / time : 0, z: 0 },
        side: side === 'unknown' ? previous?.side ?? side : side, time: now }
      this.tracks = this.tracks.filter(item => item !== previous)
      this.tracks.push(track)
      return { id: track.id, side: track.side }
    })
  }
}

function elbowAngle(pose: Landmark[], indices: number[], aspect: number) {
  const [a,b,c] = indices.map(i => pose[i])
  if (![a,b,c].every(visible)) return null
  const ax = (a.x-b.x)*aspect, ay = a.y-b.y, bx = (c.x-b.x)*aspect, by = c.y-b.y
  const denominator = Math.hypot(ax,ay)*Math.hypot(bx,by)
  return denominator > 1e-6 ? Math.acos(Math.max(-1,Math.min(1,(ax*bx+ay*by)/denominator))) : null
}
function palmNormal(hand: readonly Landmark[], aspect: number): Landmark | null {
  if (![hand[0],hand[5],hand[17]].every(finite)) return null
  const a = { x: (hand[5].x-hand[0].x)*aspect, y: hand[5].y-hand[0].y, z: hand[5].z-hand[0].z }
  const b = { x: (hand[17].x-hand[0].x)*aspect, y: hand[17].y-hand[0].y, z: hand[17].z-hand[0].z }
  const n = { x: a.y*b.z-a.z*b.y, y: a.z*b.x-a.x*b.z, z: a.x*b.y-a.y*b.x }, length = Math.hypot(n.x,n.y,n.z)
  return length > 1e-6 ? { x: n.x/length, y: n.y/length, z: n.z/length } : null
}

export function signerObservation(input: { hands: readonly (readonly Landmark[])[]; pose?: Landmark[]; face?: Landmark[];
  faceBlendshapes?: Record<string, number>; headTransform?: number[]; timestamp: number; aspect: number }, identity: HandIdentityTracker): SignerObservation {
  const pose = input.pose ?? [], face = input.face ?? [], aspect = input.aspect || 1
  const torso = visible(pose[11]) && visible(pose[12]) && Math.abs(pose[11].x-pose[12].x) > .025
  const origin = torso ? { x: (pose[11].x+pose[12].x)/2, y: (pose[11].y+pose[12].y)/2 } : null
  const scale = torso ? Math.hypot((pose[11].x-pose[12].x)*aspect, pose[11].y-pose[12].y) : 0
  const ids = identity.update(input.hands, pose, input.timestamp)
  const masks = { torso, face: face.length >= 468, leftElbow: visible(pose[13]), rightElbow: visible(pose[14]) }
  const quality: string[] = []
  if (!masks.face) quality.push('Bring your face into view')
  if (!masks.torso) quality.push('Keep both shoulders in view')
  if (!masks.leftElbow || !masks.rightElbow) quality.push('Move back until both elbows are visible')
  if (!input.hands.length) quality.push('Bring your signing hands into view')
  if (input.hands.some(hand => hand.some(p => p.x < .015 || p.x > .985 || p.y < .015 || p.y > .985))) quality.push('Keep your fingers inside the frame')
  return { schema: SIGNER_SCHEMA, normalization: 'shoulder-xy-local-hand-z-v1', pose, face, masks, quality,
    hands: input.hands.map((landmarks, i) => ({ ...ids[i], landmarks,
      bodyRelative: origin && scale > .025 ? landmarks.map(p => ({ x: (p.x-origin.x)*aspect/scale, y: (p.y-origin.y)/scale, z: p.z/scale })) : null,
      palmNormal: palmNormal(landmarks, aspect),
    })),
    // Angles are image-plane estimates, not metric 3D joint measurements.
    elbows: { left: elbowAngle(pose,[11,13,15],aspect), right: elbowAngle(pose,[12,14,16],aspect) },
    faceBlendshapes: Object.fromEntries(Object.entries(input.faceBlendshapes ?? {}).filter(([,score]) => Number.isFinite(score))),
    headTransform: input.headTransform?.length === 16 && input.headTransform.every(Number.isFinite) ? input.headTransform : null,
  }
}
