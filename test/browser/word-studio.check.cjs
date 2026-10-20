// Browser regression check: word studio import, wrist-path preview, export, unsaved guard.
const fs = require('fs')
const path = require('path')
const { chromium, launchOptions, BASE, OUT } = require('./browser.cjs')
const FIXTURE = path.join(__dirname, '../fixtures/words-import.json')

const results = []
const check = (name, ok, detail = '') => { results.push({ name, ok }); console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${detail ? ' — ' + JSON.stringify(detail).slice(0, 300) : ''}`) }

// Puts recordings into the studio's unsaved state, as a failed save would.
const injectPending = (sample) => {
  const root = document.querySelector('.word-training-studio')
  const key = Object.keys(root).find((name) => name.startsWith('__reactFiber$'))
  for (let fiber = root[key]; fiber; fiber = fiber.return) {
    const hooks = []
    for (let hook = fiber.memoizedState; hook && typeof hook === 'object' && 'next' in hook; hook = hook.next) hooks.push(hook)
    const notice = hooks.findIndex((hook) => typeof hook.memoizedState === 'string' && /^(Choose a word|Imported|Exported)/.test(hook.memoizedState))
    if (notice >= 2 && hooks[notice - 2].queue?.dispatch) { hooks[notice - 2].queue.dispatch([sample]); return true }
  }
  return false
}

;(async () => {
  const browser = await chromium.launch(launchOptions())
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 }, acceptDownloads: true })
  const page = await context.newPage()
  const errors = []
  page.on('pageerror', (error) => errors.push(error.message))
  page.on('console', (message) => { if (message.type() === 'error' && !/Failed to load resource|TensorFlow Lite XNNPACK/.test(message.text())) errors.push(message.text()) })

  await page.goto(`${BASE}/sign/train/words`, { waitUntil: 'networkidle' })
  const heading = await page.textContent('.train-heading')
  check('studio copy mentions the pretrained model', /pretrained model/.test(heading) && !/No pretrained words/.test(heading), heading)

  // E057 + E055: import an annotated file, then review its motion.
  await page.setInputFiles('input[aria-label="Import word recordings"]', FIXTURE)
  await page.waitForFunction(() => /Imported 3/.test(document.querySelector('.train-notice')?.textContent || ''), null, { timeout: 15000 })
  check('annotated word file imports', true)
  const preview = page.locator('.train-sample-card .train-sample-preview').first()
  await preview.waitFor({ timeout: 10000 })
  check('preview announces the wrist path', /with wrist path/.test(await preview.getAttribute('aria-label')))
  const marker = () => preview.evaluate((svg) => { const c = svg.querySelector('circle[fill="var(--coral)"]'); return c ? [Number(c.getAttribute('cx')), Number(c.getAttribute('cy'))] : null })
  const start = await marker()
  await page.locator('.train-sample-card input[type="range"]').first().fill('29')
  const end = await marker()
  check('wrist path is drawn and its marker follows the frame', start && end && (start[0] !== end[0] || start[1] !== end[1]) && await preview.locator('polyline[stroke-dasharray]').count() > 0, { start, end })
  await page.locator('.train-sample-card').first().screenshot({ path: `${OUT}/phase5-motion-preview.png` })

  // E053 + E057: export is compact and keeps provenance.
  const [download] = await Promise.all([page.waitForEvent('download'), page.click('.train-file-actions button:has-text("Export word JSON")')])
  const exported = JSON.parse(fs.readFileSync(await download.path(), 'utf8'))
  const raw = fs.readFileSync(await download.path(), 'utf8')
  const fixture = JSON.parse(fs.readFileSync(FIXTURE, 'utf8'))
  check('export is compact JSON', !raw.includes('\n'), raw.length)
  check('export keeps license, source and attribution', exported.samples.length === 3 && exported.samples.every((sample) => sample.license === fixture.license && sample.source === fixture.source && sample.attribution === fixture.attribution))

  // E054 + E056: an unsaved motion that conflicts with the library.
  const conflicting = { ...fixture.samples[0], label: 'HELP' }
  check('unsaved motion injected', await page.evaluate(injectPending, conflicting))
  await page.locator('.train-unsaved').waitFor({ timeout: 5000 })
  const [pendingDownload] = await Promise.all([page.waitForEvent('download'), page.click('.train-unsaved button:has-text("Export unsaved motion")')])
  const pendingFile = JSON.parse(fs.readFileSync(await pendingDownload.path(), 'utf8'))
  check('unsaved motion exports on its own despite the conflict', pendingDownload.suggestedFilename() === 'isl-words-unsaved.json' && pendingFile.samples.length === 1 && pendingFile.samples[0].label === 'HELP', pendingDownload.suggestedFilename())
  const [libraryDownload] = await Promise.all([page.waitForEvent('download'), page.click('.train-file-actions button:has-text("Export word JSON")')])
  const libraryFile = JSON.parse(fs.readFileSync(await libraryDownload.path(), 'utf8'))
  check('library export still works and says the unsaved motion is separate', libraryFile.samples.length === 3 && /export it separately/.test(await page.textContent('.train-notice')))

  const dialogs = []
  page.on('dialog', async (dialog) => { dialogs.push(dialog.type()); await dialog.dismiss() })
  await page.click('.train-header .train-back')
  await page.waitForTimeout(500)
  check('leaving by link asks first and staying keeps the page', dialogs.includes('confirm') && page.url().includes('/sign/train/words'), { dialogs, url: page.url() })
  await page.reload().catch(() => {})
  await page.waitForTimeout(500)
  check('reload warns while a motion is unsaved', dialogs.includes('beforeunload'), dialogs)
  check('unsaved motion is still there after staying', await page.locator('.train-unsaved').isVisible())

  check('no page errors', errors.length === 0, errors)
  await browser.close()
  const failed = results.filter((r) => !r.ok)
  console.log(`\n${results.length - failed.length}/${results.length} passed`)
  process.exit(failed.length ? 1 : 0)
})().catch((error) => { console.error(error); process.exit(2) })
