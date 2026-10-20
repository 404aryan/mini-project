// Replay genuine held-out hand tracks through the actual temporal recognizer
// and transcript token writer. No webcam, network or user storage is modified.
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm'), ts = require('typescript')
const cache = new Map()
function load(name) {
  if (cache.has(name)) return cache.get(name)
  const exports = {}; cache.set(name,exports)
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(path.join(__dirname,'../lib/sign',`${name}.ts`),'utf8'), {
    compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022},
  }).outputText,{exports,require:name=>load(name.replace(/^\.\//,'')),Float32Array,Float64Array,Error})
  return exports
}
const read=file=>JSON.parse(fs.readFileSync(path.join(__dirname,'..',file),'utf8'))
// The replay tracks come from scripts/train-word-model.py in the git-ignored cache.
if(!fs.existsSync(path.join(__dirname,'../.sign-data-cache/temporal-replay.json'))){
  console.error('Replay data missing: .sign-data-cache/temporal-replay.json. Run scripts/train-word-model.py first; no replay was performed.')
  process.exit(1)
}
const { TemporalForest }=load('temporal-forest'), { TemporalWordRecognizer }=load('temporal-recognizer')
const { emptyWordDataset }=load('word-data'), { appendRecognizedToken }=load('transcript-tokens')
const model=read('public/models/isl-temporal-model.json')
const bytes=fs.readFileSync(path.join(__dirname,'../public/models/isl-temporal-forest.bin'))
const forest=new TemporalForest(model,new Float32Array(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength)))
const cases=read('.sign-data-cache/temporal-replay.json'), results=[], timings=[]
for(const source of cases){
  let tokens=[]
  const recognizer=new TemporalWordRecognizer(model,(windows,done)=>{
    const started=performance.now(), predictions=windows.map(window=>forest.predict(window))
    const result=predictions.filter(x=>x.label).sort((a,b)=>b.confidence-a.confidence)[0]??predictions.sort((a,b)=>b.confidence-a.confidence)[0]
    timings.push(performance.now()-started);done(result)
  })
  recognizer.replace(emptyWordDataset())
  let now=0,serial=0
  const frame=hands=>{
    const prediction=recognizer.predict({hands,timestamp:now})
    if(prediction.completed&&prediction.label)tokens=appendRecognizedToken(tokens,{id:String(++serial),text:prediction.label},true)
    now+=1000/15
  }
  for(const raw of source.hands) frame(raw.filter(hand=>hand.some(point=>point.some(n=>n!==0))).map(hand=>hand.map(([x,y,z])=>({x,y,z}))))
  for(let i=0;i<25;i++)frame([])
  results.push({expected:source.label.replaceAll('_',' '),text:tokens.map(token=>token.text).join(''),source:source.source})
}
const summary={observations:results.length,correct:results.filter(r=>r.text===r.expected).length,
  wrong:results.filter(r=>r.text&&r.text!==r.expected).length,rejected:results.filter(r=>!r.text).length,
  maximumQueryMs:+Math.max(...timings).toFixed(2),averageQueryMs:+(timings.reduce((a,b)=>a+b,0)/timings.length).toFixed(2)}
fs.writeFileSync(path.join(__dirname,'../.sign-data-cache/temporal-live-replay.json'),JSON.stringify({summary,results},null,2))
console.log(JSON.stringify(summary,null,2))
