import { orderedHands, previewPoint } from './features'
import type { Landmark, SignFrame } from './types'
import type { StableSign } from './stabilizer'

const fingers = [[0, 1, 2, 3, 4], [0, 5, 6, 7, 8], [0, 9, 10, 11, 12], [0, 13, 14, 15, 16], [0, 17, 18, 19, 20]]
const bones = [[11,12],[11,13],[13,15],[12,14],[14,16],[11,23],[12,24]]
const faceChains = [[70,63,105,66,107],[336,296,334,293,300],[61,40,37,0,267,270,291],[61,84,17,314,291]]
const faceIndices = [...new Set(faceChains.flat())]
const faceChainSlots = faceChains.map(chain => chain.map(index => faceIndices.indexOf(index)))
const RING_LENGTH = 2 * Math.PI * 26
/** Time constant of the drawing glide. Small enough to stay on the hands, large enough to hide the step between tracker results. */
const GLIDE_MS = 45

type Point = { x: number; y: number; visibility?: number }

/**
 * Tracker results arrive a few times per second; the drawing runs at display rate and glides
 * each landmark toward its latest position, so the lines move smoothly instead of in steps.
 * This smoothing affects drawing only. The recognizer always sees raw landmarks.
 */
export function createHandOverlay(canvas: HTMLCanvasElement, video: HTMLVideoElement, ring: SVGCircleElement | null) {
  const ctx = canvas.getContext('2d')
  const tokens = getComputedStyle(document.documentElement)
  const colors = ['--coral', '--lime', '--background', '--ink-faint', '--ink-soft'].map((name) => tokens.getPropertyValue(name).trim())
  let width = 0, height = 0, dpr = 1, fit: 'contain' | 'cover' = 'contain'
  // Targets are the latest tracker result; shown points glide toward them. Both are in video coordinates (0-1).
  let target: { hands: Point[][]; pose: Point[]; face: Point[] } = { hands: [], pose: [], face: [] }
  let shown: typeof target = { hands: [], pose: [], face: [] }
  let frame = 0, last = 0
  const resize = () => {
    const rect = canvas.getBoundingClientRect()
    width = rect.width; height = rect.height; dpr = Math.min(devicePixelRatio || 1, 1.5)
    canvas.width = Math.round(width * dpr); canvas.height = Math.round(height * dpr)
    // Read once per resize: getComputedStyle on every frame forces a style recalculation.
    fit = getComputedStyle(video).objectFit === 'cover' ? 'cover' : 'contain'
    render()
  }
  const glide = (from: Point[], to: Point[], k: number) => from.length !== to.length ? to.map(p => ({ ...p }))
    : to.map((p, i) => ({ x: from[i].x + (p.x - from[i].x) * k, y: from[i].y + (p.y - from[i].y) * k, visibility: p.visibility }))
  const settled = (a: Point[], b: Point[]) => a.length === b.length && a.every((p, i) => Math.abs(p.x - b[i].x) < 3e-4 && Math.abs(p.y - b[i].y) < 3e-4)
  const render = () => {
    if (!ctx || !width || !height || !video.videoWidth) return
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, width, height)
    const mirrored = video.dataset.mirrored !== 'false'
    const project = (p: Point) => previewPoint(p as Landmark, width, height, video.videoWidth, video.videoHeight, fit, mirrored)
    const { pose, face, hands } = shown
    ctx.lineCap = 'round'; ctx.lineJoin = 'round'
    ctx.lineWidth = 2; ctx.strokeStyle = colors[1]; ctx.fillStyle = colors[1]
    for (const [a, b] of bones) {
      if (!pose[a] || !pose[b] || (pose[a].visibility ?? 1) < .55 || (pose[b].visibility ?? 1) < .55) continue
      const start = project(pose[a]), end = project(pose[b])
      ctx.beginPath(); ctx.moveTo(start.x, start.y); ctx.lineTo(end.x, end.y); ctx.stroke()
      ctx.beginPath(); ctx.arc(end.x, end.y, 3, 0, Math.PI * 2); ctx.fill()
    }
    if (face.length) {
      ctx.strokeStyle = colors[2]; ctx.lineWidth = 1
      for (const chain of faceChainSlots) {
        ctx.beginPath(); chain.forEach((slot, i) => { const p = project(face[slot]); if (!i) ctx.moveTo(p.x, p.y); else ctx.lineTo(p.x, p.y) }); ctx.stroke()
      }
    }
    for (const hand of hands.map(points => points.map(project))) {
      fingers.forEach((chain, finger) => {
        const path = () => { ctx.beginPath(); chain.forEach((joint, i) => { const p = hand[joint]; if (!i) ctx.moveTo(p.x, p.y); else ctx.lineTo(p.x, p.y) }) }
        // A wide translucent stroke under the line gives the glow; canvas shadowBlur is far more expensive.
        ctx.strokeStyle = colors[finger]; ctx.fillStyle = colors[finger]
        ctx.globalAlpha = .28; ctx.lineWidth = 6; path(); ctx.stroke()
        ctx.globalAlpha = 1; ctx.lineWidth = 2; path(); ctx.stroke()
        chain.slice(1).forEach((joint) => { const p = hand[joint]; ctx.beginPath(); ctx.arc(p.x, p.y, 2.8, 0, Math.PI * 2); ctx.fill() })
      })
      ctx.strokeStyle = colors[2]; ctx.lineWidth = 1.4; ctx.beginPath()
      ;[0, 5, 9, 13, 17, 0].forEach((joint, index) => { const p = hand[joint]; if (!index) ctx.moveTo(p.x, p.y); else ctx.lineTo(p.x, p.y) })
      ctx.stroke()
    }
  }
  const step = (now: number) => {
    const k = 1 - Math.exp(-Math.min(100, now - (last || now - 16)) / GLIDE_MS)
    last = now
    const hands = shown.hands.length === target.hands.length ? target.hands.map((hand, i) => glide(shown.hands[i], hand, k)) : target.hands.map(hand => hand.map(p => ({ ...p })))
    shown = { hands, pose: glide(shown.pose, target.pose, k), face: glide(shown.face, target.face, k) }
    render()
    const done = settled(shown.pose, target.pose) && settled(shown.face, target.face) && shown.hands.every((hand, i) => settled(hand, target.hands[i]))
    // Idle when every point has arrived; the next tracker result restarts the loop.
    frame = done ? 0 : requestAnimationFrame(step)
    if (done) last = 0
  }
  const observer = new ResizeObserver(resize)
  observer.observe(canvas); resize()
  const clear = () => {
    cancelAnimationFrame(frame); frame = 0; last = 0
    target = { hands: [], pose: [], face: [] }; shown = { hands: [], pose: [], face: [] }
    ctx?.clearRect(0, 0, canvas.width, canvas.height)
    if (ring) ring.style.strokeDashoffset = String(RING_LENGTH)
  }
  return {
    draw(next: SignFrame, stable: StableSign) {
      const face = next.signer?.face ?? []
      target = {
        hands: orderedHands(next.hands).map(hand => hand.map(({ x, y }) => ({ x, y }))),
        pose: next.signer?.pose ?? [],
        // Only the eyebrow and lip points that are drawn, not the full 478-point mesh.
        face: faceIndices.every(index => face[index]) ? faceIndices.map(index => face[index]) : [],
      }
      if (!frame) frame = requestAnimationFrame(step)
      if (ring) ring.style.strokeDashoffset = String(RING_LENGTH * (1 - stable.progress))
    },
    clear,
    destroy() { clear(); observer.disconnect() },
  }
}
