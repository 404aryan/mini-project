const { test } = require('node:test')
const assert = require('node:assert/strict')
const { loadModule } = require('./load-module.cjs')

const vocabulary = loadModule('lib/islVocabulary.ts')
const { translateOffline } = loadModule('lib/islTranslator.ts', { navigator: { onLine: true } })
const { NUMBER_ANIMATIONS } = loadModule('components/avatar/animations/numbers.js')
const { transliterateHindi } = loadModule('components/avatar/hindiToGloss.js')

// Arrays from the module context are compared as plain copies.
const gloss = (text) => [...translateOffline(text).tokens]

test('numbers are kept as playable digit tokens', () => {
  assert.deepEqual(gloss('123'), ['1-2-3'])
  assert.ok(gloss('call 112').includes('1-1-2'))
  assert.ok(gloss('I have 2 books').includes('2'))
  assert.ok(gloss('I have two books').includes('2'))
  for (const digit of '0123456789') {
    const runtime = { animations: [] }
    NUMBER_ANIMATIONS[digit](runtime)
    assert.ok(runtime.animations.length >= 2, `digit ${digit} has frames`)
  }
})

test('offline Hindi maps known words and spells unknown ones', () => {
  assert.deepEqual(gloss('मुझे पानी चाहिए'), ['I', 'WATER', 'NEED'])
  assert.deepEqual(gloss('नमस्ते अमित'), ['HELLO', 'A-M-I-T'])
  assert.deepEqual(gloss('आप कहाँ जा रहे हो?'), ['YOU', 'GO', 'WHERE'])
  assert.deepEqual(gloss('मैं खाना नहीं खाता'), ['I', 'FOOD', 'EAT', 'NO'])
  assert.equal(transliterateHindi('राम'), 'RAM')
  assert.equal(transliterateHindi('१२'), '12')
})

test('names and supported words are not cut down by suffix stripping', () => {
  assert.deepEqual(gloss('James'), ['J-A-M-E-S'])
  assert.ok(gloss('my clothes').includes('CLOTHES'))
  assert.ok(gloss('I am eating').includes('EAT'))
  assert.ok(gloss('she walked').includes('WALK'))
})

test('explicit spelling keeps repeated letters and the letter I', () => {
  assert.deepEqual(gloss('B B'), ['B-B'])
  assert.deepEqual(gloss('A M I T'), ['A-M-I-T'])
  assert.deepEqual(gloss('I'), ['I'])
  assert.deepEqual([...vocabulary.sanitizeTokens(['AMIT', 'I', 'THANK YOU'])], ['A-M-I-T', 'I', 'THANK_YOU'])
})

test('fully covered sentences still get ISL order', () => {
  assert.deepEqual(gloss('I eat water'), ['I', 'WATER', 'EAT'])
  assert.deepEqual(gloss('Hello, I need help'), ['HELLO', 'I', 'NEED', 'HELP'])
})

test('every restored vocabulary sign is reachable by its canonical name and readable label', () => {
  for (const token of vocabulary.SUPPORTED_TOKENS) {
    assert.deepEqual(gloss(token), [token], `${token} plays its own animation`)
    assert.deepEqual(gloss(token.replaceAll('_', ' ')), [token], `${token} accepts its readable label`)
  }
  assert.deepEqual(gloss('please wait a minute'), ['PLEASE', 'WAIT_MINUTE'])
  assert.deepEqual(gloss('please wait minute'), ['PLEASE', 'WAIT_MINUTE'])
})

test('pronouns are kept as participants', () => {
  assert.ok(gloss('We need help').includes('I'))
  assert.ok(gloss('I help her').includes('PERSON'))
  assert.deepEqual(gloss('he and she'), ['PERSON'])
})

test('negation uses the NO sign', () => {
  assert.deepEqual(gloss('I do not know'), ['I', 'KNOW', 'NO'])
  assert.ok(gloss("I can't go").includes('NO'))
  assert.ok(!gloss('I cannot go').some((token) => token.includes('-')))
})

test('the sanitizer only returns playable tokens', () => {
  assert.deepEqual([...vocabulary.sanitizeTokens(['_', '', '!!', null])], [])
  assert.equal(vocabulary.isPlayableToken('_'), false)
  for (const token of vocabulary.sanitizeTokens(['hello', 'x_y', '42', 'नमस्ते', 'A-B'])) {
    assert.ok(vocabulary.isPlayableToken(token), token)
  }
})

test('unsupported scripts are reported instead of silently vanishing', () => {
  const result = translateOffline('hello வணக்கம்')
  assert.deepEqual([...result.tokens], ['HELLO'])
  assert.deepEqual([...result.skipped], ['வணக்கம்'])
})
