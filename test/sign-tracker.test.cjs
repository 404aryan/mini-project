const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const vm = require('node:vm')
const ts = require('typescript')
const path = require('node:path')
const source = ts.transpileModule(fs.readFileSync(path.join(__dirname, '../lib/sign/hand-tracker.ts'), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
}).outputText

function trackerHost({ failGpu = false, failInference = false, fallback = false } = {}) {
  const callbacks = new Map(), events = new Map(), delegates = [], inferences = [], frames = [], errors = []
  let id = 0, clock = 1000
  const schedule = (fn) => { callbacks.set(++id, fn); return id }
  const cancel = (ticket) => callbacks.delete(ticket)
  const video = { readyState: 4, videoWidth: 1280, currentTime: 0 }
  if (!fallback) { video.requestVideoFrameCallback = schedule; video.cancelVideoFrameCallback = cancel }
  const document = {
    hidden: false, addEventListener: (name, fn) => events.set(name, fn), removeEventListener: (name) => events.delete(name),
  }
  const exports = {}
  vm.runInNewContext(source, {
    exports, document, requestAnimationFrame: schedule, cancelAnimationFrame: cancel, performance: { now: () => ++clock },
    require: () => ({
      FilesetResolver: { forVisionTasks: async (url) => { assert.equal(url, '/mediapipe/wasm'); return {} } },
      HandLandmarker: { createFromOptions: async (_files, options) => {
        delegates.push(options.baseOptions.delegate)
        assert.equal(options.numHands, 2); assert.equal(options.runningMode, 'VIDEO')
        assert.equal(options.baseOptions.modelAssetPath, '/mediapipe/hand_landmarker.task')
        if (failGpu && options.baseOptions.delegate === 'GPU') throw new Error('GPU unavailable')
        return { detectForVideo: (input, timestamp) => {
          assert.equal(input, video)
          if (failInference) throw new Error('Device lost')
          inferences.push(timestamp); return { landmarks: [] }
        } }
      } },
    }),
  })
  const controller = new AbortController()
  return {
    exports, video, controller, delegates, inferences, frames, errors, callbacks,
    async start() { return exports.startHandTracking(video, { signal: controller.signal, onFrame: (frame) => frames.push(frame), onError: (error) => errors.push(error) }) },
    pump(now, time) { const [ticket, fn] = [...callbacks][0]; callbacks.delete(ticket); video.currentTime = time; fn(now) },
    hide() { document.hidden = true; events.get('visibilitychange')?.() },
  }
}

test('decoded-frame loop caps inference at 30fps, skips duplicate frames, and aborts', async () => {
  const h = trackerHost(); await h.start()
  h.pump(0, 0); h.pump(10, .01); h.pump(33, .033); h.pump(66, .033); h.pump(99, .099)
  assert.equal(h.frames.length, 3)
  assert.ok(h.inferences.every((value, i, all) => !i || value > all[i - 1]))
  h.controller.abort(); assert.equal(h.callbacks.size, 0)
})

test('GPU init failure falls back to CPU; rAF fallback also stops on visibilitychange', async () => {
  const h = trackerHost({ failGpu: true, fallback: true }); await h.start()
  assert.deepEqual(h.delegates, ['GPU', 'CPU'])
  h.pump(0, 0); assert.equal(h.frames.length, 1)
  h.hide(); assert.equal(h.callbacks.size, 0)
})

test('aborted initialization schedules nothing; inference failure ends the loop', async () => {
  const cancelled = trackerHost(); cancelled.controller.abort(); await cancelled.start()
  assert.equal(cancelled.callbacks.size, 0)
  const failed = trackerHost({ failInference: true }); await failed.start(); failed.pump(0, 0)
  assert.equal(failed.errors.length, 1); assert.equal(failed.callbacks.size, 0)
})
