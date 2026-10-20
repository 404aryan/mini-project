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
  vm.runInNewContext(compile(name), { exports, require: (relative) => load(relative.replace(/^\.\//, '')) })
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
function host({ initialKind = 'static', wordRecognizer, failWordModel = false, bodyTracking = false } = {}) {
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
    exports, AbortController, Error, navigator: {}, performance,
    require(name) {
      if (name === 'react') return react
      if (name === './hand-overlay') return { createHandOverlay: () => ({ draw() {}, clear() {}, destroy() {} }) }
      if (name === './hand-tracker' || name === './signer-tracker') return {
        warmHandTracker: async () => ({}),
        startHandTracking: async (_video, options) => {
          starts++; loop = options
          return () => { if (loop === options) loop = null }
        },
        startSignerTracking: async (_video, options) => {
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
      if (name === './word-recognizer') return {
        createTrainedWordRecognizer: async () => { if (failWordModel) throw new Error('Model unavailable'); return wordRecognizer ?? new (load('dtw-classifier').DtwSignRecognizer)() },
        createWordRecognizer: () => new (load('dtw-classifier').DtwSignRecognizer)(),
      }
      return load(name.replace(/^\.\//, ''))
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
        hook = exports.useSignRecognition({ active, live, kind, bodyTracking, ...refs, onCommit: (token) => commits.push(token) })
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

test('repeating the same word gives each transcript entry its own id', async () => {
  let holding = false
  const recognizer = {
    labels: ['YES'], sampleCount: 2000, usesTrainedModel: true,
    replace() {}, reset() {},
    predict(frame) {
      // The committed label stays on screen while the hands are lowered.
      const commit = frame.hands.length > 0 && !holding
      holding = frame.hands.length > 0
      return { label: 'YES', confidence: .9, completed: commit, wordEvent: 'committed', progress: 1 }
    },
  }
  const h = host({ initialKind: 'words', wordRecognizer: recognizer }); await h.settle()
  await h.resolveSaved(load('word-data').emptyWordDataset())
  h.feed(300); h.feed(300, false); h.feed(300)
  assert.deepEqual(h.commits.map(token => token.text), ['YES', 'YES'])
  assert.notEqual(h.commits[0].id, h.commits[1].id)
  h.unmount()
})

test('a completed trained word reaches the transcript after release without a letter hold', async () => {
  let completed = false, seenHand = false
  const recognizer = {
    labels: ['YES'], sampleCount: 2000, usesTrainedModel: true,
    replace() {}, reset() {},
    predict(frame) {
      if (frame.hands.length) seenHand = true
      const commit = seenHand && !frame.hands.length && !completed
      if (commit) completed = true
      return completed ? { label: 'YES', confidence: .65, completed: commit, wordEvent: 'committed', progress: 1 }
        : { label: null, confidence: 0, wordEvent: 'collecting', candidates: [{ label: 'YES', confidence: .4 }] }
    },
  }
  const h = host({ initialKind: 'words', wordRecognizer: recognizer }); await h.settle()
  await h.resolveSaved(load('word-data').emptyWordDataset())
  h.feed(800)
  assert.equal(h.commits.length, 0, 'A possible match must never be silently inserted')
  assert.equal(h.current.snapshot.candidates[0].label, 'YES')
  h.feed(800, false)
  assert.deepEqual(h.commits.map(token => token.text), ['YES'])
  const { sign } = h.commits[0]
  assert.deepEqual([sign.kind, sign.canonical, sign.source, sign.commit, sign.score.value, sign.score.basis], ['word', 'word:YES', 'word-model', 'automatic', .65, 'word model vote share'])
  assert.ok(sign.endedAt - sign.startedAt >= 800, 'The span covers the signing segment, not only the commit frame')
  h.feed(1500, false)
  assert.equal(h.commits.length, 1, 'Completed word events must not repeat while hands remain lowered')
  h.unmount()
})

test('Numbers override rejects letter classifications and reports only digit coverage', async () => {
  const h = host({ initialKind: 'numbers' }); await h.settle(); await h.resolve('B')
  h.feed(1800)
  assert.equal(h.commits.length, 0)
  assert.equal(h.current.dataset.labels, 0)
  h.refresh(); await h.resolve('7'); h.feed(1800)
  assert.deepEqual(h.commits.map(token => token.text), ['7'])
  assert.equal(h.commits[0].kind, 'number')
  h.unmount()
})

test('Auto keeps personal word templates available when the pretrained model fails', async () => {
  const h = host({ initialKind: 'auto', failWordModel: true }); await h.settle()
  await h.resolve('B', 0)
  const personal = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures/words-import.json'), 'utf8'))
  await h.resolveSaved(personal, 1)
  assert.ok(h.current.dataset.readySigns.includes('HELLO'))
  assert.ok(h.current.dataset.readySigns.includes('letter:B'))
  assert.match(h.current.dataset.error, /personal words/)
  h.unmount()
  const later = host({ initialKind: 'auto', failWordModel: true }); await later.settle()
  await later.resolve('B', 0); await later.resolveSaved(load('word-data').emptyWordDataset(), 1)
  assert.ok(!later.current.dataset.readySigns.includes('HELLO'))
  later.refresh(); await later.settle(); await later.resolve('B', 2); await later.resolveSaved(personal, 3)
  assert.ok(later.current.dataset.readySigns.includes('HELLO'), 'adding recordings enables the personal backend without losing static coverage')
  later.unmount()
})

test('intent changes reuse signer tracking and reset the character stabilizer', async () => {
  const h = host({ bodyTracking: true }); await h.settle(); await h.resolve('B'); h.feed(1800)
  assert.equal(h.starts, 1)
  await h.setKind('numbers'); await h.resolve('7'); h.feed(1800)
  assert.equal(h.starts, 1, 'the expensive body/face worker remains running')
  assert.deepEqual(h.commits.map(token => token.text), ['B', '7'])
  assert.equal(h.commits[1].kind, 'number')
  h.unmount()
})
