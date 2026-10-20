// Real MediaPipe inference on a public fixture; not an ISL accuracy evaluation.
const {chromium,launchOptions,BASE,OUT}=require('./browser.cjs')
const fs=require('node:fs'),path=require('node:path')
const results=[],check=(name,ok,detail)=>{results.push(ok);console.log(`${ok?'PASS':'FAIL'} ${name}${detail?' '+JSON.stringify(detail):''}`)}
;(async()=>{
  await require('../../scripts/prepare-signer-fixtures.cjs').prepare()
  fs.mkdirSync(OUT,{recursive:true})
  const browser=await chromium.launch(launchOptions())
  const context=await browser.newContext({viewport:{width:1366,height:768}})
  await context.route('**/__test/*',route=>route.fulfill({path:path.resolve('.sign-data-cache/camera-stage34/'+new URL(route.request().url()).pathname.split('/').at(-1)),contentType:'image/jpeg'}))
  await context.route('**/api/**',route=>route.fulfill({status:503,json:{error:'Disabled in tracking test'}}))
  await context.addInitScript(()=>{
    window.__tracking={frames:[],workers:[],terminated:0,events:[]}
    const Original=window.Worker
    window.Worker=class extends Original {
      constructor(...args){super(...args);window.__tracking.workers.push(String(args[0]));this.addEventListener('message',event=>{
        if(event.data.type!=='frame')window.__tracking.events.push(event.data)
        if(event.data.type==='frame'&&event.data.frame?.signer){window.__tracking.frames.push(event.data);if(window.__tracking.frames.length>25)window.__tracking.frames.shift()}
      })}
      terminate(){window.__tracking.terminated++;super.terminate()}
    }
    navigator.mediaDevices.getUserMedia=async()=>{
      const img=new Image();img.src='/__test/pose.jpg';await img.decode()
      const canvas=document.createElement('canvas');canvas.width=960;canvas.height=Math.round(960*img.height/img.width)
      window.__fixtureImage=img
      const paint=()=>{const scale=Math.min(canvas.width/img.width,canvas.height/img.height),ctx=canvas.getContext('2d');ctx.clearRect(0,0,canvas.width,canvas.height);ctx.drawImage(img,(canvas.width-img.width*scale)/2,(canvas.height-img.height*scale)/2,img.width*scale,img.height*scale)}
      paint();const timer=setInterval(paint,66),stream=canvas.captureStream(15)
      window.__testStream=stream;window.addEventListener('pagehide',()=>clearInterval(timer),{once:true});return stream
    }
  })
  const page=await context.newPage(),errors=[];page.on('pageerror',error=>errors.push(error.message))
  await page.goto(`${BASE}/?mode=sign`,{waitUntil:'networkidle'})
  check('default is confirmation-only Auto preview',await page.getByRole('button',{name:'Auto Preview',exact:true}).getAttribute('aria-pressed')==='true')
  await page.locator('.sign-camera-button').click()
  await page.waitForFunction(()=>window.__tracking.frames.length>=3,null,{timeout:90000}).catch(async error=>{console.log('Tracking diagnostics',await page.evaluate(()=>({events:window.__tracking.events,workers:window.__tracking.workers,chip:document.querySelector('.sign-model-chip')?.textContent})));throw error})
  const frame=await page.evaluate(()=>{
    const result=window.__tracking.frames.at(-1)
    return {schema:result.frame.signer.schema,pose:result.frame.signer.pose.length,face:result.frame.signer.face.length,elbows:result.frame.signer.elbows,inferenceMs:result.inferenceMs,quality:result.frame.signer.quality}
  })
  check('worker returns synchronized versioned body observations',frame.schema==='signer-frame-v2'&&frame.pose===33,frame)
  check('forearm configuration is measured when elbows are visible',Number.isFinite(frame.elbows.left)&&Number.isFinite(frame.elbows.right))
  check('non-sign fixture never auto-inserts transcript text',await page.locator('.sign-raw-line .sign-letter').count()===0)
  await page.screenshot({path:path.join(OUT,'signer-body.png')})
  await page.evaluate(async()=>{window.__fixtureImage.src='/__test/portrait.jpg';await window.__fixtureImage.decode();window.__tracking.frames=[]})
  await page.waitForFunction(()=>window.__tracking.frames.some(result=>result.frame.signer.face.length>=468),null,{timeout:30000})
  check('face landmarks, blendshapes and head transform are real model outputs',await page.evaluate(()=>{const s=window.__tracking.frames.find(result=>result.frame.signer.face.length>=468).frame.signer;return s.headTransform?.length===16&&Object.keys(s.faceBlendshapes).length>30}))
  await page.waitForTimeout(500)
  await page.screenshot({path:path.join(OUT,'signer-face.png')})
  await page.evaluate(async()=>{window.__fixtureImage.src='/__test/thumb-up.jpg';await window.__fixtureImage.decode();window.__tracking.frames=[]})
  const yes=page.locator('.sign-suggestions button').filter({hasText:/^YES/})
  await yes.first().waitFor({timeout:45000})
  check('real hand image offers a typed YES candidate without inserting it',await page.locator('.sign-raw-line .sign-letter').count()===0&&(await yes.first().textContent()).includes('word'))
  await yes.first().click();await page.waitForTimeout(1300)
  check('confirming YES writes once while the same hand stays held',await page.locator('.sign-raw-line').textContent()==='YES')
  check('confirmed YES is announced once and described as confirmed',await page.locator('.sign-sr-only[aria-live="polite"]').textContent()==='Added YES'&&(await page.locator('.sign-last-sign').textContent()).includes('YES · word · you confirmed'))
  await page.getByRole('button',{name:'Edit text',exact:true}).click()
  check('sign details name the thumbs-up app gesture as the source',(await page.locator('.sign-event-list li').first().textContent()).includes('thumbs-up app gesture · you confirmed'))
  await page.screenshot({path:path.join(OUT,'signer-sign-details.png')})
  await page.getByRole('button',{name:'Edit text',exact:true}).click()
  await page.getByRole('button',{name:'Undo YES',exact:true}).click();await page.waitForTimeout(1500)
  check('undo removes the confirmed sign and the held hand does not re-add it',await page.locator('.sign-raw-line .sign-letter').count()===0)
  check('detected hand has stable identity and orientation metadata',await page.evaluate(()=>window.__tracking.frames.some(result=>result.frame.signer.hands.some(hand=>hand.id&&hand.palmNormal))))
  await page.screenshot({path:path.join(OUT,'signer-auto-confirmed.png')})
  const workerCount=await page.evaluate(()=>window.__tracking.workers.length)
  await page.getByRole('button',{name:'Spell',exact:true}).click()
  check('spelling override retains stream',await page.evaluate(()=>document.querySelector('.sign-camera-video').srcObject===window.__testStream))
  const readySigns=async test=>page.waitForFunction(test,null,{timeout:30000}).then(()=>page.locator('.sign-ready-signs p').textContent()).catch(()=>'')
  const spelling=(await readySigns(()=>/\bA\b/.test(document.querySelector('.sign-ready-signs p')?.textContent??''))).split(' · ')
  check('spelling never offers digit 0, whose bundled photographs are letter O',spelling.includes('O')&&spelling.includes('1')&&!spelling.includes('0'),spelling.length)
  await page.getByRole('button',{name:'Numbers',exact:true}).click()
  check('number override is explicit',await page.getByRole('button',{name:'Numbers',exact:true}).getAttribute('aria-pressed')==='true')
  check('numbers compares only digits, including bundled 0',await readySigns(()=>document.querySelector('.sign-ready-signs p')?.textContent==='0 · 1 · 2 · 3 · 4 · 5 · 6 · 7 · 8 · 9')==='0 · 1 · 2 · 3 · 4 · 5 · 6 · 7 · 8 · 9')
  check('intent overrides keep the existing signer worker',await page.evaluate(()=>window.__tracking.workers.length)===workerCount)
  await page.getByRole('button',{name:'Pause camera',exact:true}).click()
  check('pause terminates signer worker and stops the stream',await page.evaluate(()=>window.__tracking.terminated>0&&window.__testStream.getTracks().every(track=>track.readyState==='ended')))
  check('no page exceptions',errors.length===0,errors)
  await context.close()
  const fallback=await browser.newContext({viewport:{width:390,height:844}})
  await fallback.addInitScript(()=>{window.Worker=class{constructor(){throw new Error('Workers blocked in test')}}})
  const second=await fallback.newPage()
  await second.goto(`${BASE}/?mode=sign`,{waitUntil:'networkidle'})
  // Do not request a real device: inject a blank local stream for this context.
  await second.evaluate(()=>navigator.mediaDevices.getUserMedia=async()=>{const canvas=document.createElement('canvas');canvas.width=640;canvas.height=480;const stream=canvas.captureStream(15);canvas.getContext('2d').fillRect(0,0,640,480);return stream})
  await second.locator('.sign-camera-button').click()
  await second.waitForFunction(()=>document.querySelector('.sign-model-chip')?.textContent.includes('Hands only'),null,{timeout:45000})
  check('blocked workers fall back to hands-only without claiming body/face',!(await second.locator('.sign-model-chip').textContent()).includes('+ face'))
  await second.getByRole('button',{name:'Pause camera',exact:true}).click()
  await browser.close();console.log(`${results.filter(Boolean).length}/${results.length} signer checks passed`)
  process.exit(results.every(Boolean)?0:1)
})().catch(error=>{console.error(error);process.exit(2)})
