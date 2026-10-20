const { test } = require('node:test')
const assert = require('node:assert/strict')
const { loadModule } = require('./load-module.cjs')

const guard = loadModule('lib/api-guard.ts', { TextDecoder })

test('a client is limited per window and gets a retry time', () => {
  const limit = guard.createRateLimiter({ limit: 3, windowMs: 60_000 })
  for (let i = 0; i < 3; i++) assert.equal(limit('a', 1000).allowed, true)
  const refused = limit('a', 1000)
  assert.equal(refused.allowed, false)
  assert.equal(refused.retryAfterSeconds, 60)
  assert.equal(limit('b', 1000).allowed, true, 'Other clients keep their own budget')
  assert.equal(limit('a', 61_000).allowed, true, 'The window resets')
})

test('the limiter tracks a bounded number of clients', () => {
  const limit = guard.createRateLimiter({ limit: 1, windowMs: 1000, maxKeys: 2 })
  assert.equal(limit('a', 0).allowed, true)
  assert.equal(limit('b', 0).allowed, true)
  assert.equal(limit('c', 0).allowed, false, 'A third client waits while two windows are open')
  assert.equal(limit('c', 1000).allowed, true, 'Expired windows are pruned')
})

test('concurrent provider calls are capped and released once', () => {
  const calls = guard.createConcurrencyLimit(2)
  const first = calls.acquire(), second = calls.acquire()
  assert.ok(first && second)
  assert.equal(calls.acquire(), null)
  first(); first()
  assert.equal(calls.active, 1, 'Releasing twice frees one slot only')
  assert.ok(calls.acquire())
})

test('request bodies are refused before an oversized body is buffered', async () => {
  const body = (text) => new Request('http://local/api', { method: 'POST', body: text })
  assert.equal(await guard.readBodyText(body('{"text":"hi"}'), 100), '{"text":"hi"}')
  await assert.rejects(guard.readBodyText(body('x'.repeat(101)), 100), (error) => error.name === 'BodyTooLargeError')
  const declared = new Request('http://local/api', { method: 'POST', body: 'x', headers: { 'content-length': '5000' } })
  await assert.rejects(guard.readBodyText(declared, 100), (error) => error.name === 'BodyTooLargeError')
  // A streamed body without a length header stops at the limit.
  let pulled = 0
  const stream = new ReadableStream({ pull(controller) { pulled++; controller.enqueue(new Uint8Array(64)); if (pulled > 1000) controller.close() } })
  await assert.rejects(guard.readBodyText(new Request('http://local/api', { method: 'POST', body: stream, duplex: 'half' }), 256), (error) => error.name === 'BodyTooLargeError')
  assert.ok(pulled < 20, `stopped after ${pulled} chunks`)
})

test('logged errors name the failure without provider text', () => {
  const error = Object.assign(new Error('quota exceeded for project 1234 while translating "my secret"'), { status: 429 })
  assert.equal(guard.describeError(error), 'Error (status 429)')
  assert.equal(guard.isRateLimitError(error), true)
  assert.equal(guard.isRateLimitError(new Error('socket hang up')), false)
})

test('text longer than the online limit is signed offline in full, never sent', async () => {
  let requests = 0
  const { translateToGloss } = loadModule('lib/islTranslator.ts', { navigator: { onLine: true }, fetch: async () => { requests++; throw new Error('should not be called') }, setTimeout, clearTimeout, AbortController })
  const { MAX_ONLINE_TEXT_LENGTH } = loadModule('lib/islVocabulary.ts')
  const words = Array.from({ length: Math.ceil(MAX_ONLINE_TEXT_LENGTH / 5) + 10 }, () => 'home').join(' ')
  const result = await translateToGloss(`${words} water`)
  assert.equal(requests, 0)
  assert.equal(result.mode, 'offline')
  assert.equal(result.tokens.at(-1), 'WATER', 'The end of a long message is still signed')
})
