import { DtwSignRecognizer } from './dtw-classifier'
import { fetchWithDeadline } from './fetch-deadline'
import { parseWordDataset } from './word-data'
import type { SignPrediction } from './types'
import { TemporalWordRecognizer } from './temporal-recognizer'
import type { ForestResult, TemporalModel } from './temporal-forest'

/** Load trained weights once per active session, and keep inference off the UI thread. */
export async function createTrainedWordRecognizer() {
  const model = await fetchWithDeadline('/models/isl-temporal-model.json', async (response) => {
    if (!response.ok) throw new Error('The word model could not load. Retry recognition.')
    return await response.json() as TemporalModel
  }, 'The word model took too long to load. Retry recognition.')
  // Model metadata must never cause a request to an arbitrary third party.
  if (model.weights !== '/models/isl-temporal-forest.bin') throw new Error('Invalid word model weights path.')
  const binary = await fetchWithDeadline(model.weights, async (response) => {
    if (!response.ok) throw new Error('Word model weights could not load. Retry recognition.')
    return response.arrayBuffer()
  }, 'Word model weights took too long to load. Retry recognition.', 60000)
  if (model.sha256 && globalThis.crypto?.subtle) {
    const digest = await crypto.subtle.digest('SHA-256', binary)
    const checksum = Array.from(new Uint8Array(digest), value => value.toString(16).padStart(2,'0')).join('')
    if (checksum !== model.sha256) throw new Error('Word model files changed while loading. Please retry recognition.')
  }
  const worker = new Worker(new URL('./word-matcher.worker.ts', import.meta.url))
  // Forest and personal template queries share the worker; each reply carries its query id.
  const callbacks = new Map<number, (prediction: ForestResult & SignPrediction) => void>()
  let queryId = 0, forestQuery = 0
  let queryTimer: ReturnType<typeof setTimeout> | undefined
  // Personal template matching is far heavier than the forest; it runs in the
  // worker so a large personal library cannot stall the camera loop.
  const personal = new DtwSignRecognizer(undefined, (frames, hands, done) => {
    const id = ++queryId
    callbacks.set(id, done)
    worker.postMessage({ type: 'predict', id, frames, hands })
  })
  const replacePersonal = personal.replace.bind(personal)
  personal.replace = (input: unknown) => {
    const dataset = parseWordDataset(input)
    replacePersonal(dataset)
    worker.postMessage({ type: 'dataset', dataset })
  }
  const recognizer = new TemporalWordRecognizer(model, (windows, done) => {
    if (forestQuery) callbacks.delete(forestQuery)
    forestQuery = ++queryId
    callbacks.set(forestQuery, done)
    worker.postMessage({ type: 'temporal', id: forestQuery, windows })
    clearTimeout(queryTimer)
    queryTimer = setTimeout(() => { recognizer.error = 'Word recognition is taking too long. Retry recognition.'; callbacks.clear() }, 3500)
  }, () => { clearTimeout(queryTimer); callbacks.clear(); worker.terminate() }, personal)
  try {
    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('Word model startup timed out. Retry recognition.')), 15000)
      worker.onmessage = ({ data }) => {
        if (data.type === 'ready') { clearTimeout(timeout); resolve(); return }
        if (data.type === 'error') { clearTimeout(timeout); reject(new Error('Word model could not start.')); return }
      }
      worker.onerror = event => { event.preventDefault(); clearTimeout(timeout); reject(new Error('Word matching worker could not start.')) }
      worker.postMessage({ type: 'model', model, weights: binary }, [binary])
    })
  } catch (error) { recognizer.dispose(); throw error }
  worker.onmessage = ({ data }) => {
    if (data.type === 'error') { recognizer.error = 'Word recognition paused. Retry recognition.'; callbacks.clear(); return }
    if (data.type !== 'prediction') return
    const done = callbacks.get(data.id)
    if (!done) return
    callbacks.delete(data.id)
    if (data.id === forestQuery) { clearTimeout(queryTimer); forestQuery = 0 }
    done(data.prediction)
  }
  worker.onerror = event => { event.preventDefault(); recognizer.error = 'Word recognition paused. Retry recognition.'; callbacks.clear() }
  return recognizer
}

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
