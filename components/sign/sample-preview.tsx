import { featureHandCount } from '@/lib/sign/features'
import type { SignSample } from '@/lib/sign/types'

const chains = [[0, 1, 2, 3, 4], [0, 5, 6, 7, 8], [0, 9, 10, 11, 12], [0, 13, 14, 15, 16], [0, 17, 18, 19, 20], [0, 5, 9, 13, 17, 0]]

/** A reconstructed landmark pose, never a stored photo or video thumbnail.
 * With `motion`, each wrist's recorded path is traced and the current frame marked. */
export function SamplePreview({ sample, motion }: { sample: SignSample; motion?: { frames: number[][]; frame: number } }) {
  const count = featureHandCount(sample.features)
  const centerOf = (slot: number) => count === 1 ? 72 : 36 + slot * 72
  return <svg className="train-sample-preview" viewBox="0 0 144 94" role="img" aria-label={`Saved ${sample.label} landmark pose, ${count} hand${count === 1 ? '' : 's'}${motion ? ', with wrist path' : ''}`}>
    {[0, 1].map((slot) => {
      const vector = sample.features.slice(slot * 63, slot * 63 + 63)
      if (vector.every((n) => n === 0)) return null
      const points = Array.from({ length: 21 }, (_, index) => ({ x: vector[index * 3], y: vector[index * 3 + 1] }))
      const xs = points.map((p) => p.x), ys = points.map((p) => p.y)
      const minX = Math.min(...xs), maxX = Math.max(...xs), minY = Math.min(...ys), maxY = Math.max(...ys)
      const scale = Math.min(54 / Math.max(.01, maxX - minX), 72 / Math.max(.01, maxY - minY))
      const center = centerOf(slot)
      const projected = points.map((p) => ({ x: center - (p.x - (minX + maxX) / 2) * scale, y: 47 + (p.y - (minY + maxY) / 2) * scale }))
      return <g key={slot}>{chains.map((chain, finger) => <polyline key={finger} points={chain.map((index) => `${projected[index].x},${projected[index].y}`).join(' ')} className={`train-finger train-finger-${finger}`} />)}{projected.map((point, index) => <circle key={index} cx={point.x} cy={point.y} r="1.5" />)}</g>
    })}
    {motion && [0, 1].map((slot) => {
      if (slot >= count) return null
      // Wrist offsets from the first frame, in hand-size units, mirrored like the preview.
      const path = motion.frames.map((frame) => ({ x: frame[126 + slot * 3] ?? 0, y: frame[127 + slot * 3] ?? 0 }))
      const reachX = Math.max(.01, ...path.map((p) => Math.abs(p.x))), reachY = Math.max(.01, ...path.map((p) => Math.abs(p.y)))
      const scale = Math.min(30, (count === 1 ? 64 : 30) / reachX, 40 / reachY)
      const center = centerOf(slot)
      const projected = path.map((p) => ({ x: center - p.x * scale, y: 47 + p.y * scale }))
      const current = projected[Math.min(motion.frame, projected.length - 1)]
      return <g key={`path-${slot}`}><polyline points={projected.map((p) => `${p.x},${p.y}`).join(' ')} className="train-finger train-finger-5" strokeDasharray="2 2" /><circle cx={current.x} cy={current.y} r="3" fill="var(--coral)" /></g>
    })}
  </svg>
}
