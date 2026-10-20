// Loads a project module (TypeScript or ESM JavaScript) as CommonJS in a fresh
// context, resolving relative, extensionless and "@/" imports the way the app
// bundler does. `globals` stands in for browser APIs such as window.localStorage.
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')
const ts = require('typescript')

const ROOT = path.join(__dirname, '..')

function resolve(file) {
  for (const candidate of [file, `${file}.ts`, `${file}.tsx`, `${file}.js`]) {
    const absolute = path.join(ROOT, candidate)
    if (fs.existsSync(absolute) && fs.statSync(absolute).isFile()) return candidate
  }
  throw new Error(`Cannot resolve ${file}`)
}

function loadModule(file, globals = {}, cache = new Map()) {
  const resolved = resolve(file)
  if (cache.has(resolved)) return cache.get(resolved)
  const exports = {}
  cache.set(resolved, exports)
  const { outputText } = ts.transpileModule(fs.readFileSync(path.join(ROOT, resolved), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true },
    fileName: resolved,
  })
  const base = path.dirname(resolved)
  const requireFromModule = (specifier) => {
    const target = specifier.startsWith('@/') ? specifier.slice(2) : path.join(base, specifier).replace(/\\/g, '/')
    return loadModule(target, globals, cache)
  }
  vm.runInNewContext(outputText, { exports, module: { exports }, require: requireFromModule, TextEncoder, crypto: globalThis.crypto, console, ...globals })
  return exports
}

module.exports = { loadModule }
