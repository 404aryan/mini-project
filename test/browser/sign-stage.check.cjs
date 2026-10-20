// Browser regression check: sign stage keyboard order, recognizer history sync, fake-camera preview.
const { chromium, launchOptions, BASE, OUT } = require('./browser.cjs')

const results = []
const check = (name, ok, detail = '') => { results.push({ name, ok }); console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${detail ? ' — ' + JSON.stringify(detail) : ''}`) }

;(async () => {
  const browser = await chromium.launch(launchOptions({ args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream'] }))
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 }, permissions: ['camera'] })
  const page = await context.newPage()
  const errors = []
  page.on('pageerror', (error) => errors.push(error.message))
  page.on('console', (message) => { if (message.type() === 'error' && !/Failed to load resource|TensorFlow Lite XNNPACK/.test(message.text())) errors.push(message.text()) })

  // E040: Back/Forward to an entry with another recognizer updates the stage.
  await page.goto(`${BASE}/?mode=sign&recognizer=words`, { waitUntil: 'networkidle' })
  const wordsButton = page.locator('.sign-recognition-modes button', { hasText: 'Words' })
  const lettersButton = page.locator('.sign-recognition-modes button', { hasText: 'Letters' })
  await wordsButton.waitFor({ state: 'visible', timeout: 20000 })
  check('deep link opens Words recognizer', (await wordsButton.getAttribute('aria-pressed')) === 'true')
  await page.locator('.sign-stage-close').click()
  await page.waitForTimeout(500)
  await page.locator('.mode-dock [aria-controls="sign-stage"]').click()
  await lettersButton.waitFor({ state: 'visible' })
  await lettersButton.click()
  check('Letters chosen', (await lettersButton.getAttribute('aria-pressed')) === 'true' && !new URL(page.url()).searchParams.has('recognizer'), page.url())
  await page.goBack(); await page.waitForTimeout(300)
  await page.goBack(); await page.waitForTimeout(600)
  check('Back returns to the Words entry', new URL(page.url()).searchParams.get('recognizer') === 'words', page.url())
  check('stage follows Back to Words', (await wordsButton.getAttribute('aria-pressed')) === 'true')
  await page.goForward(); await page.waitForTimeout(300)
  await page.goForward(); await page.waitForTimeout(600)
  check('stage follows Forward to Letters', (await lettersButton.getAttribute('aria-pressed')) === 'true', page.url())

  // E041: the fake camera reaches a playing preview.
  const cameraButton = page.locator('.sign-camera-button')
  if (await cameraButton.isVisible()) await cameraButton.click()
  const playing = await page.waitForFunction(() => {
    const video = document.querySelector('.sign-camera-video')
    return video && !video.paused && video.readyState >= 2 && document.querySelector('.sign-stage.is-live')
  }, null, { timeout: 20000 }).then(() => true, () => false)
  check('camera preview plays and stage is live', playing)

  // E039: Tab from a disclosure moves forward instead of jumping to the first control.
  const summary = page.locator('.sign-personalize summary')
  await summary.focus()
  await page.keyboard.press('Tab')
  const afterSummary = await page.evaluate(() => {
    const active = document.activeElement
    return { inStage: !!active?.closest('.sign-stage, .mode-dock'), isClose: active?.classList.contains('sign-stage-close'), text: active?.textContent?.trim().slice(0, 40) }
  })
  check('Tab after a summary keeps going forward', afterSummary.inStage && !afterSummary.isClose, afterSummary)
  await summary.click()
  await summary.focus()
  await page.keyboard.press('Tab')
  const intoDisclosure = await page.evaluate(() => document.activeElement?.closest('.sign-personalize') !== null && document.activeElement?.tagName !== 'SUMMARY')
  check('Tab enters an open disclosure', intoDisclosure)
  // Shift+Tab from the first control still wraps to the last one.
  await page.locator('.sign-stage-close').focus()
  await page.keyboard.press('Shift+Tab')
  check('Shift+Tab from first control wraps inside', await page.evaluate(() => !!document.activeElement?.closest('.sign-stage, .mode-dock')))
  await page.screenshot({ path: `${OUT}/phase4-stage.png` })

  // Leaving sign mode from the dock must bring the avatar stage back (its
  // className is re-rendered, which used to drop the reveal class).
  await page.locator('.mode-dock [aria-controls="try-it"]').click()
  await page.waitForTimeout(2200)
  const stage = await page.evaluate(() => {
    const element = document.querySelector('.avatar-stage')
    return { opacity: getComputedStyle(element).opacity, pip: element.classList.contains('sign-avatar-pip'), canvas: !!element.querySelector('.avatar-canvas canvas') }
  })
  check('avatar stage is visible again after Speak → Sign', stage.opacity === '1' && !stage.pip && stage.canvas, stage)
  const landing = await page.evaluate(() => {
    const canvas = document.querySelector('.avatar-canvas canvas'), mount = document.querySelector('.avatar-canvas')
    return { heroTop: Math.round(document.getElementById('top').getBoundingClientRect().top), buffer: canvas.width / canvas.height, shown: mount.clientWidth / mount.clientHeight }
  })
  check('Speak → Sign scrolls the hero to the top', Math.abs(landing.heroTop) <= 2, landing)
  check('avatar canvas keeps its aspect after camera mode', Math.abs(landing.buffer - landing.shown) < .01, landing)

  // The dock ends with About us, which opens the About dialog.
  const labels = await page.locator('.mode-dock .dock-item').evaluateAll((items) => items.map((item) => item.getAttribute('aria-label')))
  check('dock is Speak, Sign, How it works, About us', labels.join('|') === 'Speak → Sign|Sign → Text|How it works|About us', labels)
  await page.locator('.mode-dock [aria-label="About us"]').click()
  check('About us opens the About dialog', await page.locator('.about-modal[role="dialog"]').waitFor({ timeout: 3000 }).then(() => true, () => false))
  await page.keyboard.press('Escape')

  check('no page errors', errors.length === 0, errors)
  await browser.close()
  const failed = results.filter((r) => !r.ok)
  console.log(`\n${results.length - failed.length}/${results.length} passed`)
  process.exit(failed.length ? 1 : 0)
})().catch((error) => { console.error(error); process.exit(2) })
