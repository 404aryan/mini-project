import { NORMALIZATION } from './features'
import { parseDataset } from './knn-classifier'
import type { SignDataset, SignSample } from './types'

export const SAMPLE_DATABASE = 'yap-render-sign'
export const MAX_SAMPLE_FILE_BYTES = 25 * 1024 * 1024
const STORE = 'datasets'
const KEY = 'user'
const CHANGE = 'yap-render-sign-samples-changed'

export function emptyDataset(): SignDataset { return { version: 1, normalization: NORMALIZATION, samples: [] } }

/** Identical reimports are idempotent; conflicting IDs abort the entire import. */
export function mergeDatasets(current: SignDataset, incoming: SignDataset): SignDataset {
  const previous = parseDataset(current), next = parseDataset(incoming)
  const records = new Map(previous.samples.map((sample) => [sample.id, sample]))
  for (const sample of next.samples) {
    const existing = records.get(sample.id)
    if (existing && (existing.label !== sample.label || existing.features.some((n, index) => n !== sample.features[index]))) throw new Error(`Sample ID “${sample.id}” already contains a different pose. No samples were changed.`)
    if (!existing) records.set(sample.id, sample)
  }
  return parseDataset({ ...emptyDataset(), samples: [...records.values()] })
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
export function addStoredSamples(samples: SignSample[]) {
  const incoming = parseDataset({ ...emptyDataset(), samples })
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

export async function readRecognitionDataset() {
  const results = await Promise.allSettled([
    fetch('/models/isl-samples.json', { cache: 'no-store' }).then(async (response) => {
      if (!response.ok) throw new Error('Bundled samples unavailable; using device samples only.')
      return parseDataset(await response.json())
    }),
    readStoredDataset(),
  ])
  const bundled = results[0].status === 'fulfilled' ? results[0].value : emptyDataset()
  const local = results[1].status === 'fulfilled' ? results[1].value : emptyDataset()
  const warnings = results.filter((r) => r.status === 'rejected').map((r) => r.status === 'rejected' ? (r.reason instanceof Error ? r.reason.message : 'Sample storage unavailable.') : '')
  return { dataset: recognitionDataset(bundled, local), warning: warnings.join(' ') }
}

/** Personal labels take precedence; the bundled library must not exhaust the
 * user's 5,000-pose import limit or make a full device library fail to load. */
export function recognitionDataset(bundled: SignDataset, local: SignDataset): SignDataset {
  const counts = new Map<string, number>()
  local.samples.forEach((sample) => counts.set(sample.label, (counts.get(sample.label) ?? 0) + 1))
  const ids = new Set(local.samples.map((sample) => sample.id))
  const baseline = bundled.samples.filter((sample) => (counts.get(sample.label) ?? 0) < 3 && !ids.has(sample.id))
  // Round-robin labels so a nearly full device library retains coverage first.
  const groups = new Map<string, SignSample[]>()
  baseline.forEach((sample) => groups.set(sample.label, [...(groups.get(sample.label) ?? []), sample]))
  const ordered: SignSample[] = []
  for (let index = 0; index < Math.max(0, ...[...groups.values()].map((group) => group.length)); index++) {
    groups.forEach((group) => { if (group[index]) ordered.push(group[index]) })
  }
  return parseDataset({ ...emptyDataset(), samples: [...local.samples, ...ordered.slice(0, Math.max(0, 5000 - local.samples.length))] })
}

export function downloadDataset(dataset: SignDataset) {
  const valid = parseDataset(dataset)
  const url = URL.createObjectURL(new Blob([JSON.stringify(valid, null, 2)], { type: 'application/json' }))
  const link = document.createElement('a')
  link.href = url; link.download = 'isl-samples.json'; link.style.display = 'none'
  document.body.appendChild(link); link.click(); link.remove()
  window.setTimeout(() => URL.revokeObjectURL(url), 1000)
}
