const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { loadModule } = require('./load-module.cjs')

const cache = new Map()
const { KnnSignRecognizer, parseDataset } = loadModule('lib/sign/knn-classifier.ts', {}, cache)
const { extractFeatures, extractRelation } = loadModule('lib/sign/features.ts', {}, cache)
const { SampleRecorder } = loadModule('lib/sign/recorder.ts', {}, cache)
const bundled = JSON.parse(fs.readFileSync(path.join(__dirname, '../public/models/isl-samples.json'), 'utf8'))
const hand = (x, y = .5) => Array.from({ length: 21 }, (_, i) => ({ x: x + (i % 5) * .012, y: y - Math.floor(i / 5) * .02, z: i * .001 }))

test('two hands in different places no longer produce identical static features', () => {
  const near = [hand(.3), hand(.42)], far = [hand(.3), hand(.72, .4)]
  const shapeNear = extractFeatures(near), shapeFar = extractFeatures(far)
  assert.ok(shapeNear.every((value, i) => Math.abs(value - shapeFar[i]) < 1e-9), 'Hand shapes alone are identical')
  assert.notDeepEqual(Array.from(extractRelation(near)), Array.from(extractRelation(far)))
  assert.equal(extractRelation([hand(.3)]), null, 'One hand has no placement')
})

test('bundled two-hand references reject a pose whose second hand is moved', () => {
  const recognizer = new KnnSignRecognizer(); recognizer.replace(bundled)
  const twoHand = bundled.samples.filter((sample) => sample.relation)
  assert.ok(twoHand.length > 1000, 'Bundled two-hand poses carry their placement')
  let kept = 0, moved = 0
  for (const sample of twoHand.filter((_, i) => i % 20 === 0)) {
    const same = recognizer.predictFeatures(sample.features, sample.relation)
    if (same.label === sample.label && same.confidence >= .8) kept++
    const shifted = recognizer.predictFeatures(sample.features, sample.relation.map((value, i) => i === 0 ? value + 1.5 : value))
    if (shifted.label === sample.label && shifted.confidence >= .8) moved++
  }
  assert.ok(kept > 80, `Reference poses still match (${kept})`)
  assert.equal(moved, 0, 'Moving the second hand by 1.5 hand sizes is not accepted')
})

test('relation is optional, two-hand only, and recorded with new samples', () => {
  const sample = bundled.samples.find((entry) => entry.relation)
  const base = { version: 1, normalization: 'wrist-maxdist-v1' }
  assert.deepEqual(Array.from(parseDataset({ ...base, samples: [sample] }).samples[0].relation), sample.relation)
  const { relation: _relation, ...withoutRelation } = sample
  assert.equal(parseDataset({ ...base, samples: [withoutRelation] }).samples[0].relation, undefined)
  const oneHand = bundled.samples.find((entry) => !entry.relation)
  assert.throws(() => parseDataset({ ...base, samples: [{ ...oneHand, relation: [1, 0, 0] }] }))
  assert.throws(() => parseDataset({ ...base, samples: [{ ...sample, relation: [1, 0] }] }))

  const recorder = new SampleRecorder('A', 0, { hands: 2, batchId: 'relation', target: 1, recordedAt: () => 1 })
  for (let time = 3000; time < 3600; time += 50) recorder.update({ hands: [hand(.3), hand(.5)], timestamp: time })
  assert.equal(recorder.samples.length, 1)
  assert.deepEqual(Array.from(recorder.samples[0].relation), Array.from(extractRelation([hand(.3), hand(.5)])))
})
