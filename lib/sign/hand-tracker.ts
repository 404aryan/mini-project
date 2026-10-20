import type { GestureRecognizer } from '@mediapipe/tasks-vision'
import type { SignFrame } from './types'

let task: Promise<GestureRecognizer> | null = null

// MediaPipe's WASM runtime prints its own informational lines, such as "INFO:
// Created TensorFlow Lite XNNPACK delegate for CPU.", through console.error, and
// the Next.js dev overlay reports every console.error as an app error. While a
// MediaPipe call runs, only lines starting with "INFO: " are dropped; real
// errors still reach the console. A depth count keeps overlapping calls safe.
let quietDepth = 0
let reportError: ((...args: unknown[]) => void) | null = null
function quietRuntimeInfo<T>(run: () => T): T {
  const sink = globalThis.console
  if (!sink) return run()
  if (quietDepth++ === 0) {
    const report = sink.error
    reportError = report
    sink.error = (...args: unknown[]) => {
      if (typeof args[0] === 'string' && args[0].startsWith('INFO: ')) return
      report.apply(sink, args)
    }
  }
  const leave = () => { if (--quietDepth === 0 && reportError) { sink.error = reportError; reportError = null } }
  let result: T
  try { result = run() } catch (error) { leave(); throw error }
  if (typeof (result as { then?: unknown } | null)?.then === "function") return (result as Promise<unknown>).finally(leave) as T
  leave()
  return result
}

/** Shared, lazy initialization. Warm-up never reads the camera. */
export function warmHandTracker(): Promise<GestureRecognizer> {
  if (!task) {
    task = (async () => {
      const { FilesetResolver, GestureRecognizer } = await import('@mediapipe/tasks-vision')
      const files = await FilesetResolver.forVisionTasks('/mediapipe/wasm')
      const create = (delegate: 'GPU' | 'CPU') => quietRuntimeInfo(() => GestureRecognizer.createFromOptions(files, {
        baseOptions: { modelAssetPath: '/mediapipe/gesture_recognizer.task', delegate },
        runningMode: 'VIDEO',
        numHands: 2,
      }))
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
        const result = quietRuntimeInfo(() => tracker.recognizeForVideo(video, performance.now()))
        options.onFrame({ hands: result.landmarks, timestamp: now,
          gestures: result.gestures.flatMap(categories => categories[0] ? [{ name: categories[0].categoryName, score: categories[0].score }] : []),
        })
      } catch (error) { stop(); options.onError(error); return }
    }
    schedule()
  }
  options.signal.addEventListener('abort', stop, { once: true })
  document.addEventListener('visibilitychange', visibility)
  schedule()
  return stop
}
