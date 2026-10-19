const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm'), ts = require('typescript')
const cache = new Map()
const read = name => JSON.parse(fs.readFileSync(path.join(__dirname, '../public/models', name), 'utf8'))
function load(name) {
  if (cache.has(name)) return cache.get(name)
  const exports = {}; cache.set(name, exports)
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(path.join(__dirname, '../lib/sign', `${name}.ts`), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText, { exports, require: name => load(name.replace('./', '')), Error, Float64Array,
    fetch: async url => ({ ok: true, json: async () => read(url.split('/').at(-1)) }),
  })
  return exports
}

test('a fresh device recognizes bundled ISL letters and numbers even with storage unavailable', async () => {
  const { readRecognitionDataset } = load('sample-store')
  const { KnnSignRecognizer } = load('knn-classifier')
  const { dataset } = await readRecognitionDataset()
  const recognizer = new KnnSignRecognizer(); recognizer.replace(dataset)
  assert.equal(recognizer.labels.join(''), '123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ')
  assert.ok(recognizer.sampleCount >= 1000)
  for (const label of recognizer.labels) {
    assert.ok(dataset.samples.filter(sample => sample.label === label).some(sample => {
      const prediction = recognizer.predictFeatures(sample.features)
      return prediction.label === label && prediction.confidence >= .8
    }), `Bundled ${label} must be recognizable without a personal recording`)
  }
})

test('baseline poses and a full personal library do not exceed the import limit', () => {
  const { recognitionDataset, emptyDataset } = load('sample-store')
  const baseline = read('isl-samples.json'), pose = baseline.samples[0]
  const local = { ...emptyDataset(), samples: Array.from({ length: 5000 }, (_, i) => ({ ...pose, id: `private-${i}` })) }
  const merged = recognitionDataset(baseline, local)
  assert.equal(merged.samples.length, 5000)
  assert.ok(merged.samples.every(sample => sample.id.startsWith('private-')))
  const personal = { ...emptyDataset(), samples: local.samples.slice(0, 3) }
  const combined = recognitionDataset(baseline, personal)
  assert.equal(combined.samples.filter(sample => sample.label === pose.label).length, 3)
  assert.ok(combined.samples.some(sample => sample.label !== pose.label))
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
