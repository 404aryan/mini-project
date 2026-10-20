const { test } = require('node:test'), assert = require('node:assert/strict')
const { loadModule } = require('./load-module.cjs')
const { UnifiedSignRecognizer } = loadModule('lib/sign/unified-recognizer.ts')
const { appendRecognizedToken } = loadModule('lib/sign/transcript-tokens.ts')
const hand = (x=.2) => Array.from({length:21},(_,i)=>({ x:x+i*.004,y:.4+i*.002,z:i*.001 }))
function backends() {
  let word = { label:null,confidence:0,candidates:[] }, letter = { label:'I',confidence:.99 }, resets=0
  return {
    words: { labels:['I','GO'],sampleCount:1,init:async()=>{},replace(){},predict:()=>word,reset(){resets++} },
    letters:{ labels:['I','7'],sampleCount:1,init:async()=>{},replace(){},predict:()=>letter },
    setWord(value){word=value},setLetter(value){letter=value},get resets(){return resets},
  }
}
test('auto never commits a transient letter or completed word without confirmation',()=>{
  const b=backends(), r=new UnifiedSignRecognizer(b.words,b.letters)
  b.setWord({label:'GO',confidence:.99,completed:true,wordEvent:'committed',candidates:[]})
  let result
  for(let i=0;i<40;i++) {result=r.predict({hands:[hand(.2+i*.008)],timestamp:i*68});assert.ok(!result.completed)}
  assert.ok(result.candidates.some(c=>c.id==='word:GO'))
  assert.ok(!result.candidates.some(c=>c.kind==='letter'))
  assert.equal(r.confirmCandidate('word:GO'),true)
  assert.equal(r.consumeConfirmation().label,'GO')
  assert.equal(r.consumeConfirmation(),null)
  assert.equal(r.confirmCandidate('word:GO'),false)
})
test('letter I and pronoun I remain separate offers without comparing scores',()=>{
  const b=backends(),r=new UnifiedSignRecognizer(b.words,b.letters)
  b.setWord({label:'I',confidence:.2,candidates:[{label:'I',confidence:.2}]})
  let result
  for(let i=0;i<40;i++)result=r.predict({hands:[hand()],timestamp:i*68})
  assert.deepEqual([...result.candidates].map(c=>c.id).sort(),['letter:I','word:I'])
  assert.equal(r.confirmCandidate('letter:I'),true)
  assert.equal(r.consumeConfirmation().kind,'letter')
  for(let i=40;i<65;i++)assert.equal(r.predict({hands:[hand()],timestamp:i*68}).candidates.length,0)
})
test('release permits repeated signs while reset invalidates stale offers',()=>{
  const b=backends(),r=new UnifiedSignRecognizer(b.words,b.letters)
  for(let i=0;i<40;i++)r.predict({hands:[hand()],timestamp:i*68})
  assert.equal(r.confirmCandidate('letter:I'),true);r.consumeConfirmation()
  for(let i=40;i<48;i++)r.predict({hands:[],timestamp:i*68})
  for(let i=48;i<85;i++)r.predict({hands:[hand()],timestamp:i*68})
  assert.equal(r.confirmCandidate('letter:I'),true);r.consumeConfirmation()
  r.replace({words:{},letters:{}})
  assert.equal(r.confirmCandidate('letter:I'),false)
})
test('motion and missing hands expire static offers instead of emitting mid-word',()=>{
  const b=backends(),r=new UnifiedSignRecognizer(b.words,b.letters)
  for(let i=0;i<40;i++)r.predict({hands:[hand()],timestamp:i*68})
  r.predict({hands:[hand(.7)],timestamp:2800})
  assert.equal(r.confirmCandidate('letter:I'),false)
  for(let i=42;i<60;i++)r.predict({hands:[],timestamp:i*68})
  assert.equal(r.confirmCandidate('letter:I'),false)
})
test('typed transcript groups spelling and numbers across word boundaries',()=>{
  let tokens=[],id=0
  const add=(text,kind)=>{tokens=appendRecognizedToken(tokens,{id:String(++id),text,kind},false)}
  add('GO','word');add('G','letter');add('O','letter');add('I','letter');add('7','number');add('7','number');add('THANK_YOU','word')
  assert.equal(tokens.map(t=>t.text).join(''),'GO GOI 77 THANK YOU')
})

test('word backend failure removes its stale offers while spelling remains available',()=>{
  const b=backends(),r=new UnifiedSignRecognizer(b.words,b.letters)
  b.setWord({label:'GO',confidence:.9,candidates:[{label:'GO',confidence:.9}]})
  r.predict({hands:[hand()],timestamp:0})
  b.words.error='Worker timed out'
  assert.equal(r.confirmCandidate('word:GO'),false)
  let result
  for(let i=1;i<40;i++)result=r.predict({hands:[hand()],timestamp:i*68})
  assert.ok(result.candidates.some(candidate=>candidate.id==='letter:I'))
  assert.ok(!r.labels.includes('GO'));assert.ok(r.warning)
})
