// Reproducible coverage, derived from the shared vocabulary and shipped assets.
// No private samples, network calls, or fabricated recognition observations.
const fs = require('node:fs')
const path = require('node:path')
const { loadModule } = require('../test/load-module.cjs')
const cache = new Map(), load = file => loadModule(file, {}, cache)
const { SIGN_VOCABULARY } = load('lib/islVocabulary.ts')
const { appendSignFrames, advanceFrame, restValue, canonicalBone } = load('components/avatar/signQueue.ts')
const words = load('components/avatar/animations/words.js')
const letters = load('components/avatar/animations/alphabets.js')
const { NUMBER_ANIMATIONS } = load('components/avatar/animations/numbers.js')
const { NUMBERS_INTENT_ONLY } = load('lib/sign/knn-classifier.ts')
const root = path.join(__dirname, '..')
const read = file => JSON.parse(fs.readFileSync(path.join(root, file), 'utf8'))
const model = read('public/models/isl-temporal-model.json')
const poses = read('public/models/isl-samples.json')
const provenance = read('public/models/temporal-provenance.json')
const evaluation = read('public/models/word-evaluation.json')
if (evaluation.model !== model.sha256 || evaluation.datasetSha256 !== model.datasetSha256) throw new Error('word-evaluation.json does not describe the shipped model')
// Targets from docs/sign-data-collection.md; shortfalls become the collection manifest.
const NEED = { trainSigners: 10, testSigners: 3, testClips: 15 }
const PROMOTION = { testSigners: 3, testClips: 15, precision: .95 }
const autoAccept = new Set(model.autoAccept)
const ratio = (part, whole) => whole ? +(part / whole).toFixed(3) : null

function wordEvidence(target, observations) {
  const count = name => { const rows = observations.filter(item => item.partition === name); return { clips: rows.length, signers: new Set(rows.map(item => item.signer)).size } }
  const partitions = { train: count('train'), calibration: count('calibration'), test: count('test') }
  const row = evaluation.test.perClass[target]
  const test = row && row.observations ? { ...row, recall: ratio(row.acceptedCorrect, row.observations), precision: ratio(row.acceptedCorrect, row.acceptedCorrect + row.falseAccepts) } : null
  // The promotion rule: auto-accept chosen on calibration must also hold on the untouched test signers.
  const promoted = test && test.signers >= PROMOTION.testSigners && test.observations >= PROMOTION.testClips && test.precision !== null && test.precision >= PROMOTION.precision
  const status = !observations.length ? 'no-real-data' : !test ? 'trained-unevaluated' : !autoAccept.has(target) ? 'evaluated-suggestion-only'
    : promoted ? 'evaluated-auto-accept' : 'auto-accept-below-test-target'
  const trainSigners = evaluation.trainingSigners[target] ?? 0
  const need = [
    status === 'auto-accept-below-test-target' && (test.precision === null ? 'no accepted test clips at the runtime gates' : `test precision ${test.precision} is below ${PROMOTION.precision}`) + '; more calibration signers before it is trusted',
    trainSigners < NEED.trainSigners && `${NEED.trainSigners - trainSigners} more training signers (has ${trainSigners})`,
    partitions.test.signers < NEED.testSigners && `${NEED.testSigners - partitions.test.signers} more unseen test signers (has ${partitions.test.signers})`,
    partitions.test.clips < NEED.testClips && `${NEED.testClips - partitions.test.clips} more test clips`,
  ].filter(Boolean)
  return { status, partitions, trainSigners, test,
    confusedWith: evaluation.test.confusions.filter(pair => pair.expected === target).slice(0, 3).map(pair => ({ label: pair.predicted, count: pair.count })),
    collectionNeed: need.length ? need : ['none for this split; Deaf ISL variant review still pending'] }
}
const glb = fs.readFileSync(path.join(root, 'public/models/ybot.glb'))
const gltf = JSON.parse(glb.subarray(20, 20 + glb.readUInt32LE(12)).toString())
const bones = new Set(gltf.nodes.map(node => canonicalBone(node.name || '')))

function checkAnimation(play) {
  if (typeof play !== 'function') return { exists: false, runtimeValid: false }
  const runtime = { animations: [], characters: [], pending: true }, rig = new Map()
  const count = appendSignFrames(runtime, play)
  const deltaFor = bone => {
    const key = canonicalBone(bone)
    if (!rig.has(key)) rig.set(key, { x: restValue(bone, 'x'), y: restValue(bone, 'y'), z: restValue(bone, 'z') })
    return rig.get(key)
  }
  for (const frame of runtime.animations) {
    if (frame.some(([bone,,axis,value]) => !bones.has(canonicalBone(bone)) || !['x','y','z'].includes(axis) || !Number.isFinite(value))) throw new Error('Invalid animation target')
    let ticks = 0
    while (!advanceFrame(frame, deltaFor, .05)) if (++ticks > 2000) throw new Error('Animation did not finish')
  }
  const atRest = [...rig].every(([bone, delta]) => ['x','y','z'].every(axis => Math.abs(delta[axis] - restValue(bone, axis)) < 1e-9))
  return { exists: true, runtimeValid: count > 0 && atRest }
}

const entries = SIGN_VOCABULARY.map(sign => {
  const word = sign.kind === 'word'
  const target = word ? model.aliases[sign.token] || sign.token : sign.token
  const observations = word ? provenance.filter(item => item.label === target) : poses.samples.filter(item => item.label === target)
  const trained = word ? model.vocabulary.includes(sign.token) : observations.length >= 3
  const play = word ? words[sign.token] : sign.kind === 'letter' ? letters[sign.token] : NUMBER_ANIMATIONS[sign.token]
  const animation = checkAnimation(play)
  if (!animation.runtimeValid) throw new Error(`Invalid or missing animation: ${sign.id}`)
  const numbersOnly = !word && NUMBERS_INTENT_ONLY.has(sign.token)
  const evidence = word ? wordEvidence(target, observations) : { status: trained ? 'image-source-only' : 'no-real-data',
    sources: [...new Set(observations.map(item => item.source ?? poses.source))],
    collectionNeed: [trained ? 'signer-identified recordings for a signer-disjoint test' : 'labelled recordings of this sign',
      ...numbersOnly ? ['recordings that show how 0 differs from letter O, if it does; the bundled photographs are the same captures as O'] : []] }
  return { ...sign, animation: { ...sign.animation, ...animation },
    recognition: {
      availability: trained ? 'bundled-experimental' : 'personal-training-only',
      modelClass: target, modelAlias: target === sign.token ? null : target,
      modelAliasReview: target === sign.token ? null : 'needs-sign-variant-review',
      realDataAvailable: observations.length > 0, sourceObservations: observations.length, trained,
      dataset: word ? 'public/models/isl-temporal-model.json' : 'public/models/isl-samples.json',
      version: word ? model.version : poses.version,
      features: word ? model.features : poses.normalization,
      license: word ? model.license : [...new Set(observations.map(item => item.license ?? poses.license))].join(', ') || poses.license,
      sources: word ? model.sources : evidence.sources.length ? evidence.sources : [poses.source],
      independentEvaluation: evidence.test ? `signer-disjoint test: ${evidence.test.observations} clips, ${evidence.test.signers} signers` : 'not-established',
      linguisticReview: 'pending-Deaf-ISL-review',
      autoAccept: !trained ? 'unavailable-without-personal-data' : numbersOnly ? 'numbers-intent-only' : !word ? 'experimental-runtime-gates-only' : autoAccept.has(target) ? 'calibrated-runtime-gates' : 'suggestion-only',
      verifiedForGeneralUse: false,
    },
    evidence,
  }
})
const report = { version: 1, generatedFrom: 'scripts/generate-vocabulary-coverage.cjs',
  note: 'Mechanical playback and model coverage only. No entry is certified for linguistic correctness or general webcam accuracy. Hindi aliases remain in the existing Hindi translator; none are certified by this report.',
  summary: { entries: entries.length, words: entries.filter(e => e.kind === 'word').length,
    letters: 26, digits: 10, bundledWordEntries: entries.filter(e => e.kind === 'word' && e.recognition.trained).length,
    learnedWordClasses: new Set(entries.filter(e => e.kind === 'word' && e.recognition.trained).map(e => e.recognition.modelClass)).size,
    bundledStaticEntries: entries.filter(e => e.kind !== 'word' && e.recognition.trained).length,
    missingWords: entries.filter(e => e.kind === 'word' && !e.recognition.trained).map(e => e.token),
    missingStatic: entries.filter(e => e.kind !== 'word' && !e.recognition.trained).map(e => e.id),
    wordStatus: entries.filter(e => e.kind === 'word').reduce((counts, e) => ({ ...counts, [e.evidence.status]: (counts[e.evidence.status] ?? 0) + 1 }), {}),
    gates: { threshold: model.threshold, margin: model.margin, chosenOn: evaluation.gates.chosenOn },
    test: { observations: evaluation.test.observations, acceptedCorrect: evaluation.test.acceptedCorrect, acceptedWrong: evaluation.test.acceptedWrong, rejected: evaluation.test.rejected },
  }, entries }
const json = JSON.stringify(report, null, 2) + '\n'
const markdown = `# Shared sign vocabulary coverage\n\nGenerated with \`npm run coverage:sign\`. ${report.note}\n\n` +
  `${report.summary.words} word entries; ${report.summary.bundledWordEntries} bundled word entries (${report.summary.learnedWordClasses} distinct model classes); 26 letters and 10 digits, of which ${report.summary.bundledStaticEntries} have bundled pose data.\n\n` +
  'Every animation below passes the YBot bone, completion and return-to-rest check. All linguistic reviews are pending. Runtime gates are experimental, not approval for general use. Source holdouts do not establish per-class webcam accuracy. Empty Hindi aliases mean unreviewed, not that Hindi translation was removed.\n\n' +
  `Word status: ${Object.entries(report.summary.wordStatus).map(([status, count]) => `${count} ${status}`).join(', ')}. Gates ${model.threshold}/${model.margin} were chosen on calibration signers; test clips are signer-disjoint. Recall and precision are runtime-gate results on that test split (accepted correct / clips, accepted correct / all accepts as that word).\n\n` +
  '| ID | Readable label / English aliases | Animation | Real data / trained | Train / calibration / test clips (signers) | Held-out recall, precision | Runtime | Model alias |\n| --- | --- | --- | --- | --- | --- | --- | --- |\n' +
  entries.map(e => { const p = e.evidence.partitions, t = e.evidence.test
    return `| ${e.id} | ${e.label}${e.aliases.en.length ? ' / ' + e.aliases.en.join(', ') : ''} | valid | ${e.recognition.sourceObservations} / ${e.recognition.trained ? 'yes' : 'no'} | ${p ? ['train', 'calibration', 'test'].map(name => `${p[name].clips} (${p[name].signers})`).join(' / ') : 'image source'} | ${t ? `${t.recall}, ${t.precision ?? '-'}` : '-'} | ${e.recognition.autoAccept} | ${e.recognition.modelAlias || '-'} |` }).join('\n') +
  '\n\n## Collection needs\n\nTargets: ' + `${NEED.trainSigners} training signers, ${NEED.testSigners} unseen test signers and ${NEED.testClips} test clips per word variant ([protocol](sign-data-collection.md)).\n\n` +
  entries.filter(e => e.evidence.status !== 'evaluated-auto-accept').map(e => `- ${e.id} (${e.evidence.status}): ${e.evidence.collectionNeed.join('; ')}${e.evidence.confusedWith?.length ? `; confused with ${e.evidence.confusedWith.map(c => `${c.label} ×${c.count}`).join(', ')}` : ''}`).join('\n') +
  '\n\nMachine-readable modality review flags, per-entry source/license/version and recognition status: [isl-coverage.json](../public/models/isl-coverage.json).\n\nReview queue: compare handshape, palm orientation, body-relative location, motion direction, two-hand relationships and non-manual markers with ISLRTC references and Deaf signers. No animation was changed merely because a model has the same English label.\n'
const outputs = [['public/models/isl-coverage.json', json], ['docs/sign-vocabulary-coverage.md', markdown]]
for (const [file, content] of outputs) {
  if (process.argv.includes('--check')) {
    if (!fs.existsSync(path.join(root, file)) || fs.readFileSync(path.join(root, file), 'utf8') !== content) throw new Error(`Coverage out of date: ${file}`)
  } else fs.writeFileSync(path.join(root, file), content)
}
console.log(JSON.stringify(report.summary, null, 2))
