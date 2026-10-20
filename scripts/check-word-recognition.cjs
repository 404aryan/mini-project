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
const { TemporalForest, chooseWindow }=load('temporal-forest'), { TemporalWordRecognizer }=load('temporal-recognizer')
const { emptyWordDataset }=load('word-data'), { appendRecognizedToken }=load('transcript-tokens')
// Optional arguments compare another model: check-word-recognition.cjs [model.json weights.bin]
const [modelFile='public/models/isl-temporal-model.json',weightsFile='public/models/isl-temporal-forest.bin']=process.argv.slice(2)
const model=JSON.parse(fs.readFileSync(path.resolve(__dirname,'..',modelFile),'utf8'))
const bytes=fs.readFileSync(path.resolve(__dirname,'..',weightsFile))
const forest=new TemporalForest(model,new Float32Array(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength)))
const cases=read('.sign-data-cache/temporal-replay.json'), results=[], timings=[]
for(const source of cases){
  let tokens=[]
  const recognizer=new TemporalWordRecognizer(model,(windows,done)=>{
    const started=performance.now(), result=chooseWindow(windows.map(window=>forest.predict(window)))
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
  maximumQueryMs:+Math.max(...timings).toFixed(2),averageQueryMs:+(timings.reduce((a,b)=>a+b,0)/timings.length).toFixed(2),
  perWord:Object.fromEntries([...new Set(results.map(r=>r.expected))].map(word=>{const own=results.filter(r=>r.expected===word)
    return [word,{observations:own.length,correct:own.filter(r=>r.text===word).length,wrong:own.filter(r=>r.text&&r.text!==word).map(r=>r.text)}]}))}
fs.writeFileSync(path.join(__dirname,'../.sign-data-cache/temporal-live-replay.json'),JSON.stringify({summary,results},null,2))
console.log(JSON.stringify(summary,null,2))
