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
  }).outputText, { exports, require: name => load(name.replace('./', '')), Float64Array })
  return exports
}
const read = file => JSON.parse(fs.readFileSync(path.join(__dirname, '..', file), 'utf8'))
const reports = []
for (const kind of ['static', 'word']) {
  const file = `.sign-data-cache/${kind}-heldout.json`
  if (!fs.existsSync(path.join(__dirname, '..', file))) continue
  const recognizer = kind === 'static' ? new (load('knn-classifier').KnnSignRecognizer)() : new (load('dtw-classifier').DtwSignRecognizer)()
  recognizer.replace(read(`public/models/isl-${kind === 'static' ? 'samples' : 'words'}.json`))
  const cases = read(file).samples.map(sample => {
    const prediction = kind === 'static' ? recognizer.predictFeatures(sample.features) : recognizer.predictSequence(sample.frames, sample.handCount)
    return { expected: sample.label, predicted: prediction.confidence >= .8 ? prediction.label : null, confidence: +prediction.confidence.toFixed(3) }
  })
  reports.push({ kind, labels: recognizer.labels.length, references: recognizer.sampleCount, observations: cases.length,
    acceptedCorrect: cases.filter(x => x.expected === x.predicted).length,
    acceptedWrong: cases.filter(x => x.predicted && x.expected !== x.predicted).length,
    rejected: cases.filter(x => !x.predicted).length, cases })
}
const report = { note: 'Held-out source observations, not signer-independent or webcam validation.', reports }
fs.writeFileSync(path.join(__dirname, '../.sign-data-cache/evaluation.json'), JSON.stringify(report, null, 2))
console.log(JSON.stringify(reports.map(({cases, ...summary}) => summary), null, 2))
