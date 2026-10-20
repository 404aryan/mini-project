const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm'), ts = require('typescript')
const cache = new Map()
function load(name) {
  if (cache.has(name)) return cache.get(name)
  const exports = {}; cache.set(name, exports)
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(path.join(__dirname, '../lib/sign', `${name}.ts`), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText, { exports, require: name => load(name.replace('./', '')), Float64Array })
  return exports
}
const { SequenceEncoder } = load('sequence-features'), { DtwSignRecognizer } = load('dtw-classifier'), { WORD_LABELS, emptyWordDataset } = load('word-data')
const encoder = new SequenceEncoder()
const frames = Array.from({ length: 30 }, (_, i) => encoder.encode({ hands: [Array.from({ length: 21 }, (_, j) => ({ x: .2 + i / 145 + (j ? (j % 4 + 1) * .018 : 0), y: .7 - j * .015, z: j * .001 }))], timestamp: i * 68 }))
const dataset = { ...emptyWordDataset(), samples: WORD_LABELS.flatMap(label => Array.from({ length: 5 }, (_, i) => ({ id: `${label}-${i}`, label, handCount: 1, durationMs: 1972, frames }))) }
const r = new DtwSignRecognizer(); r.replace(dataset)
for (let i = 0; i < 3; i++) r.predictSequence(frames, 1)
const durations = Array.from({ length: 5 }, () => { const start = performance.now(); r.predictSequence(frames, 1); return performance.now() - start })
console.log(JSON.stringify({ labels: r.labels.length, references: r.sampleCount, timingsMs: durations.map(n => +n.toFixed(2)), averageMs: +(durations.reduce((a, b) => a + b, 0) / durations.length).toFixed(2), note: 'Synthetic worst-case local Node microbenchmark; not a camera FPS measurement.' }))
