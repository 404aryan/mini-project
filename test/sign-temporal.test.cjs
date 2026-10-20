const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm'), ts = require('typescript')
const cache = new Map()
function load(name) {
  if (cache.has(name)) return cache.get(name)
  const exports = {}; cache.set(name, exports)
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(path.join(__dirname, '../lib/sign', `${name}.ts`), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText, { exports, require: name => load(name.replace(/^\.\//, '')), Float32Array, Float64Array, Error })
  return exports
}
const { temporalFrame, temporalEmbedding, TEMPORAL_FEATURE_SIZE } = load('temporal-features')
const { TemporalWordRecognizer } = load('temporal-recognizer')
const { TemporalForest, chooseWindow } = load('temporal-forest')
const { emptyWordDataset } = load('word-data')
const hand = t => Array.from({ length: 21 }, (_, i) => ({ x: .3+t*.08+i*.003, y: .5-i*.012, z: i*.001 }))
const manifest = { vocabulary: ['YES'], trainingObservations: 2000 }

test('temporal features retain hand presence, relative hand position and motion order', () => {
  const first = temporalFrame({ hands: [hand(0)], timestamp: 0 })
  const last = temporalFrame({ hands: [hand(1)], timestamp: 1000 })
  assert.equal(first.length, 135); assert.equal(first[126], 1); assert.equal(first[127], 0)
  assert.equal(first[128], .3)
  assert.ok(Math.abs(last[128]-.38) < 1e-10)
  const embedding = temporalEmbedding([first,last])
  assert.equal(embedding.length, TEMPORAL_FEATURE_SIZE)
  assert.ok(embedding.every(Number.isFinite))
  assert.notDeepEqual(Array.from(embedding), Array.from(temporalEmbedding([last,first])))
  assert.equal(temporalEmbedding([[NaN]]).length, 0)
})

test('browser feature extraction matches Python training on a real withheld YES recording', () => {
  const fixture = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures/temporal-yes.json'), 'utf8'))
  const frames = fixture.raw.map(raw => temporalFrame({ timestamp: 0, hands: raw.filter(hand => hand.some(point => point.some(value => value !== 0))).map(hand => hand.map(([x,y,z]) => ({x,y,z}))) }))
  const actual = temporalEmbedding(frames)
  assert.equal(actual.length, fixture.embedding.length)
  actual.forEach((value,index) => assert.ok(Math.abs(value-fixture.embedding[index]) < 2e-5, `Training/runtime feature mismatch at ${index}`))
})

test('the shipped trained forest loads, covers the expanded vocabulary, and rejects empty hands', () => {
  const model = JSON.parse(fs.readFileSync(path.join(__dirname, '../public/models/isl-temporal-model.json'), 'utf8'))
  const buffer = fs.readFileSync(path.join(__dirname, '../public/models/isl-temporal-forest.bin'))
  const forest = new TemporalForest(model, new Float32Array(buffer.buffer.slice(buffer.byteOffset,buffer.byteOffset+buffer.byteLength)))
  assert.ok(model.vocabulary.length >= 140)
  assert.ok(model.vocabulary.includes('YES'))
  assert.equal(forest.predict(temporalEmbedding([Array(135).fill(0)])).label, null)
})

test('word completion tolerates different gesture speeds and emits once after release', () => {
  for (const duration of [700, 1400, 2800]) {
    const model = new TemporalWordRecognizer(manifest, (_windows, done) => done({ label: 'YES', confidence: .7, candidates: [{ label: 'YES', confidence: .7 }] }))
    model.replace(emptyWordDataset())
    const commits = []
    for (let time = 0; time <= duration; time += 100) {
      const prediction = model.predict({ hands: [hand(time/duration)], timestamp: time })
      if (prediction.completed) commits.push(prediction.label)
    }
    for (let time = duration+100; time <= duration+1800; time += 100) {
      const prediction = model.predict({ hands: [], timestamp: time })
      if (prediction.completed) commits.push(prediction.label)
    }
    assert.deepEqual(commits, ['YES'])
  }
})

test('a real detected thumbs-up adds YES once without requiring a 2-second motion', () => {
  const fixture=JSON.parse(fs.readFileSync(path.join(__dirname,'fixtures/thumb-up-detection.json'),'utf8'))
  const model=new TemporalWordRecognizer(manifest,(_windows,done)=>done({label:null,confidence:0,candidates:[]}))
  model.replace(emptyWordDataset())
  const commits=[]
  for(let timestamp=0;timestamp<2000;timestamp+=50){
    const result=model.predict({...fixture.frame,timestamp})
    if(result.completed)commits.push(result.label)
    if(timestamp<500)assert.equal(commits.length,0)
  }
  assert.deepEqual(commits,['YES'])
  for(let timestamp=2000;timestamp<2500;timestamp+=50)model.predict({hands:[],timestamp})
  for(let timestamp=2500;timestamp<3400;timestamp+=50){
    const result=model.predict({...fixture.frame,timestamp})
    if(result.completed)commits.push(result.label)
  }
  assert.deepEqual(commits,['YES','YES'],'Lowering the hand must unlock a second thumbs-up')
  const negative=new TemporalWordRecognizer(manifest,(_windows,done)=>done({label:null,confidence:0,candidates:[]}))
  negative.replace(emptyWordDataset())
  for(let timestamp=0;timestamp<1500;timestamp+=100)assert.notEqual(negative.predict({...fixture.frame,timestamp,gestures:[{name:'Closed_Fist',score:.99}]}).completed,true)
})

test('a thumbs-up must be held continuously before YES commits', () => {
  const fixture = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures/thumb-up-detection.json'), 'utf8'))
  const none = (_windows, done) => done({ label: null, confidence: 0, candidates: [] })
  const model = new TemporalWordRecognizer(manifest, none)
  model.replace(emptyWordDataset())
  model.predict({ ...fixture.frame, timestamp: 0 })
  model.predict({ hands: [], timestamp: 300 })
  assert.notEqual(model.predict({ ...fixture.frame, timestamp: 3000 }).completed, true, 'A return after a long absence restarts the hold')
  let committed = 0
  for (let timestamp = 3050; timestamp <= 3600; timestamp += 50) if (model.predict({ ...fixture.frame, timestamp }).completed) committed++
  assert.equal(committed, 1)
  const stalled = new TemporalWordRecognizer(manifest, none)
  stalled.replace(emptyWordDataset())
  stalled.predict({ ...fixture.frame, timestamp: 0 })
  assert.notEqual(stalled.predict({ ...fixture.frame, timestamp: 600 }).completed, true, 'Two frames 600 ms apart are not a continuous hold')
})

test('personally trained words replace pretrained matches for that word', () => {
  const personal = { labels: ['YES'], sampleCount: 3, replace() {}, reset() {}, predict: () => ({ label: null, confidence: 0 }) }
  const fixture = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures/thumb-up-detection.json'), 'utf8'))
  const model = new TemporalWordRecognizer(manifest, (_windows, done) => done({ label: 'YES', confidence: .95, candidates: [{ label: 'YES', confidence: .95 }] }), () => {}, personal)
  for (let time = 0; time <= 1400; time += 100) assert.notEqual(model.predict({ hands: [hand(time/1400)], timestamp: time }).completed, true)
  for (let time = 1500; time <= 3000; time += 100) {
    const prediction = model.predict({ hands: [], timestamp: time })
    assert.notEqual(prediction.completed, true, 'The forest YES must not commit')
    assert.ok(!(prediction.candidates ?? []).some(candidate => candidate.label === 'YES'))
  }
  for (let timestamp = 4000; timestamp <= 5000; timestamp += 50) assert.notEqual(model.predict({ ...fixture.frame, timestamp }).completed, true, 'Neither may the pretrained thumbs-up shortcut')
})

test('uncertain words stay suggestions, and pending replies after reset cannot commit', () => {
  const jobs = [], model = new TemporalWordRecognizer(manifest, (windows, done) => jobs.push({ windows, done }))
  model.replace(emptyWordDataset())
  for (let time = 0; time < 1000; time += 100) model.predict({ hands: [hand(time/1000)], timestamp: time })
  assert.equal(jobs.length, 1, 'Keep one query in flight')
  jobs[0].done({ label: null, confidence: .35, candidates: [{ label: 'YES', confidence: .35 }] })
  const update = model.predict({ hands: [hand(1)], timestamp: 1000 })
  assert.equal(update.completed, undefined); assert.equal(update.candidates[0].label, 'YES')
  model.reset()
  jobs.at(-1).done({ label: 'YES', confidence: .9, candidates: [] })
  assert.equal(model.predict({ hands: [], timestamp: 1500 }).completed, undefined)
})

test('forest validates its structure and rejects malformed frame vectors', () => {
  const model = { version: 1, features: 'hand-temporal-stats-v1', featureLength: TEMPORAL_FEATURE_SIZE, nodeWidth: 10, nodeCount: 1, roots: [0], labels: ['YES','__NONE__'], threshold: .55, margin: .15 }
  const forest = new TemporalForest(model, new Float32Array([-2,-2,-1,-1,0,.9,1,.1,1,0]))
  assert.equal(forest.predict(Array(TEMPORAL_FEATURE_SIZE).fill(0)).label, 'YES')
  assert.equal(forest.predict([NaN]).label, null)
  assert.throws(() => new TemporalForest({ ...model, nodeCount: 2 }, new Float32Array(10)))
  assert.throws(() => new TemporalForest(model, new Float32Array([0,0,12,12,0,1,1,0,1,0])))
})

test('only classes with calibration evidence auto-accept; others stay suggestions', () => {
  const model = { version: 1, features: 'hand-temporal-stats-v1', featureLength: TEMPORAL_FEATURE_SIZE, nodeWidth: 10, nodeCount: 1, roots: [0],
    labels: ['YES','YOUR','__NONE__'], threshold: .55, margin: .15, autoAccept: ['YES'] }
  const frame = Array(TEMPORAL_FEATURE_SIZE).fill(0)
  assert.equal(new TemporalForest(model, new Float32Array([-2,-2,-1,-1,0,.9,1,.1,2,0])).predict(frame).label, 'YES')
  const unvalidated = new TemporalForest(model, new Float32Array([-2,-2,-1,-1,1,.9,0,.1,2,0])).predict(frame)
  assert.equal(unvalidated.label, null)
  assert.equal(unvalidated.candidates.map(candidate => candidate.label).join(), 'YOUR')
  assert.throws(() => new TemporalForest({ ...model, autoAccept: ['WATER'] }, new Float32Array([-2,-2,-1,-1,0,.9,1,.1,2,0])))
})

test('a short tail window cannot outvote the whole sign with a different word', () => {
  const result = (label, top, confidence) => ({ label, top, confidence, candidates: [{ label: top, confidence }] })
  // The held-out YES whose 0.6 s ending looked like YOUR (docs/camera-stage-5.md).
  const fragment = chooseWindow([result('YOUR', 'YOUR', .68), result(null, 'YES', .37), result(null, 'YES', .45)])
  assert.equal(fragment.label, null)
  assert.equal(fragment.candidates[0].label, 'YOUR', 'it can still be offered for confirmation')
  assert.equal(chooseWindow([result('YES', 'YES', .7), result(null, 'YES', .5)]).label, 'YES')
  assert.equal(chooseWindow([result(null, 'NO', .3), result('YES', 'YES', .6), result('YES', 'YES', .8)]).confidence, .8)
  assert.equal(chooseWindow([]).label, null)
})

test('confirming a suggestion prevents a queued automatic duplicate', () => {
  const jobs = [], model = new TemporalWordRecognizer(manifest, (_windows, done) => jobs.push(done))
  model.replace(emptyWordDataset())
  for (let time = 0; time < 700; time += 100) model.predict({ hands: [hand(time/700)], timestamp: time })
  jobs[0]({ label: null, confidence: .4, candidates: [{ label: 'YES', confidence: .4 }] })
  model.predict({ hands: [hand(1)], timestamp: 900 })
  assert.equal(model.confirmCandidate('NO'), false)
  assert.equal(model.confirmCandidate('YES'), true)
  jobs.at(-1)({ label: 'YES', confidence: .9, candidates: [] })
  for (let time = 1000; time < 2000; time += 100) assert.notEqual(model.predict({ hands: [hand(1)], timestamp: time }).completed, true)
  assert.equal(model.confirmCandidate('YES'), false)
})
