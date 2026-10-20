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
  const exports = {}
  cache.set(file, exports)
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(file, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText, {
    exports, require: (relative) => load(path.relative(path.dirname(file), path.resolve(path.dirname(file), relative))),
    fetch: () => { throw new Error('No network in engine tests') },
  }, { filename: file })
  return exports
}
const { extractFeatures, previewPoint, featureHandCount } = load('features')
const { KnnSignRecognizer, parseDataset } = load('knn-classifier')
const { SignStabilizer } = load('stabilizer')
const { sentenceRequest, formatTokens } = load('sentence')

// Geometric fixtures for unit tests only. Never bundled as recognition data.
const hand = (x = .2, shape = 0) => Array.from({ length: 21 }, (_, index) => ({
  x: x + (index ? (index % 4 + 1) * .018 : 0),
  y: .7 - index * .015 * (shape ? .15 : 1),
  z: index * .001 * (shape ? -1 : 1),
}))
const dataset = (samples) => ({ version: 1, normalization: 'wrist-maxdist-v1', samples })
const samples = (label, features, n = 3) => Array.from({ length: n }, (_, i) => ({ id: `${label}-${i}`, label, features }))
const p = (label, confidence = .99) => ({ label, confidence })
const feed = (stabilizer, label, start, end, confidence = .99) => {
  const commits = []
  for (let time = start; time <= end; time += 34) {
    const result = stabilizer.update(p(label, confidence), time, !!label)
    if (result.commit) commits.push(result.commit)
  }
  return commits
}

test('feature vector is fixed length, wrist centred, ordered by raw wrist x, and zero padded', () => {
  const a = hand(.2), b = hand(.8, 1)
  const one = extractFeatures([a]), two = extractFeatures([b, a])
  assert.equal(one.length, 126)
  assert.deepEqual(Array.from(one.slice(0, 3)), [0, 0, 0])
  assert.ok(one.slice(63).every((n) => n === 0))
  assert.deepEqual(Array.from(two.slice(0, 63)), Array.from(one.slice(0, 63)))
  assert.equal(featureHandCount(two), 2)
})

test('features are invariant to translation and uniform scale', () => {
  const original = hand()
  const moved = original.map((point) => ({ x: point.x * 3 + 8, y: point.y * 3 - 2, z: point.z * 3 + 4 }))
  const a = extractFeatures([original]), b = extractFeatures([moved])
  assert.ok(a.every((n, i) => Math.abs(n - b[i]) < 1e-10))
})

test('invalid or collapsed hands never create nonfinite features', () => {
  const broken = hand(); broken[2].x = NaN
  assert.ok(extractFeatures([broken]).every((n) => n === 0))
  assert.ok(extractFeatures([Array(21).fill({ x: 0, y: 0, z: 0 })]).every((n) => n === 0))
})

test('overlay projection matches cover crop and mirrors only the visual x coordinate', () => {
  const center = previewPoint({ x: .5, y: .5, z: 0 }, 375, 500, 1280, 720)
  assert.equal(center.x, 187.5); assert.equal(center.y, 250)
  const left = previewPoint({ x: .4, y: .5, z: 0 }, 375, 500, 1280, 720)
  assert.ok(left.x > center.x)
})

test('k-NN never predicts without data and requires three samples per label', () => {
  const recognizer = new KnnSignRecognizer()
  assert.equal(recognizer.predict({ hands: [hand()], timestamp: 0 }).label, null)
  recognizer.replace(dataset(samples('A', extractFeatures([hand()]), 2)))
  assert.equal(recognizer.labels.length, 0)
  assert.equal(recognizer.predict({ hands: [hand()], timestamp: 0 }).label, null)
})

test('k-NN matches actual supplied features and rejects outliers and hand count mismatches', () => {
  const recognizer = new KnnSignRecognizer()
  const vector = extractFeatures([hand()])
  recognizer.replace(dataset(samples('A', vector)))
  const match = recognizer.predict({ hands: [hand()], timestamp: 0 })
  assert.equal(match.label, 'A'); assert.ok(match.confidence > .99)
  assert.equal(recognizer.predictFeatures(vector.map((n) => -n)).label, null)
  assert.equal(recognizer.predict({ hands: [hand(), hand(.8)], timestamp: 0 }).label, null)
})

test('ambiguous labels have insufficient confidence to pass the stabilizer', () => {
  const recognizer = new KnnSignRecognizer(), vector = extractFeatures([hand()])
  recognizer.replace(dataset([...samples('A', vector), ...samples('B', vector)]))
  assert.ok(recognizer.predictFeatures(vector).confidence < .8)
})

test('dataset validation rejects malformed, unversioned, duplicate, and word samples', () => {
  const valid = samples('A', extractFeatures([hand()]))
  assert.equal(parseDataset(dataset([])).samples.length, 0)
  for (const input of [{ samples: valid }, dataset([...valid, valid[0]]), dataset([{ ...valid[0], label: 'HELLO' }]), dataset([{ ...valid[0], features: [1, 2] }]), dataset([{ ...valid[0], features: Array(126).fill(Infinity) }])]) {
    assert.throws(() => parseDataset(input))
  }
})

test('hold-to-commit needs a majority plus 700ms; held signs commit only once', () => {
  const stabilizer = new SignStabilizer()
  assert.equal(feed(stabilizer, 'A', 0, 850).length, 0)
  assert.deepEqual(feed(stabilizer, 'A', 884, 5000), ['A'])
})

test('release permits double letters; a brief missing hand does not', () => {
  const stabilizer = new SignStabilizer()
  assert.deepEqual(feed(stabilizer, 'A', 0, 1200), ['A'])
  feed(stabilizer, null, 1224, 1326)
  assert.equal(feed(stabilizer, 'A', 1360, 2400).length, 0)
  feed(stabilizer, null, 2414, 2720)
  assert.deepEqual(feed(stabilizer, 'A', 2754, 4000), ['A'])
})

test('a different stable sign can commit without releasing the hands', () => {
  const stabilizer = new SignStabilizer()
  assert.deepEqual(feed(stabilizer, 'A', 0, 1200), ['A'])
  assert.deepEqual(feed(stabilizer, 'B', 1224, 2500), ['B'])
  assert.deepEqual(feed(stabilizer, 'A', 2516, 3900), ['A'])
})

test('low confidence, isolated spikes, and frame stalls cannot duplicate a sign', () => {
  const stabilizer = new SignStabilizer()
  assert.equal(feed(stabilizer, 'A', 0, 2000, .4).length, 0)
  assert.equal(stabilizer.update(p('B'), 2040, true).commit, null)
  assert.deepEqual(feed(stabilizer, 'A', 2074, 3500), ['A'])
  assert.equal(feed(stabilizer, 'A', 7000, 9000).length, 0)
})

test('sentence request accepts text characters only and preserves Hindi combining marks', () => {
  const input = sentenceRequest({ tokens: Array.from('नमस्ते'), language: 'hi-IN' })
  assert.equal(input.tokens.join(''), 'नमस्ते')
  assert.equal(formatTokens(Array.from('HELLO WORLD')), 'HELLO WORLD.')
  for (const bad of [{ tokens: ['A'], language: 'en-IN', landmarks: [] }, { tokens: [1], language: 'en-IN' }, { tokens: ['A'], language: 'xx' }, { tokens: [' '], language: 'en-IN' }, { tokens: Array(1201).fill('A'), language: 'en-IN' }]) assert.throws(() => sentenceRequest(bad))
})
