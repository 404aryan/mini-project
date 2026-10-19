import type { HandLandmarker } from '@mediapipe/tasks-vision'
import type { SignFrame } from './types'

let task: Promise<HandLandmarker> | null = null

/** Shared, lazy initialization. Warm-up never reads the camera. */
export function warmHandTracker(): Promise<HandLandmarker> {
  if (!task) {
    task = (async () => {
      const { FilesetResolver, HandLandmarker } = await import('@mediapipe/tasks-vision')
      const files = await FilesetResolver.forVisionTasks('/mediapipe/wasm')
      const create = (delegate: 'GPU' | 'CPU') => HandLandmarker.createFromOptions(files, {
        baseOptions: { modelAssetPath: '/mediapipe/hand_landmarker.task', delegate },
        runningMode: 'VIDEO',
        numHands: 2,
      })
      try { return await create('GPU') } catch { return await create('CPU') }
    })().catch((error) => { task = null; throw error })
  }
  return task
}

export async function resetHandTracker() {
  const previous = task
  task = null
  try { (await previous)?.close() } catch { /* A failed initialization has nothing to dispose. */ }
}

/** Decoded video frames only; one synchronous inference at a time, outside React. */
export async function startHandTracking(video: HTMLVideoElement, options: {
  signal: AbortSignal; onFrame: (frame: SignFrame) => void; onError: (error: unknown) => void
}) {
  const tracker = await warmHandTracker()
  if (options.signal.aborted || document.hidden) return () => {}
  let stopped = false, callback = 0, lastFrameAt = -Infinity, lastVideoTime = -1
  const videoCallbacks = typeof video.requestVideoFrameCallback === 'function'
  const stop = () => {
    stopped = true
    if (videoCallbacks) video.cancelVideoFrameCallback(callback)
    else cancelAnimationFrame(callback)
    options.signal.removeEventListener('abort', stop)
    document.removeEventListener('visibilitychange', visibility)
  }
  const visibility = () => { if (document.hidden) stop() }
  const schedule = () => {
    if (!stopped) callback = videoCallbacks ? video.requestVideoFrameCallback(tick) : requestAnimationFrame(tick)
  }
  const tick = (now: number) => {
    if (stopped || options.signal.aborted || document.hidden) { stop(); return }
    if (video.readyState >= 2 && video.videoWidth && video.currentTime !== lastVideoTime && now - lastFrameAt >= 1000 / 30 - .5) {
      lastFrameAt = now; lastVideoTime = video.currentTime
      try {
        // The element is mirrored by CSS; inference receives original pixels.
        const result = tracker.detectForVideo(video, performance.now())
        options.onFrame({ hands: result.landmarks, timestamp: now })
      } catch (error) { stop(); options.onError(error); return }
    }
    schedule()
  }
  options.signal.addEventListener('abort', stop, { once: true })
  document.addEventListener('visibilitychange', visibility)
  schedule()
  return stop
}
