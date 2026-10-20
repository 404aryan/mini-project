const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const vm = require('node:vm')
const path = require('node:path')
const ts = require('typescript')
const cache = new Map()
function load(name) {
  if (cache.has(name)) return cache.get(name)
  const exports = {}; cache.set(name, exports)
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(path.join(__dirname, '../lib/sign', `${name}.ts`), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText, { exports, require: (name) => load(name.replace(/^\.\//, '')), Error, Date, Float64Array })
  return exports
}
const { SequenceEncoder, sequenceMotion } = load('sequence-features')
const { DtwSignRecognizer, dtwDistance } = load('dtw-classifier')
const { WordRecorder } = load('word-recorder')
const { emptyWordDataset, parseWordDataset, mergeWordDatasets, serializeWordDataset, WORD_LABELS, MAX_WORD_SAMPLES, MAX_WORD_FILE_BYTES } = load('word-data')
const { SignStabilizer } = load('stabilizer')
const { appendRecognizedToken } = load('transcript-tokens')
const { sentenceRequest } = load('sentence')

// Synthetic geometry tests timing and matching only. These are not real ISL labels
// and must never be copied to the public data files or the user's browser library.
const hand = (t = 0, offset = 0) => Array.from({ length: 21 }, (_, i) => ({ x: .2 + .2 * t + offset + (i ? (i % 4 + 1) * .018 : 0), y: .7 + .08 * Math.sin(Math.PI * t) - i * .015, z: i * .001 }))
function sequence(warp = (t) => t) {
  const encoder = new SequenceEncoder()
  return Array.from({ length: 30 }, (_, i) => encoder.encode({ hands: [hand(warp(i / 29))], timestamp: i * 68 }))
}
const sample = (label = 'HELLO', id = 'motion-1', frames = sequence()) => ({ id, label, handCount: 1, frames, durationMs: 1972, recordedAt: 1234 })
const dataset = (label = 'HELLO', frames = sequence()) => ({ ...emptyWordDataset(), samples: Array.from({ length: 3 }, (_, i) => sample(label, `${label}-${i}`, frames)) })

test('sequence encoder keeps wrist motion while staying invariant to camera translation and uniform scale', () => {
  const a = new SequenceEncoder(), b = new SequenceEncoder()
  for (let i = 0; i < 30; i++) {
    const original = hand(i / 29)
    const moved = original.map((p) => ({ x: p.x * 2 + 3, y: p.y * 2 - 4, z: p.z * 2 + 1 }))
    const x = a.encode({ hands: [original], timestamp: i * 68 }), y = b.encode({ hands: [moved], timestamp: i * 68 })
    assert.equal(x.length, 132)
    assert.ok(x.every((n, index) => Math.abs(n - y[index]) < 1e-10))
    assert.ok(x.slice(63, 126).every((n) => n === 0))
    assert.ok(x.slice(129).every((n) => n === 0))
    if (i) assert.ok(x[126] > 0, 'Wrist trajectory must survive per-hand pose normalization')
  }
  assert.equal(a.encode({ hands: [], timestamp: 2100 }), null)
})

test('DTW aligns modest speed changes and preserves motion direction', () => {
  const original = sequence(), warped = sequence((t) => t ** 1.2), reversed = sequence((t) => 1 - t)
  assert.equal(dtwDistance(original, original, 1), 0)
  assert.ok(dtwDistance(original, warped, 1) < .03)
  assert.ok(dtwDistance(original, reversed, 1) > .2)
  assert.equal(dtwDistance([], original, 1), Infinity)
})

test('word matching needs three recordings and rejects still poses, wrong hand count and unknown motion', () => {
  const r = new DtwSignRecognizer()
  assert.equal(r.predictSequence(sequence(), 1).label, null)
  r.replace({ ...emptyWordDataset(), samples: dataset().samples.slice(0, 2) })
  assert.equal(r.labels.length, 0)
  r.replace(dataset())
  assert.equal(r.predictSequence(sequence(), 1).label, 'HELLO')
  assert.equal(r.predictSequence(sequence((t) => t ** 1.2), 1).label, 'HELLO')
  assert.equal(r.predictSequence(sequence(() => 0), 1).label, null)
  assert.equal(r.predictSequence(sequence((t) => 1 - t), 1).label, null)
  assert.equal(r.predictSequence(sequence(), 2).label, null)
  assert.ok(sequenceMotion(sequence(), 1) > .035)
})

test('identical recordings with conflicting word labels do not produce confident matches', () => {
  const r = new DtwSignRecognizer()
  r.replace(mergeWordDatasets(dataset('HELLO'), dataset('HELP')))
  assert.equal(r.predictSequence(sequence(), 1).label, null)
})

test('different signing styles do not suppress an exact matching real trajectory', () => {
  const original = sequence()
  const wider = factor => original.map(frame => frame.map((value, i) => i >= 126 ? value * factor : value))
  const r = new DtwSignRecognizer()
  r.replace({ ...emptyWordDataset(), samples: [sample('HELLO', 'normal', original), sample('HELLO', 'wide', wider(3)), sample('HELLO', 'wider', wider(5))] })
  const result = r.predictSequence(original, 1)
  assert.equal(result.label, 'HELLO')
  // Stored templates are rounded to six decimals, so an exact repeat scores just under 1.
  assert.ok(result.confidence > .9999)
})

test('mixed one/two-hand examples cannot enable a word without three matching hand-count recordings', () => {
  const r = new DtwSignRecognizer(), encoder = new SequenceEncoder()
  const two = Array.from({ length: 30 }, (_, i) => encoder.encode({ hands: [hand(i / 29), hand(i / 29, .5)], timestamp: i * 68 }))
  r.replace({ ...emptyWordDataset(), samples: [...dataset().samples.slice(0, 2), { ...sample('HELLO', 'two-hands', two), handCount: 2 }] })
  assert.equal(r.labels.length, 0)
  assert.equal(r.predictSequence(sequence(), 1).label, null)
  assert.equal(r.predictSequence(two, 2).label, null)
})

test('word format rejects malformed frames, unsupported labels, static-pose files and excess references', () => {
  assert.equal(parseWordDataset(dataset()).samples.length, 3)
  for (const bad of [
    { version: 1, normalization: 'wrist-maxdist-v1', samples: [] },
    { ...emptyWordDataset(), samples: [sample('A')] },
    { ...emptyWordDataset(), samples: [{ ...sample(), frames: sequence().slice(0, 29) }] },
    { ...emptyWordDataset(), samples: [{ ...sample(), handCount: 2 }] },
    { ...emptyWordDataset(), samples: [{ ...sample(), durationMs: 100 }] },
    { ...emptyWordDataset(), samples: [{ ...sample(), frames: sequence().map((f) => f.map((n, i) => i === 127 ? Infinity : n)) }] },
    { ...emptyWordDataset(), samples: Array.from({ length: 6 }, (_, i) => sample('HELLO', `extra-${i}`)) },
  ]) assert.throws(() => parseWordDataset(bad))
})

test('word imports merge idempotently and conflicting IDs preserve the previous dataset', () => {
  const original = dataset(), snapshot = JSON.stringify(original)
  assert.equal(mergeWordDatasets(original, original).samples.length, 3)
  assert.throws(() => mergeWordDatasets(original, { ...emptyWordDataset(), samples: [sample('HELP', 'HELLO-0')] }))
  assert.equal(JSON.stringify(original), snapshot)
})

test('word recorder captures only thirty real frames after 3–2–1', () => {
  const r = new WordRecorder('HELLO', 0, { hands: 1, id: 'real-frame-test', recordedAt: () => 1234 })
  for (let i = 0; i < 30; i++) r.update({ hands: [hand(i / 29)], timestamp: i * 68 })
  assert.equal(r.tick(2000).phase, 'countdown')
  assert.equal(r.sample, null)
  for (let i = 0; i < 30; i++) r.update({ hands: [hand(i / 29)], timestamp: 3000 + i * 68 })
  assert.equal(r.tick(5100).phase, 'complete')
  assert.equal(r.sample.frames.length, 30)
  assert.equal(r.sample.recordedAt, 1234)
  assert.equal(r.sample.durationMs, 1972)
  assert.equal(parseWordDataset({ ...emptyWordDataset(), samples: [r.sample] }).samples.length, 1)
  assert.deepEqual(Array.from(r.sample.frames[15]), Array.from(sequence()[15]))
})

test('a motion captured on a slow camera can always be saved and exported', () => {
  // 5 FPS: every frame gap is inside the recorder's stall limit.
  const r = new WordRecorder('HELLO', 0, { hands: 1, id: 'slow-camera' })
  for (let i = 0; i < 30; i++) r.update({ hands: [hand(i / 29)], timestamp: 3000 + i * 200 })
  assert.equal(r.tick(9000).phase, 'complete')
  assert.ok(r.sample, r.tick(9000).reason)
  assert.equal(r.sample.durationMs, 5800)
  const saved = parseWordDataset({ ...emptyWordDataset(), samples: [r.sample] })
  assert.equal(JSON.parse(serializeWordDataset(saved)).samples.length, 1)
})

test('the largest library the parser accepts exports below the import limit and re-imports unchanged', () => {
  const frames = sequence().map((frame) => frame.map((n, i) => n === 0 ? 0 : n + (i % 7) * 1e-9 - Math.PI * 1e-8))
  const samples = []
  for (const label of WORD_LABELS) for (let i = 0; i < MAX_WORD_SAMPLES; i++) samples.push({ ...sample(label, `${label}-${i}`, frames) })
  const text = serializeWordDataset({ ...emptyWordDataset(), samples })
  assert.ok(text.length < MAX_WORD_FILE_BYTES, `export is ${text.length} bytes`)
  // A stored (rounded) library and its exported backup compare equal on re-import.
  const stored = parseWordDataset({ ...emptyWordDataset(), samples: samples.slice(0, 20) })
  const backup = JSON.parse(serializeWordDataset(stored))
  assert.equal(mergeWordDatasets(stored, backup).samples.length, 20, 'Re-importing a backup is idempotent')
})

test('word files keep their source, license and attribution through import and export', () => {
  const annotated = { ...dataset(), source: 'Community recordings', license: 'CC BY 4.0', attribution: 'Signer collective', ignored: 'x' }
  const parsed = parseWordDataset(annotated)
  assert.equal(parsed.license, 'CC BY 4.0'); assert.equal(parsed.source, 'Community recordings'); assert.equal(parsed.ignored, undefined)
  const stored = mergeWordDatasets(emptyWordDataset(), annotated)
  assert.ok(stored.samples.every((entry) => entry.license === 'CC BY 4.0' && entry.attribution === 'Signer collective'))
  const exported = JSON.parse(serializeWordDataset(stored))
  assert.ok(exported.samples.every((entry) => entry.source === 'Community recordings'))
})

test('missing hands, a frame stall, still poses and timeout cannot save partial or invented words', () => {
  for (const fault of ['missing', 'stall', 'still', 'timeout']) {
    const r = new WordRecorder('HELLO', 0, { hands: 1, id: fault })
    if (fault === 'timeout') r.tick(11000)
    else if (fault === 'still') for (let i = 0; i < 30; i++) r.update({ hands: [hand()], timestamp: 3000 + i * 68 })
    else {
      r.update({ hands: [hand()], timestamp: 3000 })
      r.update({ hands: fault === 'missing' ? [] : [hand(.5)], timestamp: fault === 'stall' ? 3400 : 3068 })
    }
    assert.equal(r.tick(11000).phase, 'complete')
    assert.equal(r.sample, null)
  }
})

test('live words use vote/hold, survive refresh, and require a hand release before repeating', () => {
  const r = new DtwSignRecognizer(), stabilizer = new SignStabilizer(), commits = []
  r.replace(dataset())
  let now = 0
  const feed = (t, present = true) => {
    const frame = { timestamp: now, hands: present ? [hand(t)] : [] }
    const stable = stabilizer.update(r.predict(frame), now, present)
    if (stable.commit) commits.push(stable.commit)
  }
  const gesture = () => { for (let i = 0; i < 30; i++, now += 68) feed(i / 29); for (let i = 0; i < 45; i++, now += 34) feed(1) }
  gesture(); assert.deepEqual(commits, ['HELLO'])
  r.replace(dataset())
  for (let i = 0; i < 40; i++, now += 34) feed(1)
  assert.deepEqual(commits, ['HELLO'])
  // Moving away and back is not a fresh complete gesture.
  for (let i = 0; i < 12; i++, now += 34) feed(0)
  for (let i = 0; i < 45; i++, now += 34) feed(1)
  assert.deepEqual(commits, ['HELLO'])
  for (let i = 0; i < 10; i++, now += 34) feed(0, false)
  gesture(); assert.deepEqual(commits, ['HELLO', 'HELLO'])
})

test('word commits remain editable character tokens and obey the existing text-only API limit', () => {
  let tokens = appendRecognizedToken([], { id: '1', text: 'HELLO' }, true)
  tokens = appendRecognizedToken(tokens, { id: '2', text: 'THANK YOU' }, true)
  assert.equal(tokens.map((t) => t.text).join(''), 'HELLO THANK YOU')
  assert.equal(new Set(tokens.map((t) => t.id)).size, tokens.length)
  assert.equal(tokens.slice(0, -1).map((t) => t.text).join(''), 'HELLO THANK YO')
  assert.equal(sentenceRequest({ tokens: tokens.map((t) => t.text), language: 'en-IN' }).tokens.length, tokens.length)
  const full = Array.from({ length: 1198 }, (_, i) => ({ id: `typed-${i}`, text: 'A' }))
  assert.equal(appendRecognizedToken(full, { id: '3', text: 'HELLO' }, true), full, 'Do not partially insert words beyond the 1200-character limit')
  assert.equal(appendRecognizedToken(full, { id: '4', text: 'B' }, false).length, 1199)
})

test('asynchronous word matching allows one in-flight query and discards replies after release or refresh', () => {
  const jobs = [], r = new DtwSignRecognizer(undefined, (frames, hands, done) => jobs.push({ frames, hands, done }))
  r.replace(dataset())
  let now = 0
  const gesture = () => { for (let i = 0; i < 30; i++, now += 68) r.predict({ hands: [hand(i / 29)], timestamp: now }) }
  gesture()
  assert.equal(jobs.length, 1)
  for (let i = 0; i < 5; i++, now += 34) assert.equal(r.predict({ hands: [hand(1)], timestamp: now }).label, null)
  assert.equal(jobs.length, 1)
  jobs[0].done({ label: 'HELLO', confidence: 1 })
  assert.equal(r.predict({ hands: [hand(1)], timestamp: now }).label, 'HELLO')
  r.reset(); gesture()
  const stale = jobs.at(-1)
  r.replace(dataset())
  stale.done({ label: 'HELLO', confidence: 1 })
  assert.equal(r.predict({ hands: [hand(1)], timestamp: now }).label, null)
  now += 300; r.predict({ hands: [], timestamp: now }); now += 250; r.predict({ hands: [], timestamp: now })
  stale.done({ label: 'HELLO', confidence: 1 })
  now += 34
  assert.equal(r.predict({ hands: [hand(1)], timestamp: now }).label, null)
})
