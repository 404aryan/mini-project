import type { SignFrame } from './types'
import { startHandTracking } from './hand-tracker'

export type TrackingStatus = { mode: 'loading' | 'signer' | 'hands'; pose: boolean; face: boolean; message: string; fps: number; p50Ms: number; p95Ms: number }
export const initialTracking: TrackingStatus = { mode: 'loading', pose: false, face: false, message: 'Preparing body and face tracking', fps: 0, p50Ms: 0, p95Ms: 0 }

/** One transferred image, common timestamps, one query in flight, no frame queue. */
export async function startSignerTracking(video: HTMLVideoElement, options: {
  signal: AbortSignal; onFrame: (frame: SignFrame) => void; onError: (error: unknown) => void; onStatus: (status: TrackingStatus) => void
}) {
  let worker: Worker | null = null, stopHands: (() => void) | undefined
  let stopped = options.signal.aborted || document.hidden, callback = 0, pending = false, ready = false, lastVideoTime = -1, lastSent = -Infinity
  let timeout: ReturnType<typeof setTimeout> | undefined, sequence = 0, started = 0
  let cpuAttempt = false, epoch = 0
  const samples: number[] = [], videoCallbacks = typeof video.requestVideoFrameCallback === 'function'
  let status = { ...initialTracking }
  const publish = (next: Partial<TrackingStatus>) => { status = { ...status, ...next }; if (!stopped) options.onStatus(status) }
  const stop = () => {
    if (stopped) return
    stopped = true; clearTimeout(timeout); worker?.terminate(); worker = null; stopHands?.()
    if (videoCallbacks) video.cancelVideoFrameCallback(callback); else cancelAnimationFrame(callback)
    options.signal.removeEventListener('abort', stop); document.removeEventListener('visibilitychange', hidden)
  }
  const hidden = () => { if (document.hidden) stop() }
  const fallback = async () => {
    if (stopped || status.mode === 'hands') return
    clearTimeout(timeout); worker?.terminate(); worker = null
    if (!cpuAttempt && typeof Worker !== 'undefined' && typeof OffscreenCanvas !== 'undefined') {
      cpuAttempt = true; ready = false; pending = false
      if (videoCallbacks) video.cancelVideoFrameCallback(callback); else cancelAnimationFrame(callback)
      publish({ mode: 'loading', message: 'Retrying body and face tracking on CPU' })
      try { launch('CPU'); return } catch { /* Use the legacy hands-only loop. */ }
    }
    publish({ mode: 'hands', pose: false, face: false, message: 'Hands-only fallback · body/face tracking unavailable' })
    try { stopHands = await startHandTracking(video, options); if (stopped) stopHands() }
    catch (error) { if (!stopped) options.onError(error) }
  }
  if (stopped) return stop
  options.signal.addEventListener('abort', stop, { once: true }); document.addEventListener('visibilitychange', hidden)
  publish(initialTracking)
  const schedule = () => {
    if (!stopped && worker) callback = videoCallbacks ? video.requestVideoFrameCallback(tick) : requestAnimationFrame(tick)
  }
  const tick = (now: number) => {
    if (stopped || options.signal.aborted || document.hidden) { stop(); return }
    // A slow inference lowers capture cadence; decoded frames are dropped.
    const interval = samples.length ? Math.max(45, Math.min(200, samples.at(-1)! * 1.15)) : 66
    if (ready && !pending && video.readyState >= 2 && video.videoWidth && video.currentTime !== lastVideoTime && now-lastSent >= interval) {
      pending = true; lastSent = now; lastVideoTime = video.currentTime
      const captureEpoch = epoch
      // The models work on 192-256 px crops; 640 px keeps detail while cutting copy and upload cost.
      const width = Math.min(640,video.videoWidth), height = Math.round(width*video.videoHeight/video.videoWidth)
      void createImageBitmap(video,{ resizeWidth: width, resizeHeight: height }).then(image => {
        if (stopped || !worker || captureEpoch !== epoch) { image.close(); return }
        timeout = setTimeout(() => { void fallback() }, sequence ? 4000 : 12000)
        worker.postMessage({ type: 'frame', image, timestamp: now },[image])
      }).catch(() => { if (captureEpoch === epoch) { pending = false; void fallback() } })
    }
    schedule()
  }
  const launch = (delegate: 'GPU' | 'CPU') => {
    epoch++
    samples.length = 0; sequence = 0; started = 0
    const activeWorker = new Worker(new URL('./signer-tracker.worker.ts', import.meta.url))
    worker = activeWorker
    timeout = setTimeout(() => { void fallback() }, 30000)
    worker.onmessage = ({ data }) => {
      if (stopped || worker !== activeWorker) return
      if (data.type === 'ready') {
        clearTimeout(timeout); ready = true
        publish({ mode: 'signer', ...data.capabilities, message: data.unavailable.length ? `${data.unavailable.join(' and ')} tracking unavailable` : 'Hands, body and face tracking' })
        schedule()
      } else if (data.type === 'frame') {
        clearTimeout(timeout); pending = false
        if (performance.now()-data.frame.timestamp > 700) return
        samples.push(data.inferenceMs); if (samples.length > 90) samples.shift()
        const sorted = [...samples].sort((a,b) => a-b)
        started ||= data.frame.timestamp; sequence++
        publish({ fps: sequence > 1 ? Math.round((sequence-1)*1000/Math.max(1,data.frame.timestamp-started)) : 0,
          p50Ms: Math.round(sorted[Math.floor((sorted.length-1)*.5)]), p95Ms: Math.round(sorted[Math.floor((sorted.length-1)*.95)]) })
        options.onFrame(data.frame)
      } else void fallback()
    }
    worker.onerror = event => { event.preventDefault(); if (worker === activeWorker) void fallback() }
    worker.postMessage({ type: 'init', origin: location.origin, delegate })
  }
  try { launch('GPU') } catch { await fallback() }
  return stop
}
