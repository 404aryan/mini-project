// Genuine public pose image, no camera or private recordings. Compare combined
// holistic+gesture with separate pose+face+gesture using the installed JS API.
const { chromium } = require('playwright')
const fs = require('node:fs'), path = require('node:path')
const root = path.join(__dirname,'..'), base = process.argv[2] || 'http://127.0.0.1:3200'
;(async () => {
  await require('./prepare-signer-fixtures.cjs').prepare({holistic:true})
  const browser = await chromium.launch({ ...(process.env.PLAYWRIGHT_CHROMIUM ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM } : {}) })
  const page = await browser.newPage()
  const files = { 'vision_bundle.mjs': 'node_modules/@mediapipe/tasks-vision/vision_bundle.mjs',
    'pose.jpg': '.sign-data-cache/camera-stage34/pose.jpg', 'holistic.task': '.sign-data-cache/camera-stage34/holistic_landmarker.task' }
  await page.route('**/__bench/*', route => {
    const name = new URL(route.request().url()).pathname.split('/').at(-1)
    if (name === 'index') return route.fulfill({ contentType:'text/html',body:'<!doctype html><html><body>Tracking benchmark</body></html>' })
    return route.fulfill({ path: path.join(root,files[name]), contentType: name.endsWith('mjs') ? 'application/javascript' : name.endsWith('jpg') ? 'image/jpeg' : 'application/octet-stream' })
  })
  await page.goto(`${base}/__bench/index`,{ waitUntil:'networkidle' })
  const result = await page.evaluate(async () => {
    const vision = await import('/__bench/vision_bundle.mjs')
    const files = await vision.FilesetResolver.forVisionTasks('/mediapipe/wasm')
    const image = new Image(); image.src = '/__bench/pose.jpg'; await image.decode()
    const options = modelAssetPath => ({ baseOptions:{ modelAssetPath,delegate:'CPU' }, runningMode:'VIDEO' })
    const hands = await vision.GestureRecognizer.createFromOptions(files,{ ...options('/mediapipe/gesture_recognizer.task'),numHands:2 })
    const reports = []; let previousTimestamp = 0
    for (const pipeline of ['separate','holistic']) {
      const tasks = []
      try {
        if (pipeline === 'separate') {
          tasks.push(await vision.PoseLandmarker.createFromOptions(files,{ ...options('/mediapipe/pose_landmarker_lite.task'),numPoses:1 }))
          tasks.push(await vision.FaceLandmarker.createFromOptions(files,{ ...options('/mediapipe/face_landmarker.task'),numFaces:1,outputFaceBlendshapes:true,outputFacialTransformationMatrixes:true }))
        } else tasks.push(await vision.HolisticLandmarker.createFromOptions(files,{ ...options('/__bench/holistic.task'),outputFaceBlendshapes:true }))
        const timings = [], detections = []
        for (let i=0;i<16;i++) {
          const timestamp = Math.max(performance.now(),previousTimestamp+34), start = performance.now(); previousTimestamp = timestamp
          const hand = hands.recognizeForVideo(image,timestamp)
          const results = tasks.map(task => task.detectForVideo(image,timestamp))
          if (i >= 3) timings.push(performance.now()-start)
          detections.push({ hands:hand.landmarks.length,pose:(results[0].landmarks || results[0].poseLandmarks)?.[0]?.length || 0,
            face:(results[1]?.faceLandmarks || results[0].faceLandmarks)?.[0]?.length || 0 })
        }
        timings.sort((a,b)=>a-b)
        reports.push({ pipeline,p50Ms:timings[Math.floor(timings.length*.5)],p95Ms:timings[Math.floor(timings.length*.95)],detections:detections.at(-1) })
      } catch (error) { reports.push({ pipeline,error:String(error) }) }
      finally { tasks.forEach(task=>task.close()) }
    }
    hands.close()
    return { userAgent:navigator.userAgent,delegate:'CPU',observations:13,note:'Repeated public still image. This measures lab inference latency, not signing accuracy or sustained device thermals.',reports }
  })
  fs.writeFileSync(path.join(root,'.sign-data-cache/camera-stage34/tracking-benchmark.json'),JSON.stringify(result,null,2))
  console.log(JSON.stringify(result,null,2)); await browser.close()
})().catch(error=>{console.error(error);process.exit(1)})
