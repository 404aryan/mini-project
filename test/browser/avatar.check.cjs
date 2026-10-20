// Browser regression check: avatar queue, loading, failure and recovery paths in the real page.
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

// Reads the player's internal refs through the React fiber of its canvas mount.
const readPlayer = () => {
  const mount = document.querySelector('.avatar-canvas')
  if (!mount) return null
  const key = Object.keys(mount).find((name) => name.startsWith('__reactFiber$'))
  for (let fiber = mount[key]; fiber; fiber = fiber.return) {
    const refs = []
    for (let hook = fiber.memoizedState; hook && typeof hook === 'object' && 'next' in hook; hook = hook.next) {
      const state = hook.memoizedState
      if (state && typeof state === 'object' && 'current' in state) refs.push(state.current)
    }
    const runtime = refs.find((value) => value && Array.isArray(value.segments) && Array.isArray(value.animations))
    if (!runtime) continue
    const pending = refs.find((value) => Array.isArray(value) && value.every((entry) => entry && Array.isArray(entry.tokens)))
    return {
      segments: runtime.segments.map((segment) => segment.token),
      frames: runtime.animations.length,
      hasAvatar: Boolean(runtime.avatar),
      pending: (pending || []).map((entry) => ({ tokens: [...entry.tokens], append: entry.append })),
    }
  }
  return null
}

const results = []
const check = (name, ok, detail = '') => { results.push({ name, ok }); console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${detail ? ' — ' + JSON.stringify(detail) : ''}`) }

;(async () => {
  const browser = await chromium.launch(launchOptions())

  // ---------- main context ----------
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } })
  await context.addInitScript(fakeSpeech)
  const page = await context.newPage()
  const errors = []
  page.on('pageerror', (error) => errors.push(error.message))
  page.on('console', (message) => { if (message.type() === 'error' && !/Failed to load resource/.test(message.text())) errors.push(message.text()) })

  // The GLB can be held, failed or served normally per test.
  let glbMode = 'pass'
  let releaseHeld = []
  await page.route('**/models/ybot.glb', async (route) => {
    if (glbMode === 'fail') return route.abort('failed')
    if (glbMode === 'hold') await new Promise((resolve) => releaseHeld.push(resolve))
    return route.continue()
  })
  const release = () => { glbMode = 'pass'; const held = releaseHeld; releaseHeld = []; held.forEach((resolve) => resolve()) }

  await page.goto(BASE, { waitUntil: 'networkidle' })
  await page.locator('#try-it').scrollIntoViewIfNeeded()
  const badge = () => page.textContent('.canvas-badge')
  const waitBadge = (pattern, timeout = 30000) => page.waitForFunction((source) => new RegExp(source).test(document.querySelector('.canvas-badge')?.textContent || ''), pattern.source, { timeout }).then(() => true, () => false)
  check('avatar loads to ready', await waitBadge(/ready/))
  await page.click('.engine-selector button:has-text("Offline")')
  const input = page.locator('.translator-controls input')
  const status = () => page.textContent('.terminal-footer-live > span[aria-live]')
  const play = async (text) => { await input.fill(text); await page.click('.translator-controls .translate-submit') }
  const chooseModel = (name) => page.click(`.avatar-selector button:has-text("${name}")`)

  // E028/E029/E030: signs that froze, skipped or leaked before play through.
  await play('confused hello')
  check('CONFUSED HELLO starts signing', await waitBadge(/signing/, 3000))
  check('CONFUSED HELLO finishes', await waitBadge(/ready/, 30000))
  await play('time room walk make')
  check('TIME ROOM WALK MAKE finishes', await waitBadge(/signing/, 3000) && await waitBadge(/ready/, 45000))

  // E032: live fragments that arrive while the avatar loads all play, in order.
  glbMode = 'hold'
  await chooseModel('Human')
  check('model switch shows loading', await waitBadge(/loading/, 3000))
  await page.click('.translator-controls button.live-translation:not(.speech-language)')
  await page.waitForTimeout(80)
  const emit = (segments) => page.evaluate((s) => window.__speech.instances.at(-1).emit(s), segments)
  await emit([['hello', true]])
  await page.waitForTimeout(30)
  await emit([['hello', true], [' sorry', true]])
  await page.waitForTimeout(30)
  await emit([['hello', true], [' sorry', true], [' water', true]])
  await page.waitForTimeout(150)
  const whileLoading = await page.evaluate(readPlayer)
  // The switch first replays the finished phrase, then the three fragments queue behind it.
  const liveWaiting = whileLoading ? whileLoading.pending.filter((entry) => entry.append).map((entry) => entry.tokens.join(' ')) : []
  check('three live fragments wait while loading', liveWaiting.join('|') === 'HELLO|SORRY|WATER', whileLoading)
  release()
  check('queued fragments play after load', await waitBadge(/signing/, 15000))
  const afterLoad = await page.evaluate(readPlayer)
  check('all fragments reach the sign queue in order', afterLoad && afterLoad.pending.length === 0 && ['HELLO', 'SORRY', 'WATER'].every((token, index, all) => afterLoad.segments.indexOf(token) >= 0 && (index === 0 || afterLoad.segments.indexOf(token) > afterLoad.segments.indexOf(all[index - 1]))), afterLoad)
  await page.click('.translator-controls button.live-translation:not(.speech-language)')
  check('live run finishes to ready', await waitBadge(/ready/, 30000))

  // Model switch mid-sign resumes the unfinished signs on the new avatar.
  await play('hello thank you sorry please')
  await waitBadge(/signing/, 3000)
  await page.waitForTimeout(400)
  await chooseModel('Default')
  check('switch mid-sign resumes signing on new avatar', await waitBadge(/signing/, 15000) && await waitBadge(/ready/, 45000))

  // E033: Reset while loading cancels the waiting phrase.
  glbMode = 'hold'
  await chooseModel('Human')
  await waitBadge(/loading/, 3000)
  await play('hello')
  await page.waitForTimeout(100)
  const queued = await page.evaluate(readPlayer)
  await page.locator('[aria-label="Reset avatar"]:visible').first().click()
  await page.waitForTimeout(100)
  const afterReset = await page.evaluate(readPlayer)
  release()
  check('phrase waits during loading', queued && queued.pending.length === 1, queued)
  check('reset during loading clears the waiting phrase', afterReset && afterReset.pending.length === 0, afterReset)
  check('after load nothing plays', await waitBadge(/ready/, 15000) && (await page.evaluate(readPlayer)).segments.length === 0)

  // E034: load failure shows an error with a working Retry.
  glbMode = 'fail'
  await chooseModel('Default')
  check('load failure reports error', await waitBadge(/error/, 15000), await badge())
  const alert = page.locator('.avatar-canvas-shell [role="alert"]')
  check('failure notice with Retry is shown', await alert.isVisible() && /could not be loaded/.test(await alert.textContent()))
  check('footer says avatar unavailable', /avatar unavailable/.test(await status()), await status())
  await play('hello')
  await page.waitForTimeout(100)
  check('request during failure keeps error state', /error/.test(await badge()))
  await page.screenshot({ path: `${OUT}/phase3-load-error.png` })
  glbMode = 'pass'
  await alert.locator('button').click()
  check('retry loads avatar and plays waiting phrase', await waitBadge(/signing/, 15000) && await waitBadge(/ready/, 30000))
  check('retry removes notice', !(await alert.isVisible()))

  // E037: repeated switches keep a single canvas.
  for (const name of ['Human', 'Default', 'Human', 'Default']) { await chooseModel(name); await waitBadge(/ready/, 15000) }
  check('one canvas after repeated switches', (await page.locator('.avatar-canvas canvas').count()) === 1)

  // Reset reloads the whole avatar and does not replay what was playing.
  await play('hello thank you sorry please')
  await waitBadge(/signing/, 3000)
  await page.evaluate(() => { document.querySelector('.avatar-canvas canvas').dataset.marker = 'old' })
  await page.locator('[aria-label="Reset avatar"]:visible').first().click()
  const reloaded = await waitBadge(/loading/, 3000) && await waitBadge(/ready/, 15000)
  await page.waitForTimeout(1000)
  check('Reset reloads the avatar without replaying', reloaded && await page.evaluate(() => document.querySelector('.avatar-canvas canvas')?.dataset.marker !== 'old') && /ready/.test(await badge()), await badge())
  check('no page errors', errors.length === 0, errors)
  await context.close()

  // ---------- E035: no WebGL ----------
  const noGl = await browser.newContext({ viewport: { width: 390, height: 844 } })
  await noGl.addInitScript(() => {
    const original = HTMLCanvasElement.prototype.getContext
    HTMLCanvasElement.prototype.getContext = function (type, ...rest) {
      return /webgl/.test(type) ? null : original.call(this, type, ...rest)
    }
  })
  const glPage = await noGl.newPage()
  const glErrors = []
  glPage.on('pageerror', (error) => glErrors.push(error.message))
  await glPage.goto(BASE, { waitUntil: 'networkidle' })
  await glPage.locator('#try-it').scrollIntoViewIfNeeded()
  const glState = await glPage.waitForFunction(() => /error/.test(document.querySelector('.canvas-badge')?.textContent || ''), null, { timeout: 15000 }).then(() => true, () => false)
  check('no WebGL reports error state', glState)
  const glAlert = glPage.locator('.avatar-canvas-shell [role="alert"]')
  check('no WebGL shows recoverable notice', await glAlert.isVisible() && /WebGL/.test(await glAlert.textContent()))
  check('page stays usable without WebGL', await glPage.locator('.translator-controls input').isEnabled())
  await glAlert.scrollIntoViewIfNeeded()
  await glPage.screenshot({ path: `${OUT}/phase3-no-webgl-mobile.png` })
  check('no uncaught errors without WebGL', glErrors.length === 0, glErrors)

  await browser.close()
  const failed = results.filter((r) => !r.ok)
  console.log(`\n${results.length - failed.length}/${results.length} passed`)
  process.exit(failed.length ? 1 : 0)
})().catch((error) => { console.error(error); process.exit(2) })
