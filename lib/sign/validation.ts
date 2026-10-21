import type { SignEvent, TokenKind } from './types'

/** Facilitated sessions with consented signers who are not in the training data.
 * Sessions store recognized outputs and timings only: no video, images or landmarks. */
export const VALIDATION_SCHEMA = 'isl-signer-validation-v1'
export const PRIORITY_WORDS = ['HELLO', 'YES', 'NO', 'GOOD', 'BAD', 'THANK_YOU', 'GO', 'WANT', 'PLEASE', 'HELP', 'SORRY', 'COME', 'WATER', 'EAT', 'DRINK']
/** Gloss sequences of bundled words, signed in the order shown. They are not natural ISL sentences. */
export const VALIDATION_PHRASES = [['I', 'WANT', 'WATER'], ['THANK_YOU', 'GOOD'], ['PLEASE', 'HELP', 'I'], ['NO', 'WANT', 'FOOD']]
export const SIGNER_TYPES = ['deaf-isl-signer', 'hard-of-hearing-isl-signer', 'interpreter', 'coda', 'learner'] as const
export const LIGHTING = ['bright', 'dim', 'backlit', 'mixed'] as const
export const OUTCOMES = ['ok', 'variant-differs', 'performance-error', 'skipped'] as const
const ISL_SIGNERS: readonly string[] = ['deaf-isl-signer', 'hard-of-hearing-isl-signer']

export type ValidationIntent = 'words' | 'static' | 'numbers'
export type TrialBlock = 'isolated' | 'sequence' | 'non-sign'
export type TrialOutcome = typeof OUTCOMES[number]
export type PlannedTrial = { block: TrialBlock; intent: ValidationIntent; target: string[]; seconds?: number }
export type ValidationCommit = { canonical: string; kind: TokenKind; source: SignEvent['source']; commit: SignEvent['commit']; at: number; score?: SignEvent['score'] }
export type ValidationCandidate = { id: string; kind: TokenKind; firstSeenAt: number; bestScore: number }
export type ValidationTrial = PlannedTrial & {
  id: string; startedAt: number; endedAt: number
  /** Times both hands left the picture; latency is measured from the last one before a commit. */
  releases: number[]
  commits: ValidationCommit[]; candidates: ValidationCandidate[]; outcome: TrialOutcome; note: string
}
export type ValidationSession = {
  schema: typeof VALIDATION_SCHEMA; id: string; createdAt: number; seed: number
  app: { wordModelSha256: string | null; tracking: 'signer' | 'hands'; personalRecordings: 'excluded' }
  signer: { id: string; type: typeof SIGNER_TYPES[number]; region: string; dominantHand: 'right' | 'left' | 'both' | 'unknown'; inTrainingData: 'no' | 'unknown' | 'yes' }
  consent: { recordId: string; confirmed: true }
  conditions: { device: string; lighting: typeof LIGHTING[number]; background: string }
  plan: PlannedTrial[]; trials: ValidationTrial[]
}

export const canonicalId = (kind: TokenKind, label: string) => `${kind}:${label.replaceAll(' ', '_')}`
export const readableTarget = (target: readonly string[]) => {
  const labels = target.map(id => id.slice(id.indexOf(':') + 1).replaceAll('_', ' '))
  return target.every(id => !id.startsWith('word:')) ? labels.join('-') : labels.join(' ')
}

function random(seed: number) {
  let state = seed >>> 0
  return () => {
    state = state + 0x6D2B79F5 >>> 0
    let value = Math.imul(state ^ state >>> 15, 1 | state)
    value ^= value + Math.imul(value ^ value >>> 7, 61 | value)
    return ((value ^ value >>> 14) >>> 0) / 4294967296
  }
}
function shuffle<T>(items: T[], next: () => number) {
  const result = [...items]
  for (let i = result.length - 1; i > 0; i--) { const j = Math.floor(next() * (i + 1)); [result[i], result[j]] = [result[j], result[i]] }
  return result
}

export type PlanOptions = { words: string[]; repeats: number; phrases: boolean; letters: boolean; digits: boolean; names: string[]; nonSignSeconds: number }

/** Blocks are grouped by intent, so recognition switches modes only between blocks.
 * Order inside a block is shuffled with the session seed and can be reproduced. */
export function buildPlan(options: PlanOptions, seed: number): PlannedTrial[] {
  const next = random(seed), repeats = Math.max(1, Math.min(10, Math.round(options.repeats)))
  const repeat = (targets: string[][]) => targets.flatMap(target => Array.from({ length: repeats }, () => target))
  const isolated = (intent: ValidationIntent, ids: string[]) => shuffle(repeat(ids.map(id => [id])), next).map(target => ({ block: 'isolated' as const, intent, target }))
  const nonSign = (intent: ValidationIntent) => options.nonSignSeconds > 0 ? [{ block: 'non-sign' as const, intent, target: [], seconds: Math.round(options.nonSignSeconds) }] : []
  const names = options.names.map(name => name.toUpperCase().replace(/[^A-Z]/g, '')).filter(Boolean)
  return [
    ...isolated('words', options.words.map(word => canonicalId('word', word))),
    ...(options.phrases ? shuffle(VALIDATION_PHRASES, next).map(phrase => ({ block: 'sequence' as const, intent: 'words' as const, target: phrase.map(word => canonicalId('word', word)) })) : []),
    ...nonSign('words'),
    ...(options.letters ? isolated('static', [...'ABCDEFGHIJKLMNOPQRSTUVWXYZ'].map(letter => canonicalId('letter', letter))) : []),
    ...names.map(name => ({ block: 'sequence' as const, intent: 'static' as const, target: [...name].map(letter => canonicalId('letter', letter)) })),
    ...(options.letters || names.length ? nonSign('static') : []),
    ...(options.digits ? isolated('numbers', [...'0123456789'].map(digit => canonicalId('number', digit))) : []),
  ]
}

export function startTrial(planned: PlannedTrial, id: string, now: number): ValidationTrial {
  return { ...planned, id, startedAt: now, endedAt: now, releases: [], commits: [], candidates: [], outcome: 'ok', note: '' }
}
export function addCandidates(trial: ValidationTrial, candidates: readonly { id: string; kind: TokenKind; score: number }[], now: number): ValidationTrial {
  if (!candidates.length) return trial
  const merged = new Map(trial.candidates.map(candidate => [candidate.id, candidate]))
  for (const { id, kind, score } of candidates) {
    const known = merged.get(id)
    merged.set(id, known ? { ...known, bestScore: Math.max(known.bestScore, score) } : { id, kind, firstSeenAt: now, bestScore: score })
  }
  return { ...trial, candidates: [...merged.values()] }
}
export const addRelease = (trial: ValidationTrial, at: number): ValidationTrial => ({ ...trial, releases: [...trial.releases, at] })
export const addCommit = (trial: ValidationTrial, sign: SignEvent): ValidationTrial => ({ ...trial, commits: [...trial.commits, {
  canonical: sign.canonical, kind: sign.kind, source: sign.source, commit: sign.commit, at: sign.endedAt, ...(sign.score ? { score: sign.score } : {}) }] })

const text = (value: unknown, max: number, pattern?: RegExp) => typeof value === 'string' && value.length <= max && (!pattern || pattern.test(value))
const time = (value: unknown) => typeof value === 'number' && Number.isFinite(value) && value >= 0
const CANONICAL = /^(word:[A-Z_]{1,24}|letter:[A-Z]|number:[0-9])$/
const KINDS = ['word', 'letter', 'number'], INTENTS = ['words', 'static', 'numbers'], BLOCKS = ['isolated', 'sequence', 'non-sign']
const SOURCES = ['word-model', 'personal-words', 'thumbs-up-shortcut', 'letters-numbers']
const only = (value: object, keys: readonly string[]) => Object.keys(value).every(key => keys.includes(key))
const TRIAL_KEYS = ['block', 'intent', 'target', 'seconds', 'id', 'startedAt', 'endedAt', 'releases', 'commits', 'candidates', 'outcome', 'note']
function plannedValid(value: Record<string, unknown>) {
  return BLOCKS.includes(value.block as string) && INTENTS.includes(value.intent as string)
    && Array.isArray(value.target) && value.target.length <= 40 && value.target.every(id => text(id, 32, CANONICAL))
    && (value.block === 'non-sign' ? value.target.length === 0 && time(value.seconds) : value.target.length > 0)
}

/** Rejects anything that is not a session export, including frames or landmarks. */
export function parseValidationSession(input: unknown): ValidationSession {
  const fail = (reason: string): never => { throw new Error(`Not a ${VALIDATION_SCHEMA} session: ${reason}.`) }
  const session = input as ValidationSession
  if (!session || typeof session !== 'object' || session.schema !== VALIDATION_SCHEMA) fail('wrong schema')
  if (!only(session, ['schema', 'id', 'createdAt', 'seed', 'app', 'signer', 'consent', 'conditions', 'plan', 'trials'])) fail('unexpected fields')
  if (!text(session.id, 64, /^[\w-]+$/) || !time(session.createdAt) || !Number.isInteger(session.seed)) fail('missing id, date or seed')
  const { signer, consent, conditions, app } = session
  if (!signer || !text(signer.id, 32, /^[A-Za-z0-9-]+$/) || !SIGNER_TYPES.includes(signer.type) || !text(signer.region, 60)
    || !['right', 'left', 'both', 'unknown'].includes(signer.dominantHand) || !['no', 'unknown', 'yes'].includes(signer.inTrainingData)) fail('invalid signer record')
  if (!consent || consent.confirmed !== true || !text(consent.recordId, 64, /^[\w-]+$/)) fail('consent record missing')
  if (!conditions || !text(conditions.device, 60) || !LIGHTING.includes(conditions.lighting) || !text(conditions.background, 60)) fail('invalid conditions')
  if (!app || app.personalRecordings !== 'excluded' || !['signer', 'hands'].includes(app.tracking) || !(app.wordModelSha256 === null || text(app.wordModelSha256, 64, /^[0-9a-f]{64}$/))) fail('invalid app record')
  if (!Array.isArray(session.plan) || session.plan.length > 2000 || !session.plan.every(entry => entry && only(entry, ['block', 'intent', 'target', 'seconds']) && plannedValid(entry as unknown as Record<string, unknown>))) fail('invalid plan')
  if (!Array.isArray(session.trials) || session.trials.length > 2000) fail('invalid trials')
  for (const trial of session.trials) {
    if (!trial || !only(trial, TRIAL_KEYS) || !plannedValid(trial as unknown as Record<string, unknown>) || !text(trial.id, 64, /^[\w-]+$/) || !time(trial.startedAt) || !time(trial.endedAt) || trial.endedAt < trial.startedAt
      || !OUTCOMES.includes(trial.outcome) || !text(trial.note, 200) || !Array.isArray(trial.releases) || !trial.releases.every(time)
      || !Array.isArray(trial.commits) || trial.commits.length > 200 || !trial.commits.every(commit => commit && only(commit, ['canonical', 'kind', 'source', 'commit', 'at', 'score']) && text(commit.canonical, 32, CANONICAL) && KINDS.includes(commit.kind) && SOURCES.includes(commit.source) && ['automatic', 'confirmed'].includes(commit.commit) && time(commit.at))
      || !Array.isArray(trial.candidates) || trial.candidates.length > 400 || !trial.candidates.every(candidate => candidate && only(candidate, ['id', 'kind', 'firstSeenAt', 'bestScore']) && text(candidate.id, 32, CANONICAL) && KINDS.includes(candidate.kind) && time(candidate.firstSeenAt) && Number.isFinite(candidate.bestScore))) fail(`invalid trial ${String(trial?.id)}`)
  }
  return session
}

export type Rate = { k: number; n: number; value: number | null; low: number | null; high: number | null }
/** Wilson 95% interval; small samples get honest, wide intervals. */
export function rate(k: number, n: number): Rate {
  if (!n) return { k, n, value: null, low: null, high: null }
  const z = 1.96, p = k / n, denominator = 1 + z * z / n
  const centre = (p + z * z / (2 * n)) / denominator, spread = z * Math.sqrt(p * (1 - p) / n + z * z / (4 * n * n)) / denominator
  return { k, n, value: p, low: Math.max(0, centre - spread), high: Math.min(1, centre + spread) }
}
export function percentile(values: number[], p: number) {
  if (!values.length) return null
  const sorted = [...values].sort((a, b) => a - b)
  return sorted[Math.min(sorted.length - 1, Math.max(0, Math.ceil(p * sorted.length) - 1))]
}
/** Minimum-edit alignment of recognized tokens against the target sequence. */
export function alignTokens(reference: readonly string[], hypothesis: readonly string[]) {
  const rows = reference.length + 1, columns = hypothesis.length + 1
  const cost = Array.from({ length: rows }, (_, i) => Array.from({ length: columns }, (_, j) => i ? (j ? 0 : i) : j))
  for (let i = 1; i < rows; i++) for (let j = 1; j < columns; j++)
    cost[i][j] = Math.min(cost[i - 1][j] + 1, cost[i][j - 1] + 1, cost[i - 1][j - 1] + (reference[i - 1] === hypothesis[j - 1] ? 0 : 1))
  let i = reference.length, j = hypothesis.length, substitutions = 0, insertions = 0, deletions = 0
  while (i || j) {
    if (i && j && cost[i][j] === cost[i - 1][j - 1] + (reference[i - 1] === hypothesis[j - 1] ? 0 : 1)) { if (reference[i - 1] !== hypothesis[j - 1]) substitutions++; i--; j-- }
    else if (i && cost[i][j] === cost[i - 1][j] + 1) { deletions++; i-- }
    else { insertions++; j-- }
  }
  return { substitutions, insertions, deletions }
}

type Tally = { trials: number; correct: number; wrong: number; signers: Set<string>; independent: Set<string> }
type Outcome = 'correct' | 'wrong' | 'rejected'
const tally = (): Tally => ({ trials: 0, correct: 0, wrong: 0, signers: new Set(), independent: new Set() })
function count(map: Map<string, Tally>, key: string, signer: string, independent: boolean, outcome: Outcome) {
  const entry = map.get(key) ?? tally()
  map.set(key, entry)
  entry.trials++; entry.signers.add(signer)
  if (independent) entry.independent.add(signer)
  if (outcome !== 'rejected') entry[outcome]++
}

function intentTally() {
  return {
    isolated: { trials: 0, correct: 0, wrong: 0, rejected: 0, excluded: 0, variantDiffers: 0, top1: 0, candidateHits: 0, duplicates: 0, extraCommits: 0 },
    sequence: { trials: 0, referenceTokens: 0, substitutions: 0, insertions: 0, deletions: 0 },
    nonSign: { minutes: 0, falseCommits: 0 },
    targets: new Map<string, Tally>(), predicted: new Map<string, number>(), latencies: [] as number[], duringSign: 0,
  }
}
type IntentTally = ReturnType<typeof intentTally>

function intentReport(result: IntentTally) {
  const { isolated, sequence, nonSign } = result
  const perClass = [...new Set([...result.targets.keys(), ...result.predicted.keys()])].sort().map(id => {
    const entry = result.targets.get(id) ?? tally()
    return { id, trials: entry.trials, signers: entry.signers.size, independentSigners: entry.independent.size,
      recall: rate(entry.correct, entry.trials), precision: rate(entry.correct, result.predicted.get(id) ?? 0) }
  })
  const below = (value: Rate, target: number) => value.value !== null && value.value < target
  return {
    isolated: { ...isolated, precision: rate(isolated.correct, isolated.correct + isolated.wrong), coverage: rate(isolated.correct, isolated.trials),
      rejection: rate(isolated.rejected, isolated.trials), top1: rate(isolated.top1, isolated.trials), candidateRecall: rate(isolated.candidateHits, isolated.trials) },
    perClass,
    weakClasses: perClass.filter(entry => below(entry.precision, .95) || below(entry.recall, .8)),
    // The collection manifest's promotion rule: 3+ unseen signers, 15+ trials and precision of at least 0.95.
    promotable: perClass.filter(entry => entry.independentSigners >= 3 && entry.trials >= 15 && entry.precision.value !== null && entry.precision.value >= .95).map(entry => entry.id),
    sequence: { ...sequence, errorRate: sequence.referenceTokens ? (sequence.substitutions + sequence.insertions + sequence.deletions) / sequence.referenceTokens : null },
    latency: { measured: result.latencies.length, duringSign: result.duringSign, p50: percentile(result.latencies, .5), p95: percentile(result.latencies, .95) },
    nonSign: { ...nonSign, perTenMinutes: nonSign.minutes ? nonSign.falseCommits / nonSign.minutes * 10 : null },
  }
}

/** Stage 7 measurements over facilitated sessions. Nothing is averaged away:
 * weak classes, sample counts and per-signer, device and lighting results are reported. */
export function evaluateValidation(sessions: ValidationSession[]) {
  const independent = (session: ValidationSession) => ISL_SIGNERS.includes(session.signer.type) && session.signer.inTrainingData === 'no'
  const unseen = new Set(sessions.filter(independent).map(session => session.signer.id))
  const intents: Record<ValidationIntent, IntentTally> = { words: intentTally(), static: intentTally(), numbers: intentTally() }
  const breakdowns = { signer: new Map<string, Tally>(), signerType: new Map<string, Tally>(), device: new Map<string, Tally>(), lighting: new Map<string, Tally>() }
  for (const session of sessions) for (const trial of session.trials) {
    const result = intents[trial.intent]
    if (trial.block === 'non-sign') {
      if (trial.outcome === 'ok') { result.nonSign.minutes += (trial.endedAt - trial.startedAt) / 60000; result.nonSign.falseCommits += trial.commits.length }
      continue
    }
    if (trial.outcome !== 'ok') {
      if (trial.block === 'isolated') { result.isolated.excluded++; if (trial.outcome === 'variant-differs') result.isolated.variantDiffers++ }
      continue
    }
    const hypothesis = trial.commits.map(commit => commit.canonical)
    if (trial.block === 'sequence') {
      const errors = alignTokens(trial.target, hypothesis), sequence = result.sequence
      sequence.trials++; sequence.referenceTokens += trial.target.length
      sequence.substitutions += errors.substitutions; sequence.insertions += errors.insertions; sequence.deletions += errors.deletions
      continue
    }
    const target = trial.target[0], first = trial.commits[0], isolated = result.isolated
    const outcome: Outcome = !first ? 'rejected' : first.canonical === target ? 'correct' : 'wrong'
    isolated.trials++; isolated[outcome]++
    if (first) result.predicted.set(first.canonical, (result.predicted.get(first.canonical) ?? 0) + 1)
    isolated.extraCommits += Math.max(0, trial.commits.length - 1)
    if (new Set(hypothesis).size < hypothesis.length) isolated.duplicates++
    // The model's top choice: its commit, otherwise its best offered candidate (same source, so comparable).
    if ((first?.canonical ?? [...trial.candidates].sort((a, b) => b.bestScore - a.bestScore)[0]?.id) === target) isolated.top1++
    if (outcome === 'correct' || trial.candidates.some(candidate => candidate.id === target)) isolated.candidateHits++
    if (outcome === 'correct') {
      const release = trial.releases.filter(at => at <= first.at).at(-1)
      if (release === undefined) result.duringSign++
      else result.latencies.push(first.at - release)
    }
    const signer = session.signer.id, seen = independent(session)
    count(result.targets, target, signer, seen, outcome)
    count(breakdowns.signer, signer, signer, seen, outcome)
    count(breakdowns.signerType, session.signer.type, signer, seen, outcome)
    count(breakdowns.device, session.conditions.device || 'unspecified', signer, seen, outcome)
    count(breakdowns.lighting, session.conditions.lighting, signer, seen, outcome)
  }
  const byIntent = { words: intentReport(intents.words), static: intentReport(intents.static), numbers: intentReport(intents.numbers) }
  const eligible = unseen.size >= 3, words = byIntent.words.isolated
  const nonSignMinutes = Object.values(byIntent).reduce((total, entry) => total + entry.nonSign.minutes, 0)
  const falseCommits = Object.values(byIntent).reduce((total, entry) => total + entry.nonSign.falseCommits, 0)
  const latencies = Object.values(intents).flatMap(entry => entry.latencies), p95 = percentile(latencies, .95)
  const status = (enough: boolean, met: boolean) => !enough ? 'insufficient-data' as const : met ? 'met' as const : 'not-met' as const
  return {
    sessions: sessions.length, trials: sessions.reduce((total, session) => total + session.trials.length, 0),
    independence: { unseenIslSigners: unseen.size, eligible,
      message: eligible ? `${unseen.size} unseen ISL signers.` : `Not an independent signer evaluation: ${unseen.size} unseen ISL signer${unseen.size === 1 ? '' : 's'}; at least 3 are required.` },
    byIntent,
    breakdowns: Object.fromEntries(Object.entries(breakdowns).map(([name, map]) => [name, [...map].sort(([a], [b]) => a.localeCompare(b)).map(([key, entry]) => ({
      key, trials: entry.trials, signers: entry.signers.size, precision: rate(entry.correct, entry.correct + entry.wrong), coverage: rate(entry.correct, entry.trials) }))])),
    // Provisional engineering goals from the brief; "met" is a point estimate, never certification.
    targets: [
      { name: 'Word automatic-commit precision >= 95% with coverage >= 80%', status: status(eligible && words.trials >= 50, (words.precision.value ?? 0) >= .95 && (words.coverage.value ?? 0) >= .8),
        detail: `precision ${pct(words.precision)}; coverage ${pct(words.coverage)}` },
      { name: 'At most 1 false commit per 10 minutes of non-sign activity', status: status(eligible && nonSignMinutes >= 10, falseCommits / Math.max(nonSignMinutes, 1e-9) * 10 <= 1),
        detail: `${falseCommits} false commits in ${nonSignMinutes.toFixed(1)} minutes` },
      { name: 'p95 caption latency within 1 s of release', status: status(eligible && latencies.length >= 20, p95 !== null && p95 <= 1000),
        detail: `p95 ${p95 === null ? 'n/a' : `${Math.round(p95)} ms`} over ${latencies.length} measured commits` },
    ],
  }
}
export type ValidationReport = ReturnType<typeof evaluateValidation>

export const pct = (value: Rate) => value.value === null ? 'n/a' : `${(value.value * 100).toFixed(1)}% (95% CI ${(value.low! * 100).toFixed(1)}-${(value.high! * 100).toFixed(1)}%, ${value.k}/${value.n})`
