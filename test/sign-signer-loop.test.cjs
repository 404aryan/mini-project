const{test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),ts=require('typescript'),path=require('node:path')
const source=ts.transpileModule(fs.readFileSync(path.join(__dirname,'../lib/sign/signer-tracker.ts'),'utf8').replaceAll('import.meta.url',"'https://example.test/sign.js'"),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText
function host(){
  const workers=[],callbacks=new Map(),timers=new Map(),bitmaps=[],statuses=[];let serial=0,clock=1000,closed=0,handsStarts=0,handsStops=0
  class Worker{constructor(){this.messages=[];this.terminated=false;workers.push(this)}postMessage(value){this.messages.push(value)}terminate(){this.terminated=true}emit(data){this.onmessage({data})}}
  const video={readyState:4,videoWidth:1280,videoHeight:720,currentTime:0,requestVideoFrameCallback:fn=>{callbacks.set(++serial,fn);return serial},cancelVideoFrameCallback:id=>callbacks.delete(id)}
  const document={hidden:false,addEventListener(){},removeEventListener(){}},controller=new AbortController(),exports={}
  vm.runInNewContext(source,{exports,URL,Worker,OffscreenCanvas:class{},document,location:{origin:'https://example.test'},performance:{now:()=>clock},
    setTimeout:fn=>{timers.set(++serial,fn);return serial},clearTimeout:id=>timers.delete(id),
    createImageBitmap:()=>new Promise(resolve=>bitmaps.push(()=>resolve({close(){closed++}}))),
    require:()=>({startHandTracking:async()=>{handsStarts++;return()=>{handsStops++}}}),
  })
  return{workers,callbacks,timers,bitmaps,controller,statuses,get closed(){return closed},get handsStarts(){return handsStarts},get handsStops(){return handsStops},
    start:()=>exports.startSignerTracking(video,{signal:controller.signal,onFrame(){},onError(){},onStatus:value=>statuses.push(value)}),
    pump(){const[id,fn]=callbacks.entries().next().value;callbacks.delete(id);clock+=100;video.currentTime+=.1;fn(clock)},
    async settle(){for(let i=0;i<8;i++)await Promise.resolve()},
  }
}
test('signer worker has one frame in flight and closes a bitmap resolving after abort',async()=>{
  const h=host();await h.start();h.workers[0].emit({type:'ready',capabilities:{pose:true,face:true},unavailable:[]})
  h.pump();h.pump();assert.equal(h.bitmaps.length,1)
  h.controller.abort();h.bitmaps[0]();await h.settle()
  assert.equal(h.closed,1);assert.equal(h.workers[0].terminated,true);assert.equal(h.callbacks.size,0)
  assert.equal(h.workers[0].messages.length,1,'late frame is never transferred')
})
test('GPU failure retries CPU and ignores messages from a terminated worker',async()=>{
  const h=host();await h.start();const gpu=h.workers[0]
  gpu.emit({type:'error'});await h.settle()
  const cpu=h.workers[1];assert.equal(gpu.terminated,true);assert.equal(cpu.messages[0].delegate,'CPU')
  gpu.emit({type:'ready',capabilities:{pose:true,face:true},unavailable:[]})
  assert.equal(h.statuses.at(-1).mode,'loading')
  cpu.emit({type:'error'});await h.settle()
  assert.equal(h.handsStarts,1);assert.equal(h.statuses.at(-1).mode,'hands')
  h.controller.abort();assert.equal(h.handsStops,1)
})
