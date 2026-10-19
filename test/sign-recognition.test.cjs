const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')
const ts = require('typescript')

const modules = new Map()
function load(name) {
  if (modules.has(name)) return modules.get(name)
  const exports = {}
  modules.set(name, exports)
  vm.runInNewContext(compile(name), { exports, require: (relative) => load(relative.replace('./', '')) })
  return exports
}
function compile(name) {
  return ts.transpileModule(fs.readFileSync(path.join(__dirname, '../lib/sign', `${name}.ts`), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText
}
const { extractFeatures } = load('features')
const sameDeps = (a, b) => a && b && a.length === b.length && a.every((value, index) => Object.is(value, b[index]))

// Geometric pipeline fixtures only; these are not ISL annotations or shipped samples.
const hands = [Array.from({ length: 21 }, (_, index) => ({
  x: .2 + (index ? (index % 4 + 1) * .018 : 0), y: .7 - index * .015, z: index * .001,
}))]
const dataset = (label) => ({
  version: 1, normalization: 'wrist-maxdist-v1',
  samples: label ? Array.from({ length: 3 }, (_, i) => ({ id: `${label}-${i}`, label, features: extractFeatures(hands) })) : [],
})

// Exercise the actual recognition hook, classifier and stabilizer while controlling
// camera frames and async storage. No browser, network, or saved user data is used.
function host({ initialKind = 'static' } = {}) {
  const slots = [], effects = [], reads = [], commits = []
  let cursor = 0, dirty = true, hook, notify, loop, starts = 0
  let active = true, live = true, now = 0, kind = initialKind
  const refs = { videoRef: { current: {} }, canvasRef: { current: {} }, ringRef: { current: {} } }
  const react = {
    useRef(initial) { const index = cursor++; return slots[index] ??= { current: initial } },
    useState(initial) {
      const index = cursor++
      slots[index] ??= { value: initial }
      return [slots[index].value, (next) => {
        const value = typeof next === 'function' ? next(slots[index].value) : next
        if (!Object.is(value, slots[index].value)) { slots[index].value = value; dirty = true }
      }]
    },
    useCallback(fn, deps) {
      const index = cursor++
      if (!sameDeps(slots[index]?.deps, deps)) slots[index] = { value: fn, deps }
      return slots[index].value
    },
    useEffect(fn, deps) {
      const index = cursor++
      if (!sameDeps(slots[index]?.deps, deps)) {
        const previous = slots[index]
        slots[index] = { deps, cleanup: previous?.cleanup }
        effects.push(() => { previous?.cleanup?.(); slots[index].cleanup = fn() })
      }
    },
  }
  const exports = {}
  vm.runInNewContext(compile('use-sign-recognition'), {
    exports, AbortController, Error, navigator: {},
    require(name) {
      if (name === 'react') return react
      if (name === './hand-overlay') return { createHandOverlay: () => ({ draw() {}, clear() {}, destroy() {} }) }
      if (name === './hand-tracker') return {
        warmHandTracker: async () => ({}),
        startHandTracking: async (_video, options) => {
          starts++; loop = options
          return () => { if (loop === options) loop = null }
        },
      }
      if (name === './sample-store') return {
        readRecognitionDataset: () => new Promise((resolve, reject) => reads.push({ resolve, reject })),
        subscribeSampleChanges: (fn) => { notify = fn; return () => { notify = null } },
      }
      if (name === './word-store') return {
        readWordRecognitionDataset: () => new Promise((resolve, reject) => reads.push({ resolve, reject })),
        subscribeWordChanges: (fn) => { notify = fn; return () => { notify = null } },
      }
      if (name === './word-recognizer') return { createWordRecognizer: () => new (load('dtw-classifier').DtwSignRecognizer)() }
      return load(name.replace('./', ''))
    },
  })
  const h = {
    commits, reads,
    get current() { return hook },
    get starts() { return starts },
    flush() {
      let count = 0
      while (dirty) {
        assert.ok(count++ < 25, 'Recognition updates must settle')
        dirty = false; cursor = 0
        hook = exports.useSignRecognition({ active, live, kind, ...refs, onCommit: (token) => commits.push(token) })
        while (effects.length) effects.shift()()
      }
    },
    async settle() { for (let i = 0; i < 12; i++) { await Promise.resolve(); h.flush() } },
    async resolve(label, index = reads.length - 1) {
      reads[index].resolve({ dataset: dataset(label), warning: '' }); await h.settle()
    },
    async resolveSaved(saved, index = reads.length - 1) { reads[index].resolve({ dataset: saved, warning: '' }); await h.settle() },
    async setKind(value) { kind = value; dirty = true; h.flush(); await h.settle() },
    frame(input) { loop.onFrame({ hands: input, timestamp: now }); now += 68; h.flush() },
    refresh() { notify(); h.flush() },
    feed(duration = 1400, present = true) {
      const end = now + duration
      for (; now < end; now += 34) {
        assert.ok(loop && !loop.signal.aborted, 'Live recognition must keep receiving frames')
        loop.onFrame({ hands: present ? hands : [], timestamp: now }); h.flush()
      }
    },
    async setActive(value) { active = value; live = value; dirty = true; h.flush(); await h.settle() },
    unmount() { slots.forEach((slot) => slot?.cleanup?.()) },
  }
  h.flush()
  return h
}

test('library focus refresh preserves the held-letter lock, including while storage is slow', async () => {
  const h = host(); await h.resolve('A')
  h.feed(); assert.deepEqual(h.commits.map((t) => t.text), ['A'])
  const starts = h.starts
  h.refresh(); h.feed(1800)
  await h.resolve('A'); h.feed()
  assert.deepEqual(h.commits.map((t) => t.text), ['A'])
  assert.equal(h.starts, starts, 'Sample refresh must not restart inference or its stabilizer')
  h.feed(340, false); h.feed()
  assert.deepEqual(h.commits.map((t) => t.text), ['A', 'A'], 'A real release still permits double letters')
  h.unmount()
})

test('new and removed labels take effect without restarting the live tracker', async () => {
  const h = host(); await h.resolve(null)
  h.feed(); assert.equal(h.commits.length, 0)
  const starts = h.starts
  h.refresh(); await h.resolve('B'); h.feed()
  assert.deepEqual(h.commits.map((t) => t.text), ['B'])
  h.refresh(); await h.resolve(null); h.feed(340, false); h.feed()
  assert.equal(h.commits.length, 1, 'Removed samples cannot keep predicting their old label')
  assert.equal(h.starts, starts)
  h.unmount()
})

test('failed and superseded sample reads cannot install stale recognition data', async () => {
  const h = host(); await h.resolve('A')
  h.feed()
  h.refresh(); const stale = h.reads.length - 1
  h.refresh(); await h.resolve('B')
  await h.resolve('A', stale); h.feed()
  assert.deepEqual(h.commits.map((t) => t.text), ['A', 'B'])
  h.refresh(); h.reads.at(-1).reject(new Error('Device storage unavailable')); await h.settle()
  h.feed(340, false); h.feed()
  assert.equal(h.current.dataset.labels, 0)
  assert.match(h.current.dataset.error, /storage unavailable/)
  assert.equal(h.commits.length, 2)
  h.unmount()
})

test('leaving the stage cancels frames and discards a pending sample refresh', async () => {
  const h = host(); await h.resolve('A')
  h.feed(); h.refresh()
  await h.setActive(false); await h.resolve('B')
  assert.deepEqual(h.commits.map((t) => t.text), ['A'])
  await h.setActive(true); await h.resolve(null); h.feed()
  assert.equal(h.commits.length, 1, 'Reopening with an empty library cannot use the previous classifier')
  h.unmount()
})

test('switching to words rejects a pending static read and never reuses the letter classifier', async () => {
  const h = host(), staticRead = 0
  await h.setKind('words')
  const { emptyWordDataset } = load('word-data')
  await h.resolveSaved(emptyWordDataset())
  await h.resolve('A', staticRead)
  h.feed(); assert.equal(h.commits.length, 0)
  await h.setKind('static'); await h.resolve('A'); h.feed()
  assert.deepEqual(h.commits.map((token) => token.text), ['A'])
  h.unmount()
})

test('word-mode library refresh preserves the matcher sequence and held-word lock', async () => {
  const h = host({ initialKind: 'words' }); await h.settle()
  const { SequenceEncoder } = load('sequence-features'), { emptyWordDataset } = load('word-data')
  const moved = (t) => hands.map((hand) => hand.map((p) => ({ ...p, x: p.x + .2 * t })))
  const encoder = new SequenceEncoder(), frames = Array.from({ length: 30 }, (_, i) => encoder.encode({ hands: moved(i / 29), timestamp: i * 68 }))
  const saved = { ...emptyWordDataset(), samples: Array.from({ length: 3 }, (_, i) => ({ id: `motion-${i}`, label: 'HELLO', handCount: 1, durationMs: 1972, frames })) }
  await h.resolveSaved(saved)
  for (let i = 0; i < 30; i++) h.frame(moved(i / 29))
  for (let i = 0; i < 30; i++) h.frame(moved(1))
  assert.deepEqual(h.commits.map((token) => token.text), ['HELLO'])
  const starts = h.starts
  h.refresh()
  for (let i = 0; i < 20; i++) h.frame(moved(1))
  await h.resolveSaved(saved)
  for (let i = 0; i < 30; i++) h.frame(moved(1))
  assert.deepEqual(h.commits.map((token) => token.text), ['HELLO'])
  assert.equal(h.starts, starts)
  h.unmount()
})
