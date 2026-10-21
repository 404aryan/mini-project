// Validation-session metrics. Every session here is synthetic test input, not a
// signer result; none of it may be reported as validation evidence.
const { test } = require('node:test'), assert = require('node:assert/strict')
const fs = require('node:fs'), os = require('node:os'), path = require('node:path'), { spawnSync } = require('node:child_process')
const { loadModule } = require('./load-module.cjs')
const { buildPlan, parseValidationSession, evaluateValidation, alignTokens, rate, PRIORITY_WORDS } = loadModule('lib/sign/validation.ts')
const same = (actual, expected, message) => assert.deepEqual(JSON.parse(JSON.stringify(actual)), expected, message)

let serial = 0
const session = (signer, trials, { type = 'deaf-isl-signer', seen = 'no', device = 'laptop-webcam' } = {}) => ({
  schema: 'isl-signer-validation-v1', id: `session-${signer}-${++serial}`, createdAt: 1, seed: 7,
  app: { wordModelSha256: null, tracking: 'signer', personalRecordings: 'excluded' },
  signer: { id: signer, type, region: '', dominantHand: 'right', inTrainingData: seen },
  consent: { recordId: 'consent-1', confirmed: true }, conditions: { device, lighting: 'bright', background: '' }, plan: [], trials,
})
const trial = (target, commits = [], { intent = 'words', releases = [], at = 3000, candidates = [], outcome = 'ok', block, endedAt = 5000 } = {}) => ({
  block: block ?? (target.length > 1 ? 'sequence' : 'isolated'), intent, target, id: `t${++serial}`, startedAt: 1000, endedAt, releases,
  commits: commits.map((canonical, index) => ({ canonical, kind: canonical.split(':')[0], source: 'word-model', commit: 'automatic', at: at + index * 400 })),
  candidates, outcome, note: '',
})
const nonSign = (commits, seconds = 60) => ({ ...trial([], commits, { block: 'non-sign', endedAt: 1000 + seconds * 1000 }), seconds })

test('plans are reproducible, grouped by intent and repeat each sign', () => {
  const options = { words: PRIORITY_WORDS, repeats: 3, phrases: true, letters: true, digits: true, names: ['Amit'], nonSignSeconds: 60 }
  const plan = buildPlan(options, 42)
  same(plan, JSON.parse(JSON.stringify(buildPlan(options, 42))))
  assert.notDeepEqual(plan.map(entry => entry.target.join()), buildPlan(options, 43).map(entry => entry.target.join()))
  assert.equal(plan.length, 15 * 3 + 4 + 1 + 26 * 3 + 1 + 1 + 10 * 3)
  const order = plan.map(entry => `${entry.intent}/${entry.block}`).filter((value, index, all) => value !== all[index - 1])
  same(order, ['words/isolated', 'words/sequence', 'words/non-sign', 'static/isolated', 'static/sequence', 'static/non-sign', 'numbers/isolated'])
  assert.equal(plan.filter(entry => entry.target.join() === 'word:HELLO').length, 3)
  same(plan.find(entry => entry.intent === 'static' && entry.block === 'sequence').target, ['letter:A', 'letter:M', 'letter:I', 'letter:T'])
})

test('session files carry outputs and timings only, with consent', () => {
  const valid = session('s-001', [trial(['word:HELLO'], ['word:HELLO'])])
  assert.equal(parseValidationSession(valid).signer.id, 's-001')
  assert.throws(() => parseValidationSession({ ...valid, frames: [] }), /unexpected fields/)
  assert.throws(() => parseValidationSession({ ...valid, trials: [{ ...valid.trials[0], landmarks: [[0, 0, 0]] }] }), /invalid trial/)
  assert.throws(() => parseValidationSession({ ...valid, consent: { recordId: 'consent-1', confirmed: false } }), /consent/)
  assert.throws(() => parseValidationSession({ ...valid, signer: { ...valid.signer, id: 'Amit Kumar' } }), /signer/)
  assert.throws(() => parseValidationSession({ ...valid, app: { ...valid.app, personalRecordings: 'included' } }), /app record/)
})

test('isolated trials report precision, coverage, rejection, top choice and duplicates separately', () => {
  const report = evaluateValidation([session('s-001', [
    trial(['word:HELLO'], ['word:HELLO']), trial(['word:HELLO'], ['word:HELLO', 'word:HELLO']), trial(['word:YES'], ['word:YOUR']),
    trial(['word:NO'], [], { candidates: [{ id: 'word:NO', kind: 'word', firstSeenAt: 2000, bestScore: .4 }, { id: 'word:KNOW', kind: 'word', firstSeenAt: 2000, bestScore: .2 }] }),
    trial(['word:GO'], []), trial(['word:GO'], ['word:GO'], { outcome: 'variant-differs' }),
  ])])
  const words = report.byIntent.words.isolated
  same([words.trials, words.correct, words.wrong, words.rejected, words.excluded, words.variantDiffers], [5, 2, 1, 2, 1, 1])
  same([words.precision.k, words.precision.n, words.coverage.k, words.coverage.n], [2, 3, 2, 5])
  assert.equal(words.top1.k, 3, 'a rejected trial whose best candidate was right counts as a correct top choice')
  assert.equal(words.candidateRecall.k, 3)
  same([words.duplicates, words.extraCommits], [1, 1])
  const yes = report.byIntent.words.perClass.find(entry => entry.id === 'word:YES'), your = report.byIntent.words.perClass.find(entry => entry.id === 'word:YOUR')
  same([yes.recall.k, yes.recall.n, your.precision.k, your.precision.n], [0, 1, 0, 1], 'a wrong class appears with zero precision instead of disappearing')
  assert.ok(report.byIntent.words.weakClasses.some(entry => entry.id === 'word:YES'))
})

test('latency is measured from the last release before a correct commit', () => {
  const report = evaluateValidation([session('s-001', [
    trial(['word:HELLO'], ['word:HELLO'], { releases: [2000, 2600], at: 3100 }),
    trial(['word:HELLO'], ['word:HELLO'], { releases: [2000], at: 2900 }),
    trial(['letter:A'], ['letter:A'], { intent: 'static', at: 1800 }),
  ])])
  same(report.byIntent.words.latency, { measured: 2, duringSign: 0, p50: 500, p95: 900 })
  assert.equal(report.byIntent.static.latency.duringSign, 1, 'a held letter commits before release and is not given a release latency')
})

test('sequences count substitutions, insertions and deletions', () => {
  same(alignTokens(['word:I', 'word:WANT'], ['word:I', 'word:GO']), { substitutions: 1, insertions: 0, deletions: 0 })
  same(alignTokens(['word:I', 'word:WANT', 'word:WATER'], ['word:I', 'word:WATER']), { substitutions: 0, insertions: 0, deletions: 1 })
  same(alignTokens(['letter:A', 'letter:M'], ['letter:A', 'letter:A', 'letter:M']), { substitutions: 0, insertions: 1, deletions: 0 })
  const report = evaluateValidation([session('s-001', [trial(['word:I', 'word:WANT', 'word:WATER'], ['word:I', 'word:WATER'])])])
  same([report.byIntent.words.sequence.deletions, report.byIntent.words.sequence.referenceTokens, report.byIntent.words.sequence.errorRate], [1, 3, 1 / 3])
})

test('non-sign activity reports false commits per 10 minutes', () => {
  const report = evaluateValidation([session('s-001', [nonSign(['word:GO']), nonSign([], 240)])])
  same(report.byIntent.words.nonSign, { minutes: 5, falseCommits: 1, perTenMinutes: 2 })
})

test('only three or more unseen ISL signers make an independent evaluation', () => {
  const correct = Array.from({ length: 20 }, () => trial(['word:HELLO'], ['word:HELLO'], { releases: [2500], at: 2900 }))
  const two = [session('s-001', correct), session('s-002', correct), session('i-001', correct, { type: 'interpreter' }), session('s-009', correct, { seen: 'unknown' })]
  const partial = evaluateValidation(two)
  assert.equal(partial.independence.unseenIslSigners, 2)
  assert.equal(partial.independence.eligible, false)
  assert.ok(partial.targets.every(target => target.status === 'insufficient-data'), 'targets are never declared met without independent signers')
  const full = evaluateValidation([...two, session('s-003', correct)])
  assert.equal(full.independence.eligible, true)
  assert.equal(full.targets[0].status, 'met')
  assert.equal(full.targets[1].status, 'insufficient-data', 'no non-sign minutes were recorded')
  same(full.byIntent.words.promotable, ['word:HELLO'])
  same(full.breakdowns.signerType.map(row => row.key), ['deaf-isl-signer', 'interpreter'])
})

test('a confusable class fails the promotion rule on precision', () => {
  const hello = Array.from({ length: 5 }, () => trial(['word:HELLO'], ['word:HELLO']))
  const report = evaluateValidation(['s-001', 's-002', 's-003'].map(id => session(id, hello)).concat(session('s-004', [trial(['word:BAD'], ['word:HELLO'])])))
  const entry = report.byIntent.words.perClass.find(row => row.id === 'word:HELLO')
  same([entry.precision.k, entry.precision.n, entry.independentSigners], [15, 16, 3])
  same(report.byIntent.words.promotable, [])
})

test('Wilson intervals keep small samples honest', () => {
  const value = rate(19, 20)
  assert.ok(Math.abs(value.low - .7639) < 1e-3 && Math.abs(value.high - .9911) < 1e-3)
  same(rate(0, 0), { k: 0, n: 0, value: null, low: null, high: null })
})

test('the report script reads exported sessions and skips invalid files', () => {
  const folder = fs.mkdtempSync(path.join(os.tmpdir(), 'isl-validation-'))
  try {
    fs.writeFileSync(path.join(folder, 'a.json'), JSON.stringify(session('s-001', [trial(['word:HELLO'], ['word:HELLO']), nonSign([])])))
    const script = path.join(__dirname, '../scripts/evaluate-signer-validation.cjs')
    const ok = spawnSync(process.execPath, [script, folder, '--json', path.join(folder, 'report.out')], { encoding: 'utf8' })
    assert.equal(ok.status, 0, ok.stderr)
    assert.match(ok.stdout, /Not an independent signer evaluation: 1 unseen ISL signer;/)
    assert.match(ok.stdout, /automatic-commit precision 100\.0% \(95% CI/)
    assert.equal(JSON.parse(fs.readFileSync(path.join(folder, 'report.out'), 'utf8')).byIntent.words.isolated.correct, 1)
    fs.writeFileSync(path.join(folder, 'b.json'), JSON.stringify({ schema: 'isl-signer-validation-v1', landmarks: [] }))
    const bad = spawnSync(process.execPath, [script, folder], { encoding: 'utf8' })
    assert.equal(bad.status, 1)
    assert.match(bad.stderr, /Skipped .*b\.json/)
  } finally { fs.rmSync(folder, { recursive: true, force: true }) }
})
