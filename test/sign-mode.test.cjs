const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')
const ts = require('typescript')

// Exercise the real hook's media lifecycle without a camera, browser, or network.
// This small hook host runs state/effect updates; visual QA remains a browser check.
const source = ts.transpileModule(fs.readFileSync(path.join(__dirname, '../lib/sign/use-sign-mode.ts'), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
}).outputText
const sameDeps = (a, b) => a && b && a.length === b.length && a.every((value, index) => Object.is(value, b[index]))

function host({ consent = true, storageAvailable = true, url = 'https://example.test/', secure = true, surface = 'stage' } = {}) {
  const slots = [], effects = [], requests = [], documentEvents = new Map(), windowEvents = new Map()
  const storage = new Map(consent ? [['yap-render-camera-privacy-v1', 'accepted']] : [])
  let cursor = 0, dirty = true, hook
  const document = {
    hidden: false, body: { style: { overflow: '' } }, activeElement: null,
    querySelector: () => null, querySelectorAll: () => [],
    addEventListener: (name, fn) => documentEvents.set(name, fn),
    removeEventListener: (name) => documentEvents.delete(name),
  }
  const window = {
    isSecureContext: secure, location: { href: url, search: new URL(url).search },
    history: { pushState: (_state, _title, next) => {
      window.location.href = String(next); window.location.search = new URL(next).search
    } },
    setTimeout: () => 1,
    addEventListener: (name, fn) => windowEvents.set(name, fn),
    removeEventListener: (name) => windowEvents.delete(name),
  }
  const react = {
    useRef: (initial) => { const index = cursor++; return slots[index] ??= { current: initial } },
    useState: (initial) => {
      const index = cursor++
      slots[index] ??= { value: initial }
      return [slots[index].value, (next) => {
        const value = typeof next === 'function' ? next(slots[index].value) : next
        if (!Object.is(value, slots[index].value)) { slots[index].value = value; dirty = true }
      }]
    },
    useCallback: (fn, deps) => {
      const index = cursor++
      if (!sameDeps(slots[index]?.deps, deps)) slots[index] = { value: fn, deps }
      return slots[index].value
    },
    useEffect: (fn, deps) => {
      const index = cursor++
      if (!sameDeps(slots[index]?.deps, deps)) {
        const previous = slots[index]
        slots[index] = { deps, cleanup: previous?.cleanup }
        effects.push(() => { previous?.cleanup?.(); slots[index].cleanup = fn() })
      }
    },
  }
  const exports = {}
  vm.runInNewContext(source, {
    exports, require: (name) => {
      if (name === 'react') return react
      if (name === './hand-tracker') return { warmHandTracker: async () => ({}) }
      throw new Error(`Unexpected import: ${name}`)
    },
    window, document, URL, URLSearchParams, Error, HTMLElement: class {}, innerWidth: 1280, innerHeight: 800,
    localStorage: {
      getItem: (key) => { if (!storageAvailable) throw new Error('Storage blocked'); return storage.get(key) },
      setItem: (key, value) => { if (!storageAvailable) throw new Error('Storage blocked'); storage.set(key, value) },
    },
    navigator: { mediaDevices: { getUserMedia: (constraints) => new Promise((resolve, reject) => requests.push({ constraints, resolve, reject })) } },
    requestAnimationFrame: () => 1, cancelAnimationFrame: () => {}, clearTimeout: () => {},
  })
  const h = {
    requests, document, window, storage,
    get current() { return hook },
    flush() {
      let count = 0
      while (dirty) {
        assert.ok(count++ < 25, 'Hook updates must settle')
        dirty = false; cursor = 0; hook = exports.useSignMode({ surface })
        while (effects.length) effects.shift()()
      }
    },
    async settle() { for (let i = 0; i < 8; i++) { await Promise.resolve(); h.flush() } },
    open() { hook.open({ x: 640, y: 750 }); h.flush() },
    visibility(hidden) { document.hidden = hidden; documentEvents.get('visibilitychange')?.(); h.flush() },
    pagehide() { windowEvents.get('pagehide')?.(); h.flush() },
    pageshow() { windowEvents.get('pageshow')?.(); h.flush() },
    popstate(nextUrl) { window.location.search = new URL(nextUrl).search; windowEvents.get('popstate')?.(); h.flush() },
    unmount() { slots.forEach((slot) => slot?.cleanup?.()) },
  }
  h.flush()
  return h
}

function mediaStream() {
  const track = { stopped: false, readyState: 'live', stop() { this.stopped = true; this.readyState = 'ended' }, onended: null, onmute: null }
  return { track, getTracks: () => [track], getVideoTracks: () => [track] }
}

test('first tap shows the privacy primer; acceptance requests video only', async () => {
  const h = host({ consent: false })
  assert.equal(h.requests.length, 0)
  h.open()
  assert.equal(h.current.status, 'primer')
  assert.equal(h.requests.length, 0)
  h.current.acceptPrivacy(); h.flush()
  assert.equal(h.current.status, 'requesting')
  assert.deepEqual(JSON.parse(JSON.stringify(h.requests[0].constraints)), {
    video: { facingMode: 'user', width: { ideal: 1280 }, height: { ideal: 720 } }, audio: false,
  })
  assert.equal(h.storage.get('yap-render-camera-privacy-v1'), 'accepted')
  h.requests[0].resolve(mediaStream()); await h.settle()
  assert.equal(h.current.status, 'live')
  h.unmount()
})

test('permission resolving after exit cannot restart video', async () => {
  const h = host(); h.open()
  h.current.close(); h.flush()
  const stream = mediaStream(); h.requests[0].resolve(stream); await h.settle()
  assert.equal(stream.track.stopped, true)
  assert.equal(h.current.active, false)
  assert.equal(h.current.status, 'idle')
  assert.equal(new URL(h.window.location.href).searchParams.has('mode'), false)
})

test('rapid exit and reopen discard the previous permission response', async () => {
  const h = host(); h.open(); h.current.close(); h.flush(); h.open()
  const old = mediaStream(), latest = mediaStream()
  h.requests[1].resolve(latest); await h.settle()
  h.requests[0].resolve(old); await h.settle()
  assert.equal(old.track.stopped, true)
  assert.equal(latest.track.stopped, false)
  assert.equal(h.current.status, 'live')
  h.unmount(); assert.equal(latest.track.stopped, true)
})

test('exit stops tracks and detaches the video synchronously', async () => {
  const h = host(); h.open()
  const video = { srcObject: null, play: async () => {} }, stream = mediaStream()
  h.current.attachVideo(video)
  h.requests[0].resolve(stream); await h.settle()
  assert.equal(video.srcObject, stream)
  h.current.close()
  assert.equal(stream.track.stopped, true)
  assert.equal(video.srcObject, null)
})

test('backgrounding stops video; returning does not restart without a tap', async () => {
  const h = host(); h.open()
  const stream = mediaStream(); h.requests[0].resolve(stream); await h.settle()
  h.visibility(true)
  assert.equal(stream.track.stopped, true)
  assert.equal(h.current.status, 'paused')
  h.visibility(false)
  assert.equal(h.requests.length, 1)
  h.open(); assert.equal(h.requests.length, 2)
})

test('backgrounding while permission is pending stops the late stream', async () => {
  const h = host(); h.open(); h.visibility(true)
  const stream = mediaStream(); h.requests[0].resolve(stream); await h.settle()
  assert.equal(stream.track.stopped, true)
  assert.equal(h.current.status, 'paused')
})

test('deep links select sign mode but require an explicit tap for video', () => {
  const h = host({ url: 'https://example.test/?mode=sign&demo=1' })
  assert.equal(h.current.active, true)
  assert.equal(h.current.status, 'idle')
  assert.equal(h.requests.length, 0)
  h.open(); assert.equal(h.requests.length, 1)
  h.current.close(); h.flush()
  assert.equal(new URL(h.window.location.href).searchParams.get('demo'), '1')
})

test('Back/Forward mode selection never starts video', () => {
  const h = host(); h.popstate('https://example.test/?mode=sign')
  assert.equal(h.current.active, true)
  assert.equal(h.requests.length, 0)
  h.popstate('https://example.test/')
  assert.equal(h.current.active, false)
})

test('denied and missing cameras expose their respective recovery states', async () => {
  for (const [name, expected] of [['NotAllowedError', 'denied'], ['NotFoundError', 'missing'], ['NotReadableError', 'busy']]) {
    const h = host(); h.open()
    h.requests[0].reject(Object.assign(new Error(name), { name })); await h.settle()
    assert.equal(h.current.status, expected)
    h.current.requestCamera(); h.flush()
    assert.equal(h.current.status, 'requesting')
  }
})

test('unmount invalidates any outstanding camera permission request', async () => {
  const h = host(); h.open(); h.unmount()
  const stream = mediaStream(); h.requests[0].resolve(stream); await h.settle()
  assert.equal(stream.track.stopped, true)
})

test('insecure contexts explain camera requirements without requesting media', () => {
  const h = host({ secure: false }); h.open()
  assert.equal(h.current.status, 'unsupported')
  assert.equal(h.requests.length, 0)
})

test('device disconnection pauses and releases the stream', async () => {
  const h = host(); h.open()
  const stream = mediaStream(); h.requests[0].resolve(stream); await h.settle()
  stream.track.onended(); h.flush()
  assert.equal(stream.track.stopped, true)
  assert.equal(h.current.status, 'paused')
})

test('training camera uses the same media guards without URL changes or a modal scroll lock', async () => {
  const h = host({ surface: 'training', url: 'https://example.test/sign/train?mode=sign' })
  assert.equal(h.current.active, false)
  assert.equal(h.requests.length, 0)
  h.open()
  assert.equal(h.document.body.style.overflow, '')
  assert.equal(h.window.location.href, 'https://example.test/sign/train?mode=sign')
  h.current.close(); h.flush()
  const late = mediaStream(); h.requests[0].resolve(late); await h.settle()
  assert.equal(late.track.stopped, true)
  assert.equal(h.window.location.href, 'https://example.test/sign/train?mode=sign')
})

test('backgrounding cannot bypass the first-use primer on either camera surface', () => {
  for (const surface of ['stage', 'training']) {
    const h = host({ consent: false, surface }); h.open()
    h.visibility(true); h.visibility(false)
    assert.equal(h.current.status, 'primer')
    h.current.requestCamera(); h.flush()
    assert.equal(h.current.status, 'primer')
    assert.equal(h.requests.length, 0)
    h.pagehide(); h.pageshow()
    assert.equal(h.current.status, 'primer')
    h.unmount()
  }
})

test('privacy acceptance survives mode changes in the current visit when storage is blocked', async () => {
  const h = host({ consent: false, storageAvailable: false }); h.open()
  assert.equal(h.current.status, 'primer')
  h.current.acceptPrivacy(); h.flush()
  const stream = mediaStream(); h.requests[0].resolve(stream); await h.settle()
  h.current.close(); h.flush(); h.open()
  assert.equal(h.requests.length, 2)
  assert.equal(h.current.status, 'requesting')
  assert.equal(stream.track.stopped, true)
  h.unmount()
})

test('camera mute stops capture, detaches the preview and requires an explicit resume', async () => {
  const h = host(); h.open()
  const video = { srcObject: null, play: async () => {} }, stream = mediaStream()
  h.current.attachVideo(video)
  h.requests[0].resolve(stream); await h.settle()
  assert.equal(typeof stream.track.onmute, 'function')
  const staleInterruption = stream.track.onmute
  stream.track.onmute(); h.flush()
  assert.equal(h.current.status, 'paused')
  assert.equal(video.srcObject, null)
  assert.equal(stream.track.stopped, true)
  assert.equal(stream.track.onended, null)
  assert.equal(stream.track.onmute, null)
  assert.equal(h.requests.length, 1)
  h.open()
  const resumed = mediaStream(); h.requests[1].resolve(resumed); await h.settle()
  staleInterruption(); h.flush()
  assert.equal(h.current.status, 'live')
  assert.equal(resumed.track.stopped, false)
  h.unmount()
})

test('camera disconnection during pending video playback cannot later mark the stream live', async () => {
  const h = host(); h.open()
  let finishPlayback
  const video = { srcObject: null, play: () => new Promise((resolve) => { finishPlayback = resolve }) }
  h.current.attachVideo(video)
  const stream = mediaStream(); h.requests[0].resolve(stream); await h.settle()
  assert.equal(typeof stream.track.onended, 'function')
  stream.track.onended(); h.flush()
  assert.equal(h.current.status, 'paused')
  assert.equal(stream.track.stopped, true)
  finishPlayback(); await h.settle()
  assert.equal(h.current.status, 'paused')
  assert.equal(video.srcObject, null)
  h.unmount()
})

test('pagehide stops capture and rejects late permissions without relying on visibilitychange', async () => {
  for (const surface of ['stage', 'training']) {
    for (const pending of [false, true]) {
      const h = host({ surface }); h.open()
      const stream = mediaStream()
      if (!pending) { h.requests[0].resolve(stream); await h.settle() }
      h.pagehide()
      if (pending) { h.requests[0].resolve(stream); await h.settle() }
      assert.equal(stream.track.stopped, true)
      assert.equal(h.current.status, 'paused')
      h.pageshow()
      assert.equal(h.requests.length, 1)
      h.open(); assert.equal(h.requests.length, 2)
      h.unmount()
    }
  }
})

test('requests while the page is hidden cannot start another camera acquisition', async () => {
  const h = host(); h.open(); h.visibility(true)
  h.current.requestCamera(); h.flush()
  assert.equal(h.requests.length, 1)
  assert.equal(h.current.status, 'paused')
  const stream = mediaStream(); h.requests[0].resolve(stream); await h.settle()
  assert.equal(stream.track.stopped, true)
  h.unmount()
})

test('already-ended tracks and streams without video tracks never report a live camera', async () => {
  for (const ended of [false, true]) {
    const h = host(); h.open()
    const stream = mediaStream()
    if (ended) stream.track.readyState = 'ended'
    else stream.getVideoTracks = () => []
    h.requests[0].resolve(stream); await h.settle()
    assert.equal(h.current.status, 'paused')
    assert.equal(stream.track.stopped, true)
    h.unmount()
  }
})
