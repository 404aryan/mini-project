import { featureHandCount, NORMALIZATION } from './features'
import { fetchWithDeadline } from './fetch-deadline'
import { MAX_RECOGNITION_SAMPLES, MIN_SAMPLES_PER_LABEL, parseDataset } from './knn-classifier'
import { readProvenance, sampleProvenance } from './provenance'
import type { SignDataset, SignSample } from './types'

export const SAMPLE_DATABASE = 'yap-render-sign'
export const MAX_SAMPLE_FILE_BYTES = 25 * 1024 * 1024
const STORE = 'datasets'
const KEY = 'user'
const CHANGE = 'yap-render-sign-samples-changed'

export function emptyDataset(): SignDataset { return { version: 1, normalization: NORMALIZATION, samples: [] } }

/** Identical reimports are idempotent; conflicting IDs abort the entire import.
 * Each added sample keeps its file's license, source and attribution. */
export function mergeDatasets(current: SignDataset, incoming: SignDataset): SignDataset {
  const previous = parseDataset(current), next = parseDataset(incoming), origin = sampleProvenance(next)
  const records = new Map(previous.samples.map((sample) => [sample.id, sample]))
  for (const sample of next.samples) {
    const existing = records.get(sample.id)
    if (existing && (existing.label !== sample.label || existing.features.some((n, index) => n !== sample.features[index]))) throw new Error(`Sample ID “${sample.id}” already contains a different pose. No samples were changed.`)
    if (!existing) records.set(sample.id, { ...origin, ...sample })
  }
  return parseDataset({ ...emptyDataset(), ...readProvenance(previous), samples: [...records.values()] })
}

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') { reject(new Error('Device storage is unavailable in this browser.')); return }
    let settled = false
    const request = indexedDB.open(SAMPLE_DATABASE, 1)
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE)) request.result.createObjectStore(STORE)
    }
    request.onerror = () => { settled = true; reject(new Error('Could not open device storage. Check site storage settings.')) }
    request.onblocked = () => { settled = true; reject(new Error('Close older Yap & Render tabs, then retry device storage.')) }
    request.onsuccess = () => {
      const database = request.result
      if (settled) { database.close(); return }
      settled = true
      database.onversionchange = () => database.close()
      resolve(database)
    }
  })
}

function publishChange() {
  if (typeof window !== 'undefined') window.dispatchEvent(new Event(CHANGE))
  try {
    const channel = new BroadcastChannel(CHANGE)
    channel.postMessage('changed'); channel.close()
  } catch { /* Same-tab updates and window focus also refresh the data. */ }
}

/** Resolve only after transaction completion, not the individual put request. */
async function transaction(mode: IDBTransactionMode, mutate?: (current: SignDataset) => SignDataset): Promise<SignDataset> {
  const database = await openDatabase()
  try {
    const result = await new Promise<SignDataset>((resolve, reject) => {
      const tx = database.transaction(STORE, mode)
      const store = tx.objectStore(STORE)
      let value = emptyDataset(), failure: unknown
      tx.oncomplete = () => resolve(value)
      tx.onabort = () => reject(failure ?? new Error('Samples could not be saved. Device storage may be full or unavailable.'))
      tx.onerror = () => { failure ??= new Error('Device storage failed. Your previously saved samples are unchanged.') }
      const request = store.get(KEY)
      request.onsuccess = () => {
        try {
          const current = request.result === undefined ? emptyDataset() : parseDataset(request.result)
          value = mutate ? parseDataset(mutate(current)) : current
          if (mutate) store.put(value, KEY)
        } catch (error) { failure = error; tx.abort() }
      }
    })
    if (mutate) publishChange()
    return result
  } finally { database.close() }
}

export function readStoredDataset() { return transaction('readonly') }
/** Takes new samples, or a whole imported file so its provenance stays with its samples. */
export function addStoredSamples(input: SignSample[] | SignDataset) {
  const incoming = parseDataset(Array.isArray(input) ? { ...emptyDataset(), samples: input } : input)
  return transaction('readwrite', (current) => mergeDatasets(current, incoming))
}
export function removeStoredSamples(ids: string[]) {
  const selected = new Set(ids)
  return transaction('readwrite', (current) => ({ ...current, samples: current.samples.filter((sample) => !selected.has(sample.id)) }))
}

export function subscribeSampleChanges(onChange: () => void) {
  window.addEventListener(CHANGE, onChange)
  window.addEventListener('focus', onChange)
  let channel: BroadcastChannel | undefined
  try { channel = new BroadcastChannel(CHANGE); channel.onmessage = onChange } catch { /* Unsupported or restricted browser. */ }
  return () => { window.removeEventListener(CHANGE, onChange); window.removeEventListener('focus', onChange); channel?.close() }
}

// The bundled library is fetched once per page. Focus and library refreshes
// reuse it, so going offline later never drops the loaded baseline.
let bundledSamples: Promise<SignDataset> | null = null
function readBundledDataset() {
  bundledSamples ??= fetchWithDeadline('/models/isl-samples.json', async (response) => {
    if (!response.ok) throw new Error('Bundled samples unavailable; using device samples only.')
    return parseDataset(await response.json())
  }, 'Bundled samples took too long to load; using device samples only.')
  // A failed attempt is retried on the next refresh instead of being cached.
  bundledSamples.catch(() => { bundledSamples = null })
  return bundledSamples
}

export async function readRecognitionDataset() {
  const results = await Promise.allSettled([readBundledDataset(), readStoredDataset()])
  const bundled = results[0].status === 'fulfilled' ? results[0].value : emptyDataset()
  const local = results[1].status === 'fulfilled' ? results[1].value : emptyDataset()
  const warnings = results.filter((r) => r.status === 'rejected').map((r) => r.status === 'rejected' ? (r.reason instanceof Error ? r.reason.message : 'Sample storage unavailable.') : '')
  return { dataset: recognitionDataset(bundled, local), warning: warnings.join(' ') }
}

/** The shipped library alone, for measurements that must not include personal recordings. */
export async function readBundledRecognitionDataset() {
  try { return { dataset: recognitionDataset(await readBundledDataset(), emptyDataset()), warning: '' } }
  catch (error) { return { dataset: emptyDataset(), warning: error instanceof Error ? error.message : 'Bundled samples unavailable.' } }
}

/** Personal samples replace bundled ones only for the same label and hand count
 * (with at least three of them); every other bundled sign is kept, so a full
 * device library never removes unrelated built-in coverage. */
export function recognitionDataset(bundled: SignDataset, local: SignDataset): SignDataset {
  const counts = new Map<string, number>()
  const group = (sample: SignSample) => `${sample.label}:${featureHandCount(sample.features)}`
  local.samples.forEach((sample) => counts.set(group(sample), (counts.get(group(sample)) ?? 0) + 1))
  const ids = new Set(local.samples.map((sample) => sample.id))
  const baseline = bundled.samples.filter((sample) => (counts.get(group(sample)) ?? 0) < MIN_SAMPLES_PER_LABEL && !ids.has(sample.id))
  return parseDataset({ ...emptyDataset(), samples: [...local.samples, ...baseline] }, MAX_RECOGNITION_SAMPLES)
}

export function downloadDataset(dataset: SignDataset, fileName = 'isl-samples.json') {
  const valid = parseDataset(dataset)
  const url = URL.createObjectURL(new Blob([JSON.stringify(valid, null, 2)], { type: 'application/json' }))
  const link = document.createElement('a')
  link.href = url; link.download = fileName; link.style.display = 'none'
  document.body.appendChild(link); link.click(); link.remove()
  window.setTimeout(() => URL.revokeObjectURL(url), 1000)
}
