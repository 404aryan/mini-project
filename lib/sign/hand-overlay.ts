import { orderedHands, previewPoint } from './features'
import type { SignFrame } from './types'
import type { StableSign } from './stabilizer'

const fingers = [[0, 1, 2, 3, 4], [0, 5, 6, 7, 8], [0, 9, 10, 11, 12], [0, 13, 14, 15, 16], [0, 17, 18, 19, 20]]
const RING_LENGTH = 2 * Math.PI * 26

export function createHandOverlay(canvas: HTMLCanvasElement, video: HTMLVideoElement, ring: SVGCircleElement | null) {
  const ctx = canvas.getContext('2d')
  const tokens = getComputedStyle(document.documentElement)
  const colors = ['--coral', '--lime', '--background', '--ink-faint', '--ink-soft'].map((name) => tokens.getPropertyValue(name).trim())
  let smoothed: { x: number; y: number }[][] = []
  let width = 0, height = 0, dpr = 1
  const resize = () => {
    const rect = canvas.getBoundingClientRect()
    width = rect.width; height = rect.height; dpr = Math.min(devicePixelRatio || 1, 1.5)
    canvas.width = Math.round(width * dpr); canvas.height = Math.round(height * dpr)
    smoothed = []
  }
  const observer = new ResizeObserver(resize)
  observer.observe(canvas); resize()
  const clear = () => {
    ctx?.clearRect(0, 0, canvas.width, canvas.height)
    smoothed = []
    if (ring) ring.style.strokeDashoffset = String(RING_LENGTH)
  }
  return {
    draw(frame: SignFrame, stable: StableSign) {
      if (!ctx || !width || !height || !video.videoWidth) return
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, width, height)
      const hands = orderedHands(frame.hands)
      const fit = getComputedStyle(video).objectFit === 'contain' ? 'contain' : 'cover'
      const mirrored = video.dataset.mirrored !== 'false'
      const project = (p: import('./types').Landmark) => previewPoint(p,width,height,video.videoWidth,video.videoHeight,fit,mirrored)
      const pose = frame.signer?.pose ?? [], face = frame.signer?.face ?? []
      ctx.shadowBlur = 0; ctx.lineWidth = 2; ctx.strokeStyle = colors[1]; ctx.fillStyle = colors[1]
      for (const [a,b] of [[11,12],[11,13],[13,15],[12,14],[14,16],[11,23],[12,24]]) {
        if (!pose[a] || !pose[b] || (pose[a].visibility ?? 1) < .55 || (pose[b].visibility ?? 1) < .55) continue
        const start = project(pose[a]), end = project(pose[b])
        ctx.beginPath(); ctx.moveTo(start.x,start.y); ctx.lineTo(end.x,end.y); ctx.stroke()
        ctx.beginPath(); ctx.arc(end.x,end.y,3,0,Math.PI*2); ctx.fill()
      }
      ctx.strokeStyle = colors[2]; ctx.lineWidth = 1
      for (const chain of [[70,63,105,66,107],[336,296,334,293,300],[61,40,37,0,267,270,291],[61,84,17,314,291]]) {
        if (chain.some(index => !face[index])) continue
        ctx.beginPath(); chain.forEach((index,i) => { const p = project(face[index]); if (!i) ctx.moveTo(p.x,p.y); else ctx.lineTo(p.x,p.y) }); ctx.stroke()
      }
      if (hands.length !== smoothed.length) smoothed = []
      smoothed = hands.map((hand, handIndex) => hand.map((p, joint) => {
        const next = previewPoint(p, width, height, video.videoWidth, video.videoHeight, fit, mirrored)
        const previous = smoothed[handIndex]?.[joint]
        // This smoothing affects drawing only. The recognizer always sees raw landmarks.
        return previous ? { x: previous.x + (next.x - previous.x) * .48, y: previous.y + (next.y - previous.y) * .48 } : next
      }))
      smoothed.forEach((hand) => {
        fingers.forEach((chain, finger) => {
          ctx.strokeStyle = colors[finger]; ctx.fillStyle = colors[finger]
          ctx.lineWidth = 2; ctx.lineCap = 'round'; ctx.shadowColor = colors[finger]; ctx.shadowBlur = 7
          ctx.beginPath()
          chain.forEach((joint, i) => { const p = hand[joint]; if (!i) ctx.moveTo(p.x, p.y); else ctx.lineTo(p.x, p.y) })
          ctx.stroke()
          chain.slice(1).forEach((joint) => { const p = hand[joint]; ctx.beginPath(); ctx.arc(p.x, p.y, 2.8, 0, Math.PI * 2); ctx.fill() })
        })
        ctx.shadowBlur = 0; ctx.strokeStyle = colors[2]; ctx.lineWidth = 1.4; ctx.beginPath()
        ;[0, 5, 9, 13, 17, 0].forEach((joint, index) => { const p = hand[joint]; if (!index) ctx.moveTo(p.x, p.y); else ctx.lineTo(p.x, p.y) })
        ctx.stroke()
      })
      if (ring) ring.style.strokeDashoffset = String(RING_LENGTH * (1 - stable.progress))
    },
    clear,
    destroy() { clear(); observer.disconnect() },
  }
}
