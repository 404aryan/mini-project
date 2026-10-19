import { DtwSignRecognizer } from './dtw-classifier'
import type { WordDataset } from './word-data'

type Request = { type: 'dataset'; dataset: WordDataset } | { type: 'predict'; id: number; frames: number[][]; hands: number }
const scope = self as unknown as { onmessage: (event: MessageEvent<Request>) => void; postMessage: (message: unknown) => void }
const recognizer = new DtwSignRecognizer()
scope.onmessage = ({ data }) => {
  try {
    if (data.type === 'dataset') recognizer.replace(data.dataset)
    else scope.postMessage({ type: 'prediction', id: data.id, prediction: recognizer.predictSequence(data.frames, data.hands) })
  } catch { scope.postMessage({ type: 'error' }) }
}
