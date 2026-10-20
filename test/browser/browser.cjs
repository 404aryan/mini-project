// Shared setup for the browser regression checks. Playwright is not a project
// dependency: install it (npm i -g playwright && npx playwright install chromium)
// or point PLAYWRIGHT_MODULE at an installed package. PLAYWRIGHT_CHROMIUM can
// name a specific browser executable.
const os = require('node:os')

function loadPlaywright() {
  try {
    return require(process.env.PLAYWRIGHT_MODULE || 'playwright')
  } catch {
    console.error('Playwright is not installed. Install it or set PLAYWRIGHT_MODULE to its package directory.')
    process.exit(2)
  }
}

module.exports = {
  chromium: loadPlaywright().chromium,
  launchOptions: (extra = {}) => ({ ...(process.env.PLAYWRIGHT_CHROMIUM ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM } : {}), ...extra }),
  BASE: process.argv[2] || process.env.BASE_URL || 'http://localhost:3000',
  OUT: process.argv[3] || os.tmpdir(),
}
