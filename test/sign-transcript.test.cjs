// Transcript events, correction, undo and sentence safeguards. Labels here are
// synthetic transcript inputs, not ISL recognition evidence.
const { test } = require('node:test'), assert = require('node:assert/strict')
const fs = require('node:fs'), path = require('node:path')
const { loadModule } = require('./load-module.cjs')
const { transcriptReducer, emptyTranscript, transcriptSigns, spelledTerms, editTokens, MAX_TRANSCRIPT_LENGTH } = loadModule('lib/sign/transcript-tokens.ts')
const { reviewSentence, protectedTerms, sentenceRequest } = loadModule('lib/sign/sentence.ts')
const { UnifiedSignRecognizer } = loadModule('lib/sign/unified-recognizer.ts')
const { TemporalWordRecognizer } = loadModule('lib/sign/temporal-recognizer.ts')
const { emptyWordDataset } = loadModule('lib/sign/word-data.ts')

let serial = 0
const sign = (text, kind, extra = {}) => {
  const id = String(++serial)
  return { id, text, kind, sign: { id, kind, canonical: `${kind}:${text}`, text: text.replaceAll('_', ' '), source: kind === 'word' ? 'word-model' : 'letters-numbers', commit: 'confirmed', startedAt: 1000, endedAt: 1800, ...extra } }
}
const run = (state, ...actions) => actions.reduce(transcriptReducer, state)
const commit = (text, kind, extra) => ({ type: 'commit', token: sign(text, kind, extra), words: false })
const text = state => state.tokens.map(token => token.text).join('')
// Module values come from another VM realm; compare their plain JSON shape.
const same = (actual, expected, message) => assert.deepEqual(JSON.parse(JSON.stringify(actual)), expected, message)

test('committed signs keep kind, canonical label, readable text, source, time span and score basis', () => {
  const state = run(emptyTranscript, commit('THANK_YOU', 'word', { score: { value: .81, basis: 'word model vote share' } }))
  assert.equal(text(state), 'THANK YOU')
  const [entry] = transcriptSigns(state.tokens)
  assert.equal(entry.sign.canonical, 'word:THANK_YOU')
  assert.equal(entry.sign.text, 'THANK YOU')
  assert.equal(entry.sign.source, 'word-model')
  assert.equal(entry.sign.endedAt - entry.sign.startedAt, 800)
  assert.equal(entry.sign.score.basis, 'word model vote share')
  assert.equal(entry.intact, true)
  assert.equal(state.announcement.text, 'Added THANK YOU')
})

test('undo removes a whole multi-character sign with its boundary space, across token types', () => {
  let state = run(emptyTranscript, commit('HELLO', 'word'), commit('A', 'letter'), commit('M', 'letter'), commit('7', 'number'), commit('7', 'number'), commit('WATER', 'word'))
  assert.equal(text(state), 'HELLO AM 77 WATER')
  state = run(state, { type: 'undo' })
  assert.equal(text(state), 'HELLO AM 77')
  assert.equal(state.announcement.text, 'Undid WATER')
  state = run(state, { type: 'undo' })
  assert.equal(text(state), 'HELLO AM 7', 'a repeated digit is its own sign')
  state = run(state, { type: 'undo' }, { type: 'undo' })
  assert.equal(text(state), 'HELLO A')
  state = run(state, { type: 'undo' }, { type: 'undo' })
  assert.equal(text(state), '')
  assert.equal(run(state, { type: 'undo' }), state, 'nothing left to undo')
})

test('backspace stays character level while undo restores it, clear and removed signs', () => {
  let state = run(emptyTranscript, commit('HELLO', 'word'), { type: 'backspace' })
  assert.equal(text(state), 'HELL')
  assert.equal(transcriptSigns(state.tokens)[0].intact, false, 'an edited sign is reported as edited')
  state = run(state, { type: 'undo' })
  assert.equal(text(state), 'HELLO')
  state = run(state, commit('GO', 'word'), commit('HOME', 'word'), { type: 'clear' })
  assert.equal(text(state), '')
  assert.equal(state.announcement.text, 'Transcript cleared')
  state = run(state, { type: 'undo' })
  assert.equal(text(state), 'HELLO GO HOME')
  const middle = transcriptSigns(state.tokens)[1].sign.id
  state = run(state, { type: 'remove', id: middle })
  assert.equal(text(state), 'HELLO HOME')
  state = run(state, { type: 'remove', id: transcriptSigns(state.tokens)[0].sign.id })
  assert.equal(text(state), 'HOME', 'removing the first sign drops the next boundary space too')
  assert.equal(transcriptSigns(state.tokens)[0].intact, true)
  state = run(state, { type: 'undo' }, { type: 'undo' })
  assert.equal(text(state), 'HELLO GO HOME')
})

test('typed corrections keep untouched sign metadata and form one undo step', () => {
  let state = run(emptyTranscript, commit('I', 'word'), commit('WANT', 'word'), commit('WATER', 'word'))
  state = run(state, { type: 'edit', text: 'I WANT COLD WATER' }, { type: 'edit', text: 'I WANT COLD WATER!' })
  assert.equal(text(state), 'I WANT COLD WATER!')
  const signs = transcriptSigns(state.tokens)
  same(signs.map(entry => [entry.sign.text, entry.intact]), [['I', true], ['WANT', true], ['WATER', true]])
  assert.ok(state.tokens.filter(token => !token.sign).every(token => token.id.startsWith('manual-')))
  state = run(state, { type: 'edit-done' }, { type: 'edit', text: 'I WANT WATER' })
  assert.equal(state.history.length, 5)
  state = run(state, { type: 'undo' })
  assert.equal(text(state), 'I WANT COLD WATER!')
  state = run(state, { type: 'undo' })
  assert.equal(text(state), 'I WANT WATER', 'consecutive keystrokes undo together')
  const tokens = state.tokens
  assert.equal(editTokens(tokens, 'I WANT WATER', 99), tokens)
  same(transcriptSigns(editTokens(tokens, 'I WANT WAXTER', 99)).map(entry => entry.intact), [true, true, false], 'text typed inside a sign marks it edited')
  assert.equal(new Set(editTokens(tokens, 'I WANT WATER NOW', 99).map(token => token.id)).size, 16)
})

test('the 1,200-character limit holds for signs, spaces and typed text', () => {
  let state = run(emptyTranscript, { type: 'edit', text: 'A'.repeat(1300) })
  assert.equal(state.tokens.length, MAX_TRANSCRIPT_LENGTH)
  const full = run(state, commit('HELLO', 'word'))
  assert.equal(full.tokens, state.tokens)
  assert.match(full.announcement.text, /full\. HELLO was not added/)
  assert.equal(run(state, { type: 'space' }), state)
})

test('fingerspelled groups become protected terms', () => {
  const state = run(emptyTranscript, commit('NAME', 'word'), commit('A', 'letter'), commit('M', 'letter'), commit('I', 'letter'), commit('T', 'letter'), commit('1', 'number'), commit('2', 'number'))
  assert.equal(text(state), 'NAME AMIT 12')
  same(spelledTerms(state.tokens), ['AMIT'])
  same(protectedTerms(text(state), ['AMIT', 'AMITX', 'X Y']), ['AMIT'])
})

test('sentence review flags changed names, quantities and negation instead of hiding them', () => {
  same(reviewSentence('MY NAME AMIT', 'My name is Amit.', ['AMIT']), [])
  same(reviewSentence('MY NAME AMIT', 'My name is Amith.', ['AMIT']), ['changes or drops the spelled word AMIT'])
  same(reviewSentence('I NEED 2 TICKET', 'I need two tickets.'), ['changes or drops the number 2'])
  same(reviewSentence('I NEED 2 TICKET', 'मुझे २ टिकट चाहिए।'), [], 'Devanagari digits are the same quantity')
  same(reviewSentence('7 7', 'I have 7.'), ['changes or drops the number 7'])
  same(reviewSentence('BUS 12', 'Bus 12 at 5.'), ['adds the number 5'])
  same(reviewSentence('I NOT WANT WATER', 'I want water.'), ['drops a negation'])
  same(reviewSentence('I NOT WANT WATER', "I don't want water."), [])
  same(reviewSentence('I NOT WANT WATER', 'I don’t want water.'), [], 'a typographic apostrophe is still a negation')
  same(reviewSentence('I NOT WANT WATER', 'मुझे पानी नहीं चाहिए।'), [])
  same(reviewSentence('I KNOW', 'I know.'), [], 'KNOW is not a negation')
  same(reviewSentence('I WANT FOOD', 'मुझे खाना चाहिए।'), [], 'ना inside a Hindi word is not a negation')
  same(reviewSentence('I WANT WATER', 'I do not want water.'), ['adds a negation'])
})

test('sentence requests accept protected terms only from the same text', () => {
  same(sentenceRequest({ tokens: Array.from('NAME AMIT'), language: 'en-IN', keep: ['AMIT'] }).keep, ['AMIT'])
  same(sentenceRequest({ tokens: Array.from('NAME AMIT'), language: 'en-IN' }).keep, [])
  for (const keep of [['RAVI'], ['AMI'], ['AM IT'], 'AMIT', [1], Array(101).fill('AMIT')]) assert.throws(() => sentenceRequest({ tokens: Array.from('NAME AMIT'), language: 'en-IN', keep }))
  assert.throws(() => sentenceRequest({ tokens: ['A'], language: 'en-IN', frames: [] }))
})

test('confirmed Auto signs keep their source and score for transcript metadata', () => {
  const hand = Array.from({ length: 21 }, (_, i) => ({ x: .2 + i * .004, y: .4 + i * .002, z: i * .001 }))
  const words = { labels: ['GO'], sampleCount: 1, usesTrainedModel: true, init: async () => {}, replace() {}, reset() {}, predict: () => ({ label: null, confidence: 0, candidates: [{ label: 'GO', confidence: .62 }] }) }
  const letters = { labels: ['A'], sampleCount: 1, init: async () => {}, replace() {}, predict: () => ({ label: 'A', confidence: .97 }) }
  const recognizer = new UnifiedSignRecognizer(words, letters)
  let result
  for (let i = 0; i < 40; i++) result = recognizer.predict({ hands: [hand], timestamp: i * 68 })
  same(result.candidates.map(candidate => [candidate.id, candidate.source]).sort(), [['letter:A', 'letters-numbers'], ['word:GO', 'word-model']])
  assert.equal(recognizer.confirmCandidate('word:GO'), true)
  const confirmed = recognizer.consumeConfirmation()
  assert.equal(confirmed.source, 'word-model')
  assert.equal(confirmed.confidence, .62)
})

test('the thumbs-up shortcut is labelled as an app gesture, not the word model', () => {
  const fixture = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures/thumb-up-detection.json'), 'utf8'))
  const model = new TemporalWordRecognizer({ vocabulary: ['YES'], trainingObservations: 1 }, (_windows, done) => done({ label: null, confidence: 0, candidates: [] }))
  model.replace(emptyWordDataset())
  const sources = []
  for (let timestamp = 0; timestamp <= 600; timestamp += 50) {
    const prediction = model.predict({ ...fixture.frame, timestamp })
    if (prediction.completed) sources.push(prediction.source)
  }
  same(sources, ['thumbs-up-shortcut'])
})
