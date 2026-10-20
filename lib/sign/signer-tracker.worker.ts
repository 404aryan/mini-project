import { FilesetResolver, GestureRecognizer, PoseLandmarker, FaceLandmarker } from '@mediapipe/tasks-vision'
import { HandIdentityTracker, signerObservation } from './signer-features'

type Request = { type: 'init'; origin: string; delegate?: 'GPU' | 'CPU' } | { type: 'frame'; image: ImageBitmap; timestamp: number }
const scope = self as unknown as { onmessage: (event: MessageEvent<Request>) => void; postMessage: (message: unknown) => void }
let hands: GestureRecognizer | null = null, pose: PoseLandmarker | null = null, face: FaceLandmarker | null = null
const identity = new HandIdentityTracker()
scope.onmessage = async ({ data }) => {
  if (data.type === 'init') {
    try {
      const base = new URL('/mediapipe/', data.origin), files = await FilesetResolver.forVisionTasks(new URL('wasm',base).href)
      const create = async <T>(build: (delegate: 'GPU' | 'CPU') => Promise<T>) => {
        if (data.delegate === 'CPU') return await build('CPU')
        try { return await build('GPU') } catch { return await build('CPU') }
      }
      hands = await create(delegate => GestureRecognizer.createFromOptions(files, {
        baseOptions: { delegate, modelAssetPath: new URL('gesture_recognizer.task',base).href },
        canvas: new OffscreenCanvas(1,1), runningMode: 'VIDEO', numHands: 2,
      }))
      const unavailable: string[] = []
      try { pose = await create(delegate => PoseLandmarker.createFromOptions(files, {
        baseOptions: { delegate, modelAssetPath: new URL('pose_landmarker_lite.task',base).href },
        canvas: new OffscreenCanvas(1,1), runningMode: 'VIDEO', numPoses: 1, outputSegmentationMasks: false,
      })) } catch { unavailable.push('body') }
      try { face = await create(delegate => FaceLandmarker.createFromOptions(files, {
        baseOptions: { delegate, modelAssetPath: new URL('face_landmarker.task',base).href },
        canvas: new OffscreenCanvas(1,1), runningMode: 'VIDEO', numFaces: 1,
        outputFaceBlendshapes: true, outputFacialTransformationMatrixes: true,
      })) } catch { unavailable.push('face') }
      scope.postMessage({ type: 'ready', capabilities: { hands: true, pose: !!pose, face: !!face }, unavailable })
    } catch (error) { scope.postMessage({ type: 'error', message: String(error) }) }
    return
  }
  const { image, timestamp } = data
  try {
    if (!hands) throw new Error('Tracker is not ready')
    const started = performance.now(), result = hands.recognizeForVideo(image, timestamp)
    const poseResult = pose?.detectForVideo(image, timestamp), faceResult = face?.detectForVideo(image, timestamp)
    const signer = signerObservation({ hands: result.landmarks, pose: poseResult?.landmarks[0], face: faceResult?.faceLandmarks[0],
      faceBlendshapes: Object.fromEntries((faceResult?.faceBlendshapes[0]?.categories ?? []).map(c => [c.categoryName,c.score])),
      headTransform: faceResult?.facialTransformationMatrixes[0]?.data, timestamp, aspect: image.width/image.height }, identity)
    scope.postMessage({ type: 'frame', inferenceMs: performance.now()-started, frame: { timestamp, hands: result.landmarks, signer,
      gestures: result.gestures.flatMap(categories => categories[0] ? [{ name: categories[0].categoryName, score: categories[0].score }] : []) } })
  } catch (error) { scope.postMessage({ type: 'error', message: String(error) }) }
  finally { image.close() }
}
