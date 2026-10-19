import type { RefObject } from 'react'

export function HandOverlay({ canvasRef }: { canvasRef: RefObject<HTMLCanvasElement | null> }) {
  return <canvas ref={canvasRef} className="sign-hand-overlay" aria-hidden="true" />
}
