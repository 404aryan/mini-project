import { DtwSignRecognizer } from './dtw-classifier'
import { parseWordDataset } from './word-data'
import type { SignPrediction } from './types'

/** Only word templates/features cross this local worker boundary, never the network. */
export function createWordRecognizer() {
  if (typeof Worker === 'undefined') throw new Error('Word matching needs Web Workers. Try a current browser or use letters mode.')
  const worker = new Worker(new URL('./word-matcher.worker.ts', import.meta.url))
  let callback: ((prediction: SignPrediction) => void) | null = null, queryId = 0, failure = ''
  const recognizer = Object.assign(new DtwSignRecognizer(undefined, (frames, hands, done) => {
    callback = done
    worker.postMessage({ type: 'predict', id: ++queryId, frames, hands })
  }), { dispose() { callback = null; queryId++; worker.terminate() }, error: '' })
  Object.defineProperty(recognizer, 'error', { get: () => failure })
  const replace = recognizer.replace.bind(recognizer)
  recognizer.replace = (input: unknown) => {
    const dataset = parseWordDataset(input)
    replace(dataset); callback = null; queryId++
    worker.postMessage({ type: 'dataset', dataset })
  }
  worker.onmessage = ({ data }) => {
    if (data.type === 'error') { failure = 'Word matching is unavailable. Reload this page to retry; your saved recordings are safe.'; callback = null; return }
    if (data.type !== 'prediction' || data.id !== queryId) return
    const done = callback; callback = null; done?.(data.prediction)
  }
  worker.onerror = (event) => { event.preventDefault(); failure = 'The word matching worker could not start. Reload to retry or use letters mode.'; callback = null }
  return recognizer
}
