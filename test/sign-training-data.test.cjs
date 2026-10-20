const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs'), path = require('node:path'), crypto = require('node:crypto')
const read = file => JSON.parse(fs.readFileSync(path.join(__dirname, '..', file), 'utf8'))
const model = read('public/models/isl-temporal-model.json')
const provenance = read('public/models/temporal-provenance.json')
const evaluation = read('public/models/word-evaluation.json')
const coverage = read('public/models/isl-coverage.json')
const sha256 = data => crypto.createHash('sha256').update(data).digest('hex')

test('word recordings are split by signer and clip, and the shipped digests match', () => {
  const side = new Map()
  for (const item of provenance) {
    assert.ok(['train', 'calibration', 'test'].includes(item.partition))
    assert.match(item.sha256, /^[0-9a-f]{64}$/)
    for (const key of [`signer:${item.signer}`, `source:${item.source}`]) {
      assert.equal(side.get(key) ?? item.partition, item.partition, `${key} appears in two partitions`)
      side.set(key, item.partition)
    }
  }
  for (const item of provenance) assert.ok(model.partitions[item.partition].includes(item.signer), `${item.signer} is not declared as ${item.partition}`)
  const lines = provenance.map(item => `${item.partition} ${item.label} ${item.source} ${item.sha256}`).sort()
  assert.equal(sha256(lines.join('\n')), model.datasetSha256)
  assert.equal(sha256(fs.readFileSync(path.join(__dirname, '../public/models/isl-temporal-forest.bin'))), model.sha256)
  assert.equal(evaluation.model, model.sha256)
  assert.equal(model.trainingObservations, provenance.filter(item => item.partition === 'train').length)
  assert.equal(evaluation.test.observations, provenance.filter(item => item.partition === 'test').length)
  assert.equal(evaluation.calibration.observations, provenance.filter(item => item.partition === 'calibration').length)
})

test('gates and auto-accept classes come from calibration evidence, not test results', () => {
  assert.equal(evaluation.gates.chosenOn, 'calibration')
  assert.deepEqual([model.threshold, model.margin], [evaluation.gates.threshold, evaluation.gates.margin])
  const accepted = evaluation.calibration.acceptedCorrect + evaluation.calibration.acceptedWrong
  assert.ok(evaluation.calibration.acceptedCorrect / accepted >= model.training.precisionTarget)
  for (const label of model.autoAccept) {
    const row = evaluation.calibration.perClass[label]
    assert.ok(evaluation.trainingSigners[label] >= 3 && row.observations >= 10, `${label} lacks calibration evidence`)
    assert.ok(row.acceptedCorrect / (row.acceptedCorrect + row.falseAccepts) >= model.training.precisionTarget)
  }
  const dictionaryOnly = Object.keys(model.sourceCounts).filter(label => provenance.filter(item => item.label === label).every(item => item.signer.includes('dictionary')))
  assert.ok(dictionaryOnly.length > 0)
  for (const label of dictionaryOnly) assert.ok(!model.autoAccept.includes(label), `${label} has no independent signer`)
})

test('coverage reports every word with measured evidence or an explicit gap', () => {
  const words = coverage.entries.filter(entry => entry.kind === 'word')
  assert.equal(words.length, 164)
  for (const entry of words) {
    const { status, test: held, collectionNeed } = entry.evidence
    assert.ok(['no-real-data', 'trained-unevaluated', 'evaluated-suggestion-only', 'evaluated-auto-accept', 'auto-accept-below-test-target'].includes(status), entry.id)
    assert.ok(collectionNeed.length > 0)
    if (status === 'no-real-data') assert.equal(entry.recognition.trained, false)
    if (status === 'trained-unevaluated') assert.equal(entry.recognition.autoAccept, 'suggestion-only')
    if (status.startsWith('evaluated') || status.startsWith('auto-accept')) assert.ok(held.observations > 0 && held.signers > 0)
    // Promotion rule (docs/sign-data-collection.md): calibration choices must also hold on unseen test signers.
    if (status === 'evaluated-auto-accept') assert.ok(held.signers >= 3 && held.observations >= 15 && held.precision >= .95, entry.id)
    if (status === 'auto-accept-below-test-target') assert.ok(entry.recognition.autoAccept === 'calibrated-runtime-gates' && !(held.precision >= .95 && held.signers >= 3 && held.observations >= 15), entry.id)
    assert.equal(entry.recognition.verifiedForGeneralUse, false)
  }
  for (const token of ['NEED', 'TOILET', 'TELL', 'PROJECT', 'HOW', 'HOW_MUCH', 'COME_IN', 'GO_OUT', 'BRING', 'NEED_HELP', 'WAIT_MINUTE', 'BECAUSE'])
    assert.equal(words.find(entry => entry.token === token).evidence.status, 'no-real-data')
  const zero = coverage.entries.find(entry => entry.id === 'number:0')
  assert.equal(zero.evidence.status, 'image-source-only')
  assert.equal(zero.recognition.autoAccept, 'numbers-intent-only')
  assert.equal(zero.recognition.license, 'CC-BY-4.0')
})
