// Runs every browser regression check against a running app:
//   npm run build && npm start   (in another terminal; start it with an empty
//   GEMINI_API_KEY so no paid AI requests are made)
//   npm run test:browser -- http://localhost:3000
const { spawnSync } = require('node:child_process')
const path = require('node:path')

const checks = ['landing-account-speech', 'translation', 'avatar', 'playback-controls', 'sign-stage', 'camera-workspace', 'transcript', 'validation', 'signer-tracking', 'word-studio']
const args = process.argv.slice(2)
let failed = 0
for (const name of checks) {
  console.log(`\n== ${name}`)
  const run = spawnSync(process.execPath, [path.join(__dirname, `${name}.check.cjs`), ...args], { stdio: 'inherit' })
  if (run.status !== 0) failed++
}
console.log(failed ? `\n${failed} browser check file(s) failed` : '\nAll browser checks passed')
process.exit(failed ? 1 : 0)
