// Reports Stage 7 metrics from facilitated signer sessions exported by /sign/validate.
//   node scripts/evaluate-signer-validation.cjs <session.json | folder>... [--json report.json]
// Sessions hold recognized outputs and timings only. Results describe these
// signers, devices and conditions; they are not ISL certification.
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm'), ts = require('typescript')
const validation = {}
vm.runInNewContext(ts.transpileModule(fs.readFileSync(path.join(__dirname, '../lib/sign/validation.ts'), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText, { exports: validation, require: () => ({}), Error, Math, JSON })
const { parseValidationSession, evaluateValidation, pct } = validation

const args = process.argv.slice(2), jsonAt = args.indexOf('--json')
const output = jsonAt >= 0 ? args[jsonAt + 1] : null
const inputs = args.filter((_, index) => jsonAt < 0 || (index !== jsonAt && index !== jsonAt + 1))
if (!inputs.length || (jsonAt >= 0 && !output)) {
  console.error('Usage: node scripts/evaluate-signer-validation.cjs <session.json | folder>... [--json report.json]')
  process.exit(2)
}
const files = inputs.flatMap(input => fs.statSync(input).isDirectory()
  ? fs.readdirSync(input).filter(name => name.endsWith('.json')).sort().map(name => path.join(input, name)) : [input])
const sessions = new Map(), invalid = []
for (const file of files) {
  try {
    const session = parseValidationSession(JSON.parse(fs.readFileSync(file, 'utf8')))
    // The same session exported twice counts once: keep the export with more trials.
    const known = sessions.get(session.id)
    if (!known || known.trials.length < session.trials.length) sessions.set(session.id, session)
  } catch (error) { invalid.push(`${file}: ${error.message}`) }
}
invalid.forEach(line => console.error(`Skipped ${line}`))
if (!sessions.size) { console.error('No valid validation sessions.'); process.exit(1) }

const report = evaluateValidation([...sessions.values()])
const lines = [`${report.sessions} sessions, ${report.trials} trials. ${report.independence.message}`]
for (const [intent, title] of [['words', 'Words'], ['static', 'Spell'], ['numbers', 'Numbers']]) {
  const result = report.byIntent[intent], isolated = result.isolated
  if (!isolated.trials && !result.sequence.trials && !result.nonSign.minutes) continue
  lines.push('', `== ${title}`)
  if (isolated.trials || isolated.excluded) {
    lines.push(`Isolated trials: ${isolated.trials} counted, ${isolated.excluded} excluded (${isolated.variantDiffers} different variant)`,
      `  automatic-commit precision ${pct(isolated.precision)}`, `  correct-output coverage    ${pct(isolated.coverage)}`,
      `  rejected                   ${pct(isolated.rejection)}`, `  top choice correct         ${pct(isolated.top1)}`,
      `  target offered or added    ${pct(isolated.candidateRecall)}`,
      `  trials with duplicate commits ${isolated.duplicates}; extra commits ${isolated.extraCommits}`)
    const recall = result.perClass.filter(entry => entry.recall.n), macro = list => list.length ? (list.reduce((sum, value) => sum + value, 0) / list.length * 100).toFixed(1) + '%' : 'n/a'
    lines.push(`  macro recall ${macro(recall.map(entry => entry.recall.value))} over ${recall.length} classes; macro precision ${macro(result.perClass.filter(entry => entry.precision.n).map(entry => entry.precision.value))}`)
    lines.push('  class                trials signers unseen  recall          precision')
    for (const entry of result.perClass) lines.push(`  ${entry.id.padEnd(20)} ${String(entry.trials).padStart(6)} ${String(entry.signers).padStart(7)} ${String(entry.independentSigners).padStart(6)}  ${`${entry.recall.k}/${entry.recall.n}`.padEnd(15)} ${entry.precision.k}/${entry.precision.n}`)
    lines.push(`  below 95% precision or 80% recall: ${result.weakClasses.map(entry => entry.id).join(', ') || 'none'}`,
      `  meets the promotion rule (3+ unseen signers, 15+ trials, precision >= 95%): ${result.promotable.join(', ') || 'none'}`)
    lines.push(`  latency after release: ${result.latency.p50 === null ? 'n/a' : `p50 ${Math.round(result.latency.p50)} ms, p95 ${Math.round(result.latency.p95)} ms`} over ${result.latency.measured} commits; ${result.latency.duringSign} committed before release`)
  }
  if (result.sequence.trials) lines.push(`Sequences: ${result.sequence.trials}; error rate ${(result.sequence.errorRate * 100).toFixed(1)}% (substitutions ${result.sequence.substitutions}, insertions ${result.sequence.insertions}, deletions ${result.sequence.deletions}, ${result.sequence.referenceTokens} reference tokens)`)
  if (result.nonSign.minutes) lines.push(`Non-sign activity: ${result.nonSign.falseCommits} false commits in ${result.nonSign.minutes.toFixed(1)} minutes (${result.nonSign.perTenMinutes.toFixed(2)} per 10 minutes)`)
}
for (const [name, rows] of Object.entries(report.breakdowns)) {
  if (!rows.length) continue
  lines.push('', `== By ${name}`)
  for (const row of rows) lines.push(`  ${row.key.padEnd(28)} ${String(row.trials).padStart(5)} trials, ${row.signers} signers · precision ${pct(row.precision)} · coverage ${pct(row.coverage)}`)
}
lines.push('', '== Provisional targets (point estimates; see the intervals)')
for (const target of report.targets) lines.push(`  [${target.status}] ${target.name}: ${target.detail}`)
lines.push('', 'These results describe the listed signers, devices and conditions only. They are not ISL certification.')
console.log(lines.join('\n'))
if (output) fs.writeFileSync(output, JSON.stringify(report, null, 2))
process.exit(invalid.length ? 1 : 0)
