const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm'), ts = require('typescript')
const cache = new Map()
let offline = false
const read = name => JSON.parse(fs.readFileSync(path.join(__dirname, '../public/models', name), 'utf8'))
function load(name) {
  if (cache.has(name)) return cache.get(name)
  const exports = {}; cache.set(name, exports)
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(path.join(__dirname, '../lib/sign', `${name}.ts`), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText, { exports, require: name => load(name.replace(/^\.\//, '')), Error, TypeError, Float64Array, AbortController, setTimeout, clearTimeout,
    fetch: async url => { if (offline) throw new TypeError('Failed to fetch'); return { ok: true, json: async () => read(url.split('/').at(-1)) } },
  })
  return exports
}

test('a fresh device recognizes bundled ISL letters and numbers even with storage unavailable', async () => {
  const { readRecognitionDataset } = load('sample-store')
  const { KnnSignRecognizer } = load('knn-classifier')
  const { dataset } = await readRecognitionDataset()
  const recognizer = new KnnSignRecognizer(); recognizer.replace(dataset)
  assert.equal(recognizer.labels.join(''), '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ')
  assert.ok(recognizer.sampleCount >= 1000)
  for (const label of recognizer.labels) {
    assert.ok(dataset.samples.filter(sample => sample.label === label).some(sample => {
      const prediction = recognizer.predictFeatures(sample.features)
      return prediction.label === label && prediction.confidence >= .8
    }), `Bundled ${label} must be recognizable without a personal recording`)
  }
})

test('digit 0 is offered only with Numbers intent, because its photographs are the letter O captures', async () => {
  const { readRecognitionDataset } = load('sample-store')
  const { KnnSignRecognizer, spellingLabel, numberLabel } = load('knn-classifier')
  const { dataset } = await readRecognitionDataset()
  const spelling = new KnnSignRecognizer(undefined, spellingLabel); spelling.replace(dataset)
  const numbers = new KnnSignRecognizer(undefined, numberLabel); numbers.replace(dataset)
  assert.equal(spelling.labels.join(''), '123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ')
  assert.equal(numbers.labels.join(''), '0123456789')
  const zero = dataset.samples.find(sample => sample.label === '0')
  assert.equal(zero.license, 'CC-BY-4.0', 'Each digit-0 sample keeps its own source license')
  assert.match(zero.source, /data\.mendeley\.com/)
  assert.notEqual(spelling.predictFeatures(zero.features).label, '0')
  assert.equal(numbers.predictFeatures(zero.features).label, '0')
  assert.notEqual(numbers.predictFeatures(dataset.samples.find(sample => sample.label === 'O').features).label, 'O')
})

test('a full personal library for one sign keeps every other bundled sign', () => {
  const { recognitionDataset, emptyDataset } = load('sample-store')
  const { KnnSignRecognizer } = load('knn-classifier')
  const { featureHandCount } = load('features')
  const baseline = read('isl-samples.json'), pose = baseline.samples[0]
  const hands = featureHandCount(pose.features)
  const local = { ...emptyDataset(), samples: Array.from({ length: 5000 }, (_, i) => ({ ...pose, id: `private-${i}` })) }
  const merged = recognitionDataset(baseline, local)
  const kept = baseline.samples.filter(sample => !(sample.label === pose.label && featureHandCount(sample.features) === hands))
  assert.equal(merged.samples.length, 5000 + kept.length, 'Only bundled samples of the same sign and hand count are replaced')
  const recognizer = new KnnSignRecognizer(); recognizer.replace(merged)
  assert.equal(recognizer.labels.join(''), '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ', 'No unrelated bundled sign is lost')
  const personal = { ...emptyDataset(), samples: local.samples.slice(0, 3) }
  const combined = recognitionDataset(baseline, personal)
  assert.equal(combined.samples.filter(sample => sample.label === pose.label && featureHandCount(sample.features) === hands).length, 3)
  assert.ok(combined.samples.some(sample => sample.label !== pose.label))
})

test('a label needs three references with the same hand count', () => {
  const { recognitionDataset, emptyDataset } = load('sample-store')
  const { KnnSignRecognizer } = load('knn-classifier')
  const { featureHandCount } = load('features')
  const baseline = read('isl-samples.json')
  const twoHandA = baseline.samples.filter(sample => sample.label === 'A' && featureHandCount(sample.features) === 2).slice(0, 2)
  const oneHand = baseline.samples.find(sample => featureHandCount(sample.features) === 1)
  const mixed = [...twoHandA, { ...oneHand, label: 'A' }].map((sample, i) => ({ ...sample, id: `mixed-${i}` }))
  const recognizer = new KnnSignRecognizer(); recognizer.replace({ ...emptyDataset(), samples: mixed })
  assert.equal(recognizer.labels.length, 0, 'Two two-hand and one one-hand A do not enable A')
  assert.equal(recognizer.predictFeatures(oneHand.features).label, null)
  const merged = recognitionDataset(baseline, { ...emptyDataset(), samples: mixed })
  assert.equal(merged.samples.filter(sample => sample.label === 'A').length, baseline.samples.filter(sample => sample.label === 'A').length + 3, 'They do not replace the bundled A either')
})

test('sample files keep their source, license and attribution through import and export', () => {
  const { mergeDatasets, emptyDataset } = load('sample-store')
  const { parseDataset } = load('knn-classifier')
  const bundled = read('isl-samples.json')
  const parsed = parseDataset(bundled)
  assert.equal(parsed.license, bundled.license); assert.equal(parsed.source, bundled.source); assert.equal(parsed.attribution, bundled.attribution)
  const stored = mergeDatasets(emptyDataset(), { ...parsed, samples: parsed.samples.slice(0, 5) })
  assert.ok(stored.samples.every(sample => sample.license === bundled.license && sample.attribution === bundled.attribution))
  const exported = parseDataset(JSON.parse(JSON.stringify(stored)))
  assert.ok(exported.samples.every(sample => sample.source === bundled.source))
})

test('going offline after the first load keeps the bundled library', async () => {
  const { readRecognitionDataset } = load('sample-store')
  const first = await readRecognitionDataset()
  offline = true
  try {
    const refreshed = await readRecognitionDataset()
    assert.equal(refreshed.dataset.samples.length, first.dataset.samples.length)
  } finally { offline = false }
})

test('bundled word recordings load without asking a fresh device to train', async () => {
  const { readWordRecognitionDataset } = load('word-store')
  const { DtwSignRecognizer } = load('dtw-classifier')
  const { dataset } = await readWordRecognitionDataset()
  const recognizer = new DtwSignRecognizer(); recognizer.replace(dataset)
  assert.ok(recognizer.labels.length >= 10)
  for (const label of ['HELLO', 'THANK YOU', 'WATER']) assert.ok(recognizer.labels.includes(label))
  for (const label of recognizer.labels) {
    assert.ok(dataset.samples.filter(sample => sample.label === label).some(sample => {
      const prediction = recognizer.predictSequence(sample.frames, sample.handCount)
      return prediction.label === label && prediction.confidence >= .8
    }), `Bundled ${label} must match an observed motion without personal training`)
  }
})

test('personal word recordings replace bundled templates without breaking the five-recording limit', () => {
  const { wordRecognitionDataset, emptyWordDataset, parseWordDataset } = load('word-data')
  const baseline = read('isl-words.json'), source = baseline.samples[0]
  const local = { ...emptyWordDataset(), samples: Array.from({ length: 5 }, (_, i) => ({ ...source, id: `private-word-${i}` })) }
  const merged = wordRecognitionDataset(baseline, local)
  assert.equal(parseWordDataset(merged).samples.filter(sample => sample.label === source.label).length, 5)
  assert.ok(merged.samples.filter(sample => sample.label === source.label).every(sample => sample.id.startsWith('private-')))
  const incomplete = { ...emptyWordDataset(), samples: local.samples.slice(0, 2) }
  assert.equal(wordRecognitionDataset(baseline, incomplete).samples.filter(sample => sample.label === source.label).length, 5)
  assert.equal(local.samples.length, 5, 'Recognition must leave saved recordings intact')
})
