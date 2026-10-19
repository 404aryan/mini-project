const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')
const ts = require('typescript')
const cache = new Map()
function load(name) {
  const file = path.resolve(__dirname, '../lib/sign', `${name}.ts`)
  if (cache.has(file)) return cache.get(file)
  const exports = {}; cache.set(file, exports)
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(file, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText, { exports, require: (relative) => load(relative), Date, Error }, { filename: file })
  return exports
}
const { SampleRecorder } = load('recorder')
const { extractFeatures } = load('features')
const { mergeDatasets, emptyDataset } = load('sample-store')
const { parseDataset } = load('knn-classifier')
// Synthetic geometry exercises capture gates only; it is not shipped as sign data.
const hand = (x = .2, variant = 1) => Array.from({ length: 21 }, (_, i) => ({ x: x + i * .01, y: .7 - i * .015 * variant, z: i * .001 }))
const frame = (timestamp, hands = [hand(), hand(.7)]) => ({ timestamp, hands })
const recorder = (options = {}) => new SampleRecorder('A', 0, { hands: 2, batchId: 'record-test', recordedAt: () => 1234, ...options })

test('3–2–1 countdown never records frames early', () => {
  const r = recorder()
  assert.equal(r.tick(0).countdown, 3)
  assert.equal(r.tick(1100).countdown, 2)
  assert.equal(r.tick(2100).countdown, 1)
  for (let time = 0; time < 3000; time += 34) r.update(frame(time))
  assert.equal(r.samples.length, 0)
  assert.equal(r.tick(3000).phase, 'recording')
})

test('recorder captures exactly twelve steady, real input poses with unique IDs', () => {
  const r = recorder()
  for (let time = 3000; time <= 10000; time += 34) r.update(frame(time))
  assert.equal(r.samples.length, 12)
  assert.equal(r.tick(10000).phase, 'complete')
  assert.equal(new Set(r.samples.map((s) => s.id)).size, 12)
  assert.ok(r.samples.every((s) => s.label === 'A' && s.recordedAt === 1234))
  assert.deepEqual(Array.from(r.samples[0].features), Array.from(extractFeatures(frame(0).hands)))
  assert.equal(parseDataset({ ...emptyDataset(), samples: r.samples }).samples.length, 12)
})

test('two-hand recording rejects no hands, missing hands, and invalid landmarks', () => {
  const r = recorder()
  const invalid = hand(); invalid[2].x = NaN
  for (let time = 3000; time < 9000; time += 34) r.update(frame(time, time % 3 === 0 ? [] : [hand(), invalid]))
  assert.equal(r.samples.length, 0)
  assert.equal(r.tick(9000).reason, 'Bring both hands into frame')
})

test('one-hand capture is explicit and rejects two hands', () => {
  const r = recorder({ hands: 1, target: 3 })
  for (let time = 3000; time < 4000; time += 34) r.update(frame(time))
  assert.equal(r.samples.length, 0)
  for (let time = 4020; time < 6000; time += 34) r.update(frame(time, [hand()]))
  assert.equal(r.samples.length, 3)
  assert.ok(r.samples.every((s) => s.features.slice(63).every((n) => n === 0)))
})

test('unstable shapes and long frame gaps cannot silently record transitional poses', () => {
  const r = recorder()
  for (let i = 0; i < 100; i++) r.update(frame(3000 + i * 34, [hand(.2, i % 2 ? -1 : 1), hand(.7)]))
  assert.equal(r.samples.length, 0)
  r.update(frame(8000)); r.update(frame(8500)); r.update(frame(9000))
  assert.equal(r.samples.length, 0)
})

test('a round times out after eight capture seconds without inventing samples', () => {
  const r = recorder()
  for (let time = 3000; time <= 11000; time += 100) r.update(frame(time, []))
  assert.equal(r.tick(11000).phase, 'complete')
  assert.equal(r.tick(11000).timedOut, true)
  r.update(frame(12000)); assert.equal(r.samples.length, 0)
})

test('dataset merge is idempotent, preserves metadata, and does not mutate inputs', () => {
  const sample = { id: 'real-sample-id', label: 'A', features: extractFeatures([hand()]), recordedAt: 1000 }
  const a = { ...emptyDataset(), samples: [sample] }
  const b = { ...emptyDataset(), samples: [sample, { ...sample, id: 'second', label: 'B' }] }
  const merged = mergeDatasets(a, b)
  assert.equal(merged.samples.length, 2)
  assert.equal(merged.samples[0].recordedAt, 1000)
  assert.equal(a.samples.length, 1)
  assert.equal(mergeDatasets(merged, b).samples.length, 2)
})

test('conflicting imported IDs and invalid timestamps preserve the prior dataset', () => {
  const sample = { id: 'same', label: 'A', features: extractFeatures([hand()]) }
  const a = { ...emptyDataset(), samples: [sample] }
  assert.throws(() => mergeDatasets(a, { ...a, samples: [{ ...sample, label: 'B' }] }), /different pose/)
  assert.equal(a.samples[0].label, 'A')
  assert.throws(() => parseDataset({ ...a, samples: [{ ...sample, recordedAt: -1 }] }))
})
