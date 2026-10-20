const { test } = require('node:test')
const assert = require('node:assert/strict')
const { loadModule: load } = require('./load-module.cjs')

const speech = load('lib/live-speech.ts')
const { trailingPhrasePrefixLength } = load('components/avatar/textToGloss.js')

const results = (...segments) => segments.map(([transcript, isFinal]) => Object.assign([{ transcript }], { isFinal }))

test('result segments are joined with a separator', () => {
  const heard = speech.readSpeechResults(results(['hello', true], ['world', true]))
  assert.equal(heard.transcript, 'hello world')
  assert.deepEqual([...heard.words], ['hello', 'world'])
  assert.equal(heard.finalWordCount, 2)
  assert.equal(heard.allFinal, true)
})

test('a revised interim word is signed after the correction', () => {
  const sent = []
  let committed = []
  for (const update of [results(['I eat', false]), results(['I ate rice', false]), results(['I ate rice', true])]) {
    const plan = speech.planLiveCommit(committed, speech.readSpeechResults(update))
    committed = plan.committed
    if (plan.chunk) sent.push(plan.chunk)
  }
  assert.deepEqual(sent, ['I', 'ate', 'rice'])
})

test('same-length replacements and shortened hypotheses are not lost', () => {
  let plan = speech.planLiveCommit([], speech.readSpeechResults(results(['I eat rice', true])))
  assert.equal(plan.chunk, 'I eat rice')
  plan = speech.planLiveCommit(plan.committed, speech.readSpeechResults(results(['I eat nice', true])))
  assert.equal(plan.chunk, 'nice')
  plan = speech.planLiveCommit(plan.committed, speech.readSpeechResults(results(['I eat', false])))
  assert.equal(plan.chunk, '')
  plan = speech.planLiveCommit(plan.committed, speech.readSpeechResults(results(['I eat nice food', true])))
  assert.equal(plan.chunk, 'food')
})

test('the start of a multi-word sign is held until the phrase completes', () => {
  assert.equal(trailingPhrasePrefixLength(['thank']), 1)
  assert.equal(trailingPhrasePrefixLength(['I', 'need', 'water']), 0)
  let plan = speech.planLiveCommit([], speech.readSpeechResults(results(['thank you', false])), trailingPhrasePrefixLength)
  assert.equal(plan.chunk, '')
  plan = speech.planLiveCommit(plan.committed, speech.readSpeechResults(results(['thank you', true])), trailingPhrasePrefixLength)
  assert.equal(plan.chunk, 'thank you')
})

test('speech history keeps the newest words across restarts', () => {
  assert.equal(speech.appendSpeechHistory('good morning', 'how are you'), 'good morning how are you')
  assert.equal(speech.appendSpeechHistory('a b c', 'd e', 3), 'c d e')
})

function memoryStorage(initial = {}) {
  const data = new Map(Object.entries(initial))
  return {
    getItem: (key) => (data.has(key) ? data.get(key) : null),
    setItem: (key, value) => data.set(key, String(value)),
    removeItem: (key) => data.delete(key),
    data,
  }
}

test('local profiles verify the password on sign in', async () => {
  const localStorage = memoryStorage()
  const accounts = load('lib/local-account.ts', { window: { localStorage } })
  const created = await accounts.registerLocalAccount('Asha', 'Asha@Example.com', 'secret1')
  assert.equal(created.ok, true)
  assert.equal(created.account.email, 'asha@example.com')
  assert.ok(!localStorage.getItem('yap-render-profiles').includes('secret1'))
  assert.equal((await accounts.registerLocalAccount('Asha', 'asha@example.com', 'other12')).ok, false)
  assert.equal((await accounts.signInLocalAccount('asha@example.com', 'wrong12')).ok, false)
  assert.equal((await accounts.signInLocalAccount('nobody@example.com', 'secret1')).ok, false)
  const signedIn = await accounts.signInLocalAccount('ASHA@example.com', 'secret1')
  assert.equal(signedIn.ok, true)
  assert.equal(signedIn.account.name, 'Asha')
})

test('corrupt or blocked storage does not throw', () => {
  const corrupt = load('lib/local-account.ts', { window: { localStorage: memoryStorage({ 'yap-render-account': 'invalid-json' }) } })
  assert.equal(corrupt.readSignedInAccount(), null)
  const malformed = load('lib/local-account.ts', { window: { localStorage: memoryStorage({ 'yap-render-account': '{"name":42}' }) } })
  assert.equal(malformed.readSignedInAccount(), null)
  const blocked = { getItem() { throw new Error('blocked') }, setItem() { throw new Error('blocked') }, removeItem() { throw new Error('blocked') } }
  const denied = load('lib/local-account.ts', { window: { localStorage: blocked } })
  assert.equal(denied.readSignedInAccount(), null)
  assert.equal(denied.signOutLocalAccount(), false)
})
