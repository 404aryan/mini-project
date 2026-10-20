const { test }=require('node:test'),assert=require('node:assert/strict')
const {loadModule}=require('./load-module.cjs')
const {HandIdentityTracker,signerObservation}=loadModule('lib/sign/signer-features.ts')
const pose=()=>Array.from({length:33},(_,i)=>({x:i%2?.3:.7,y:i<13?.3:.6,z:0,visibility:1}))
const hand=x=>Array.from({length:21},(_,i)=>({x:x+(i%4)*.008,y:.6+i*.002,z:i*.001}))
test('anatomical wrist anchors preserve identity when hands cross and detection order swaps',()=>{
  const tracker=new HandIdentityTracker(),p=pose();p[15].x=.3;p[16].x=.7
  const a=tracker.update([hand(.3),hand(.7)],p,0)
  p[15].x=.55;p[16].x=.45
  const b=tracker.update([hand(.45),hand(.55)],p,68)
  assert.equal(a[0].id,b[1].id);assert.equal(a[1].id,b[0].id)
  assert.equal(b[1].side,'left');assert.equal(b[0].side,'right')
})
test('long occlusion never fabricates a missing hand or retains its identity indefinitely',()=>{
  const t=new HandIdentityTracker(),a=t.update([hand(.3)],[],0)
  assert.equal(t.update([],[],100).length,0)
  assert.notEqual(t.update([hand(.3)],[],600)[0].id,a[0].id)
})
test('body-normalized locations are scale and translation invariant with missing masks',()=>{
  const p=pose(),hands=[hand(.4)],base={pose:p,hands,timestamp:0,aspect:1}
  const a=signerObservation(base,new HandIdentityTracker())
  const transform=point=>({...point,x:point.x*2+3,y:point.y*2-1,z:point.z*2})
  const b=signerObservation({...base,pose:p.map(transform),hands:[hands[0].map(transform)]},new HandIdentityTracker())
  assert.ok(a.hands[0].bodyRelative.every((point,i)=>Math.abs(point.x-b.hands[0].bodyRelative[i].x)<1e-9&&Math.abs(point.y-b.hands[0].bodyRelative[i].y)<1e-9))
  const missing=signerObservation({hands:[],timestamp:0,aspect:1},new HandIdentityTracker())
  assert.equal(missing.schema,'signer-frame-v2');assert.equal(missing.elbows.left,null)
  assert.equal(missing.masks.face,false);assert.equal(missing.headTransform,null)
})
