import { DtwSignRecognizer } from './dtw-classifier'
import type { WordDataset } from './word-data'
import { TemporalForest, chooseWindow, type TemporalModel } from './temporal-forest'

type Request = { type: 'dataset'; dataset: WordDataset } | { type: 'predict'; id: number; frames: number[][]; hands: number }
  | { type: 'model'; model: TemporalModel; weights: ArrayBuffer } | { type: 'temporal'; id: number; windows: number[][] }
const scope = self as unknown as { onmessage: (event: MessageEvent<Request>) => void; postMessage: (message: unknown) => void }
const recognizer = new DtwSignRecognizer()
let forest: TemporalForest | null = null
scope.onmessage = ({ data }) => {
  try {
    if (data.type === 'model') { forest = new TemporalForest(data.model, new Float32Array(data.weights)); scope.postMessage({ type: 'ready' }) }
    else if (data.type === 'temporal') {
      if (!forest) throw new Error('Model is not ready')
      scope.postMessage({ type: 'prediction', id: data.id, prediction: chooseWindow(data.windows.map(window => forest!.predict(window))) })
    } else if (data.type === 'dataset') recognizer.replace(data.dataset)
    else scope.postMessage({ type: 'prediction', id: data.id, prediction: recognizer.predictSequence(data.frames, data.hands) })
  } catch { scope.postMessage({ type: 'error' }) }
}
