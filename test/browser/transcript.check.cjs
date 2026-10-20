// Transcript correction, sentence review and privacy checks with a fake camera,
// stubbed speech and a mocked sentence service. Not an ISL accuracy test.
const { chromium, launchOptions, BASE, OUT } = require('./browser.cjs')
const path = require('node:path')
const fs = require('node:fs')
const checks = []
const check = (name, ok, detail) => { checks.push(ok); console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${detail ? ' ' + JSON.stringify(detail) : ''}`) }

;(async () => {
  fs.mkdirSync(OUT, { recursive: true })
  const browser = await chromium.launch(launchOptions({ args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream'] }))
  const context = await browser.newContext({ viewport: { width: 1366, height: 768 }, permissions: ['camera'] })
  await context.addInitScript(() => {
    window.__spoken = []; window.__cancels = 0
    speechSynthesis.getVoices = () => []
    speechSynthesis.speak = utterance => { window.__spoken.push(utterance.text); setTimeout(() => utterance.onstart?.(), 0) }
    speechSynthesis.cancel = () => { window.__cancels++ }
  })
  let reply = { text: 'I need two tickets.', engine: 'ai' }
  const bodies = []
  await context.route('**/api/sign/sentence', route => { bodies.push(route.request().postDataJSON()); return route.fulfill({ json: reply }) })
  const page = await context.newPage(), errors = [], requests = []
  page.on('pageerror', error => errors.push(error.message))
  page.on('request', request => requests.push({ method: request.method(), url: request.url() }))
  await page.goto(`${BASE}/?mode=sign`, { waitUntil: 'networkidle' })
  await page.locator('.sign-viewfinder').waitFor({ state: 'visible' })
  await page.locator('.sign-camera-button').click()
  await page.waitForFunction(() => document.querySelector('.sign-stage.is-live') && document.querySelector('.sign-camera-video').srcObject, null, { timeout: 30000 })
  const liveFrom = requests.length
  await page.waitForTimeout(4000)
  const origin = new URL(BASE).origin
  const during = requests.slice(liveFrom)
  check('live camera sends no frames or landmarks anywhere', during.every(request => request.method === 'GET' && (request.url.startsWith(origin) || /^(data|blob):/.test(request.url))), during.filter(request => request.method !== 'GET' || !request.url.startsWith(origin)))
  check('no cross-origin requests while signing', requests.every(request => request.url.startsWith(origin) || /^(data|blob):/.test(request.url)))

  const raw = () => page.locator('.sign-raw-line').evaluate(line => line.textContent.replaceAll('\u00a0', ' '))
  // Removed letters animate out; with live CPU tracking in software-rendered headless
  // Chromium that took about 4 s (about 1 s without the camera), so allow 8 s.
  const settled = expected => page.waitForFunction(text => document.querySelector('.sign-raw-line').textContent.replaceAll('\u00a0', ' ') === text, expected, { timeout: 8000 }).then(() => true, () => false)
  await page.getByRole('button', { name: 'Edit text', exact: true }).click()
  await page.getByRole('textbox', { name: 'Edit raw transcript' }).fill('I NEED 2 TICKET')
  await page.getByRole('button', { name: 'Edit text', exact: true }).click()
  check('typed correction is one undo step', await page.getByRole('button', { name: 'Undo text edit', exact: true }).isEnabled())
  await page.getByRole('button', { name: 'Speak', exact: true }).click()
  check('Speak reads the raw transcript', await page.evaluate(() => window.__spoken.at(-1)) === 'I NEED 2 TICKET')
  await page.getByRole('button', { name: 'Stop', exact: true }).click()

  await page.locator('.sign-output-settings > summary').click()
  await page.getByRole('button', { name: 'Make it a sentence' }).click()
  await page.locator('.sign-cleaned').waitFor()
  const request = bodies.at(-1)
  check('sentence cleanup sends only text, language and protected terms', JSON.stringify(Object.keys(request).sort()) === '["keep","language","tokens"]' && request.tokens.join('') === 'I NEED 2 TICKET', request)
  check('only the explicit sentence request is a POST', requests.filter(entry => entry.method !== 'GET').map(entry => new URL(entry.url).pathname).join() === '/api/sign/sentence')
  check('suggestion that changes a quantity is flagged', (await page.locator('.sign-cleaned-warning').textContent()).includes('changes or drops the number 2'))
  check('flagged suggestion cannot be spoken or copied', await page.getByRole('button', { name: 'Speak suggestion' }).isDisabled() && await page.getByRole('button', { name: 'Copy suggestion' }).isDisabled())
  check('suggestion never replaces the transcript', await raw() === 'I NEED 2 TICKET')
  await page.screenshot({ path: path.join(OUT, 'transcript-flagged-suggestion.png') })

  reply = { text: 'I need 2 tickets.', engine: 'ai' }
  await page.getByRole('button', { name: 'Make it a sentence' }).click()
  await page.waitForFunction(() => document.querySelector('.sign-cleaned p')?.textContent === 'I need 2 tickets.')
  check('faithful suggestion is labelled and separate', (await page.locator('.sign-cleaned > span').textContent()).includes('Suggested English sentence · AI · separate from your transcript') && await page.locator('.sign-cleaned-warning').count() === 0)
  await page.getByRole('button', { name: 'Speak suggestion' }).click()
  check('speaking a suggestion needs its own deliberate choice', await page.evaluate(() => window.__spoken.at(-1)) === 'I need 2 tickets.' && await raw() === 'I NEED 2 TICKET')
  await page.screenshot({ path: path.join(OUT, 'transcript-suggestion.png') })

  await page.getByRole('button', { name: 'Backspace', exact: true }).click()
  check('editing the transcript retires its suggestion', await settled('I NEED 2 TICKE') && await page.locator('.sign-cleaned').count() === 0)
  await page.getByRole('button', { name: 'Clear' }).click()
  check('clear empties the transcript', await settled('Your confirmed signs will appear here.'))
  await page.getByRole('button', { name: 'Undo clear', exact: true }).click()
  check('undo restores cleared text', await settled('I NEED 2 TICKE'))
  check('undo is announced politely', await page.locator('.sign-sr-only[aria-live="polite"]').textContent() === 'Undid clear')
  await page.getByRole('button', { name: 'Undo backspace', exact: true }).click()
  check('undo restores a deleted character', await settled('I NEED 2 TICKET'))
  check('transcript feedback is not a second live region for tracking hints', await page.locator('.sign-transcript-feedback').getAttribute('role') === null)

  await page.getByRole('button', { name: 'Speak', exact: true }).click()
  await page.evaluate(() => { window.__stream = document.querySelector('.sign-camera-video').srcObject; window.__cancels = 0 })
  await page.getByRole('button', { name: 'Close Sign to Text' }).click()
  await page.waitForTimeout(400)
  check('leaving the workspace stops speech and the camera', await page.evaluate(() => window.__cancels > 0 && window.__stream.getTracks().every(track => track.readyState === 'ended')))
  check('no browser exceptions', errors.length === 0, errors)
  await browser.close()
  console.log(`${checks.filter(Boolean).length}/${checks.length} transcript checks passed`)
  process.exit(checks.every(Boolean) ? 0 : 1)
})().catch(error => { console.error(error); process.exit(2) })
