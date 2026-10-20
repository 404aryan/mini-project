// Browser regression check: offline translation path end to end in the real page.
const { chromium, launchOptions, BASE, OUT } = require('./browser.cjs')

const fakeSpeech = () => {
  window.__speech = { instances: [], langs: [] }
  class FakeRecognition {
    constructor() { window.__speech.instances.push(this); this.running = false }
    start() { this.running = true; window.__speech.langs.push(this.lang); setTimeout(() => this.onstart && this.onstart(), 10) }
    stop() { if (!this.running) return; this.running = false; setTimeout(() => this.onend && this.onend(), 10) }
    abort() { this.stop() }
    emit(segments) { this.onresult && this.onresult({ resultIndex: 0, results: segments.map(([t, f]) => Object.assign([{ transcript: t }], { isFinal: f })) }) }
  }
  window.SpeechRecognition = FakeRecognition
}

const results = []
const check = (name, ok, detail = '') => { results.push({ name, ok }); console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${detail ? ' — ' + detail : ''}`) }

;(async () => {
  const browser = await chromium.launch(launchOptions())
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } })
  await context.addInitScript(fakeSpeech)
  const page = await context.newPage()
  const errors = []
  page.on('pageerror', (error) => errors.push(error.message))
  page.on('console', (message) => { if (message.type() === 'error' && !/Failed to load resource/.test(message.text())) errors.push(message.text()) })
  await page.goto(BASE, { waitUntil: 'networkidle' })
  await page.locator('#try-it').scrollIntoViewIfNeeded()
  await page.waitForFunction(() => /ready/.test(document.querySelector('.canvas-badge')?.textContent || ''), null, { timeout: 20000 })

  // Offline engine so no network/AI is involved.
  await page.click('.engine-selector button:has-text("Offline")')
  const input = page.locator('.translator-controls input')
  const status = () => page.textContent('.terminal-footer-live > span[aria-live]')
  const badge = () => page.textContent('.canvas-badge')

  async function play(text) {
    await input.fill(text)
    await page.click('.translator-controls .translate-submit')
    await page.waitForTimeout(150)
    const started = /signing/.test(await badge())
    await page.waitForFunction(() => /ready/.test(document.querySelector('.canvas-badge')?.textContent || ''), null, { timeout: 60000 }).catch(() => {})
    return { started, finished: /ready/.test(await badge()), status: await status() }
  }

  for (const text of ['call 112', 'A M I T', 'मुझे पानी चाहिए', 'B B', 'I do not know', 'James']) {
    const run = await play(text)
    check(`"${text}" plays to completion`, run.started && run.finished, run.status)
  }

  await page.screenshot({ path: `${OUT}/phase2-digits.png` })

  const unsupported = await play('வணக்கம்')
  check('unsupported script is reported', /Could not sign/.test(unsupported.status) && !unsupported.started, unsupported.status)

  // Voice language toggle reaches the recognizer.
  const lang = page.locator('.translator-controls .speech-language')
  check('language toggle defaults to EN', (await lang.textContent()).trim() === 'EN')
  await lang.click()
  check('language toggle switches to HI', (await lang.textContent()).trim() === 'HI' && /Hindi/.test(await lang.getAttribute('aria-label')))
  await page.click('.translator-controls .voice-input:not(.translate-submit)')
  await page.waitForTimeout(60)
  check('recognizer started in hi-IN', (await page.evaluate(() => window.__speech.langs.at(-1))) === 'hi-IN')
  await page.evaluate(() => window.__speech.instances.at(-1).emit([['नमस्ते दोस्त', true]]))
  check('Hindi transcript shown', (await input.inputValue()) === 'नमस्ते दोस्त')
  await page.click('.translator-controls .voice-input:not(.translate-submit)')
  await page.waitForTimeout(60)
  await page.setViewportSize({ width: 390, height: 844 })
  await page.locator('.translator-controls').scrollIntoViewIfNeeded()
  await page.screenshot({ path: `${OUT}/phase2-mobile.png` })

  check('no page errors', errors.length === 0, errors.join(' | '))
  await browser.close()
  const failed = results.filter((r) => !r.ok)
  console.log(`\n${results.length - failed.length}/${results.length} passed`)
  process.exit(failed.length ? 1 : 0)
})().catch((error) => { console.error(error); process.exit(2) })
