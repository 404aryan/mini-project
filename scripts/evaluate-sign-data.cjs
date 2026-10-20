// Evaluate observations excluded by the data preparation scripts, at the live
// stabilizer's confidence threshold. This is source-domain validation, not a
// claim about new signers or webcam accuracy.
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm'), ts = require('typescript')
const cache = new Map()
function load(name) {
  if (cache.has(name)) return cache.get(name)
  const exports = {}; cache.set(name, exports)
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(path.join(__dirname, '../lib/sign', `${name}.ts`), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText, { exports, require: name => load(name.replace(/^\.\//, '')), Float64Array })
  return exports
}
const read = file => JSON.parse(fs.readFileSync(path.join(__dirname, '..', file), 'utf8'))
// The held-out files are produced by scripts/prepare-sign-data.py and
// scripts/prepare-word-data.py into the git-ignored cache. Without them there is
// nothing to evaluate, which must never look like a passing run.
const missing = ['static', 'word'].map(kind => `.sign-data-cache/${kind}-heldout.json`).filter(file => !fs.existsSync(path.join(__dirname, '..', file)))
if (missing.length) {
  console.error(`Held-out data missing: ${missing.join(', ')}. Run the preparation scripts first; no evaluation was performed.`)
  process.exit(1)
}
const reports = []
for (const kind of ['static', 'word']) {
  const file = `.sign-data-cache/${kind}-heldout.json`
  const recognizer = kind === 'static' ? new (load('knn-classifier').KnnSignRecognizer)() : new (load('dtw-classifier').DtwSignRecognizer)()
  recognizer.replace(read(`public/models/isl-${kind === 'static' ? 'samples' : 'words'}.json`))
  const cases = read(file).samples.map(sample => {
    const prediction = kind === 'static' ? recognizer.predictFeatures(sample.features, sample.relation) : recognizer.predictSequence(sample.frames, sample.handCount)
    return { expected: sample.label, predicted: prediction.confidence >= .8 ? prediction.label : null, confidence: +prediction.confidence.toFixed(3) }
  })
  reports.push({ kind, labels: recognizer.labels.length, references: recognizer.sampleCount, observations: cases.length,
    acceptedCorrect: cases.filter(x => x.expected === x.predicted).length,
    acceptedWrong: cases.filter(x => x.predicted && x.expected !== x.predicted).length,
    rejected: cases.filter(x => !x.predicted).length, cases })
}
// Photographs from a second source (other participants and camera). Digit 0 is
// trained from that source, so only its other classes are a cross-source test.
const crossFile = path.join(__dirname, '../.sign-data-cache/static-cross-source.json')
// Each photograph is scored as the app would: Spell for every class, and Numbers
// (digit references only) for digits.
if (fs.existsSync(crossFile)) for (const context of ['spell', 'numbers']) {
  const { KnnSignRecognizer, spellingLabel, numberLabel } = load('knn-classifier')
  const recognizer = new KnnSignRecognizer(undefined, context === 'spell' ? spellingLabel : numberLabel)
  recognizer.replace(read('public/models/isl-samples.json'))
  const cases = read('.sign-data-cache/static-cross-source.json').samples.filter(sample => context === 'spell' || numberLabel(sample.label)).map(sample => {
    const prediction = sample.features ? recognizer.predictFeatures(sample.features, sample.relation) : { label: null, confidence: 0 }
    return { expected: sample.label, detected: !!sample.features, predicted: prediction.confidence >= .8 ? prediction.label : null,
      top: prediction.label, confidence: +prediction.confidence.toFixed(3) }
  })
  const perLabel = Object.fromEntries([...new Set(cases.map(x => x.expected))].sort().map(label => {
    const own = cases.filter(x => x.expected === label)
    return [label, { photographs: own.length, detected: own.filter(x => x.detected).length, acceptedCorrect: own.filter(x => x.predicted === label).length,
      acceptedWrong: own.filter(x => x.predicted && x.predicted !== label).map(x => x.predicted).join(''),
      falseAccepts: cases.filter(x => x.predicted === label && x.expected !== label).length }]
  }))
  reports.push({ kind: `static-cross-source-${context}`, source:read('.sign-data-cache/static-cross-source.json').source, observations: cases.length,
    detected: cases.filter(x => x.detected).length, acceptedCorrect: cases.filter(x => x.expected === x.predicted).length,
    acceptedWrong: cases.filter(x => x.predicted && x.expected !== x.predicted).length, rejected: cases.filter(x => !x.predicted).length,
    topChoiceCorrect: cases.filter(x => x.top === x.expected).length, perLabel, cases })
}
const report = { note: 'Held-out source observations are not signer-independent or webcam validation. The cross-source photographs are other signers and a different camera, but still still images rather than live video.', reports }
fs.writeFileSync(path.join(__dirname, '../.sign-data-cache/evaluation.json'), JSON.stringify(report, null, 2))
console.log(JSON.stringify(reports.map(({cases, ...summary}) => summary), null, 2))
