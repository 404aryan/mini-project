// Browser regression check against the local production server.
const { chromium, launchOptions, BASE, OUT } = require('./browser.cjs')

const fakeSpeech = () => {
  window.__speech = { instances: [], starts: 0, stops: 0, aborts: 0 }
  class FakeRecognition {
    constructor() { window.__speech.instances.push(this); this.running = false }
    start() {
      if (this.running) throw new DOMException('already started', 'InvalidStateError')
      this.running = true; window.__speech.starts++
      setTimeout(() => this.onstart && this.onstart(), 10)
    }
    stop() { window.__speech.stops++; if (!this.running) return; this.running = false; setTimeout(() => this.onend && this.onend(), 10) }
    abort() { window.__speech.aborts++; if (!this.running) return; this.running = false; setTimeout(() => { this.onerror && this.onerror({ error: 'aborted' }); this.onend && this.onend() }, 5) }
    emit(segments) { this.onresult && this.onresult({ resultIndex: 0, results: segments.map(([t, f]) => Object.assign([{ transcript: t }], { isFinal: f })) }) }
    serviceEnd() { this.running = false; this.onend && this.onend() }
    fail(code) { this.onerror && this.onerror({ error: code }); this.running = false; this.onend && this.onend() }
  }
  window.SpeechRecognition = FakeRecognition
}

const results = []
const check = (name, ok, detail = '') => { results.push({ name, ok, detail }); console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${detail ? ' — ' + detail : ''}`) }

;(async () => {
  const browser = await chromium.launch(launchOptions())
  const context = await browser.newContext({ viewport: { width: 1280, height: 860 } })
  await context.addInitScript(fakeSpeech)
  const page = await context.newPage()
  const errors = []
  page.on('pageerror', (error) => errors.push(error.message))
  await page.goto(BASE, { waitUntil: 'networkidle' })

  // Fonts (E007)
  const font = await page.evaluate(async () => {
    await document.fonts.ready
    const family = getComputedStyle(document.body).fontFamily
    const heading = getComputedStyle(document.querySelector('h1')).fontFamily
    return { family, heading, loaded: [...document.fonts].filter((f) => f.status === 'loaded').map((f) => f.family) }
  })
  check('DM Sans loaded via next/font', font.loaded.some((f) => /DM Sans/i.test(f)), font.family)
  check('DM Serif Display loaded via next/font', font.loaded.some((f) => /DM Serif/i.test(f)), font.heading)
  await page.screenshot({ path: `${OUT}/phase1-desktop.png` })

  // Dialog focus management (E003, E004)
  const signUp = page.locator('.nav-cta')
  await signUp.click()
  await page.waitForSelector('.auth-modal')
  check('focus moves into dialog', await page.evaluate(() => document.activeElement?.getAttribute('name') === 'name'))
  check('page and dock inert behind dialog', await page.evaluate(() => document.querySelector('main').inert && document.querySelector('.mode-dock').closest('[inert]') !== null))
  let trapped = true
  for (let i = 0; i < 9; i += 1) {
    await page.keyboard.press('Tab')
    trapped = trapped && await page.evaluate(() => !!document.activeElement?.closest('.auth-modal'))
  }
  for (let i = 0; i < 4; i += 1) {
    await page.keyboard.press('Shift+Tab')
    trapped = trapped && await page.evaluate(() => !!document.activeElement?.closest('.auth-modal'))
  }
  check('Tab and Shift+Tab stay in dialog', trapped)
  const backdropZ = await page.evaluate(() => Number(getComputedStyle(document.querySelector('.auth-backdrop')).zIndex))
  const dockZ = await page.evaluate(() => Number(getComputedStyle(document.querySelector('.mode-dock')).zIndex))
  check('backdrop above dock', backdropZ > dockZ, `${backdropZ} vs ${dockZ}`)
  await page.keyboard.press('Escape')
  check('Escape closes account dialog', await page.locator('.auth-modal').waitFor({ state: 'detached', timeout: 3000 }).then(() => true, () => false))
  check('focus returns to opener', await page.evaluate(() => document.activeElement?.classList.contains('nav-cta')))

  // Local profile verification (E001)
  await signUp.click()
  await page.fill('input[name=name]', 'Asha')
  await page.fill('input[name=email]', 'asha@example.com')
  await page.fill('input[name=password]', 'secret12')
  await page.click('.auth-submit')
  await page.waitForSelector('.account-button')
  check('sign up creates local profile', (await page.textContent('.account-button')).includes('Asha'))
  check('password not stored in plain text', await page.evaluate(() => !localStorage.getItem('yap-render-profiles').includes('secret12')))
  await page.click('.account-button')
  await page.click('.account-dropdown button:has-text("Sign out")')
  await page.click('.auth-link')
  await page.fill('input[name=email]', 'asha@example.com')
  await page.fill('input[name=password]', 'wrongpass')
  await page.click('.auth-submit')
  await page.waitForSelector('.auth-error')
  check('wrong password rejected', (await page.textContent('.auth-error')).includes('does not match'))
  await page.fill('input[name=password]', 'secret12')
  await page.click('.auth-submit')
  await page.waitForSelector('.account-button')
  check('correct password signs in', (await page.textContent('.account-button')).includes('Asha'))
  await page.click('.account-button')
  await page.click('.account-dropdown button:has-text("Dashboard")')
  await page.waitForSelector('.dashboard-modal')
  await page.keyboard.press('Escape')
  check('Escape closes dashboard', await page.locator('.dashboard-modal').waitFor({ state: 'detached', timeout: 3000 }).then(() => true, () => false))

  // Translate button (E006)
  await page.locator('#try-it').scrollIntoViewIfNeeded()
  const input = page.locator('.translator-controls input')
  await input.fill('')
  check('Play disabled when empty', await page.locator('.translator-controls .translate-submit').isDisabled())
  await input.fill('hello')
  const requestsBefore = await page.evaluate(() => performance.getEntriesByType('resource').filter((e) => e.name.includes('/api/translate-isl')).length)
  await page.click('.translator-controls .translate-submit')
  await page.waitForFunction((before) => performance.getEntriesByType('resource').filter((e) => e.name.includes('/api/translate-isl')).length > before, requestsBefore, { timeout: 5000 }).catch(() => {})
  await page.waitForFunction(() => !document.querySelector('.engine-status')?.textContent?.includes('translating'), null, { timeout: 6000 })
  check('Play button runs a translation', await page.evaluate((before) => performance.getEntriesByType('resource').filter((e) => e.name.includes('/api/translate-isl')).length > before, requestsBefore), await page.textContent('.engine-status'))

  // Speech (E009-E015)
  const rec = () => page.evaluate(() => ({ ...window.__speech, instances: undefined }))
  const live = page.locator('.translator-controls .live-translation:not(.speech-language)')
  const voice = page.locator('.translator-controls .voice-input:not(.translate-submit)')
  await live.click()
  await page.waitForTimeout(60)
  await page.evaluate(() => window.__speech.instances.at(-1).emit([['hello', true], ['world', true]]))
  check('segments joined with space', await input.inputValue() === 'hello world', await input.inputValue())
  check('quick phrase/live shows real engine', (await page.textContent('.engine-status')).includes('live'), await page.textContent('.engine-status'))
  let before = (await rec()).starts
  await voice.click()
  await page.waitForTimeout(600)
  check('Stop voice in Live ends capture', (await rec()).starts === before && !(await live.getAttribute('class')).includes('is-active'))

  await live.click()
  await page.waitForTimeout(60)
  before = (await rec()).starts
  // End the session and press Stop inside the 220 ms restart gap.
  await page.evaluate(() => { window.__speech.instances.at(-1).serviceEnd(); document.querySelector('.terminal-footer-live .terminal-stop').click() })
  await page.waitForTimeout(700)
  check('Stop during restart gap prevents restart', (await rec()).starts === before)

  await live.click()
  await page.waitForTimeout(60)
  await page.evaluate(() => window.__speech.instances.at(-1).emit([['good morning', true]]))
  before = (await rec()).starts
  await page.evaluate(() => window.__speech.instances.at(-1).serviceEnd())
  await page.waitForTimeout(500)
  check('live auto-restarts after service end', (await rec()).starts === before + 1)
  await page.evaluate(() => window.__speech.instances.at(-1).emit([['how are you', false]]))
  check('history kept across restart', await input.inputValue() === 'good morning how are you', await input.inputValue())

  before = (await rec()).starts
  await page.evaluate(() => window.__speech.instances.at(-1).fail('not-allowed'))
  await page.waitForTimeout(900)
  const footer = await page.textContent('.terminal-footer-live > span[aria-live]')
  check('terminal error explained, no retry', (await rec()).starts === before && footer.includes('Microphone access is blocked'), footer)

  before = (await rec()).starts
  await voice.click()
  await voice.click({ delay: 0 })
  await page.waitForTimeout(100)
  check('double click starts once', (await rec()).starts === before + 1)
  await voice.click()
  await page.waitForTimeout(100)

  // Storage corruption (E002)
  await page.evaluate(() => localStorage.setItem('yap-render-account', 'invalid-json'))
  await page.reload({ waitUntil: 'networkidle' })
  check('corrupt saved account does not crash', await page.locator('.auth-link').count() === 1)

  // Short viewport (E005)
  await page.setViewportSize({ width: 390, height: 420 })
  await page.evaluate(() => document.querySelector('.menu-toggle')?.click())
  await page.locator('.auth-link').click()
  await page.waitForSelector('.auth-modal')
  await page.waitForTimeout(700) // let the dialog finish springing into place
  const scroll = await page.evaluate(() => { const m = document.querySelector('.auth-modal'); const s = getComputedStyle(m); return { max: s.maxHeight, overflow: s.overflowY, fits: m.getBoundingClientRect().bottom <= innerHeight + 1, scrollable: m.scrollHeight > m.clientHeight } })
  check('dialog fits short viewport and scrolls', scroll.fits && scroll.overflow === 'auto' && scroll.scrollable, JSON.stringify(scroll))
  await page.keyboard.press('Escape')
  await page.setViewportSize({ width: 390, height: 844 })
  await page.locator('#try-it').scrollIntoViewIfNeeded()
  await page.screenshot({ path: `${OUT}/phase1-mobile.png` })

  check('no page errors', errors.length === 0, errors.join(' | '))
  await browser.close()
  const failed = results.filter((r) => !r.ok)
  console.log(`\n${results.length - failed.length}/${results.length} passed`)
  process.exit(failed.length ? 1 : 0)
})().catch((error) => { console.error(error); process.exit(2) })
