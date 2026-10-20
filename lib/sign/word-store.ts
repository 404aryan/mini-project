import { emptyWordDataset, mergeWordDatasets, parseWordDataset, serializeWordDataset, wordRecognitionDataset, type WordDataset, type WordSample } from './word-data'

const DATABASE = 'yap-render-words', CHANGE = 'yap-render-word-samples-changed'
function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') { reject(new Error('Word storage is unavailable in this browser.')); return }
    let settled = false
    const request = indexedDB.open(DATABASE, 1)
    request.onupgradeneeded = () => { if (!request.result.objectStoreNames.contains('datasets')) request.result.createObjectStore('datasets') }
    request.onerror = () => { settled = true; reject(new Error('Could not open word storage. Check site storage settings.')) }
    request.onblocked = () => { settled = true; reject(new Error('Close older training tabs, then retry word storage.')) }
    request.onsuccess = () => {
      const database = request.result
      if (settled) { database.close(); return }
      database.onversionchange = () => database.close()
      settled = true; resolve(database)
    }
  })
}
async function transaction(mutate?: (current: WordDataset) => WordDataset): Promise<WordDataset> {
  const database = await openDatabase()
  try {
    const result = await new Promise<WordDataset>((resolve, reject) => {
      const tx = database.transaction('datasets', mutate ? 'readwrite' : 'readonly'), store = tx.objectStore('datasets')
      let value = emptyWordDataset(), failure: unknown
      tx.oncomplete = () => resolve(value)
      tx.onabort = () => reject(failure ?? new Error('Word recording could not be saved. Retry or export your unsaved motion.'))
      tx.onerror = () => { failure ??= new Error('Word storage failed. Previously saved recordings are unchanged.') }
      const read = store.get('user')
      read.onsuccess = () => {
        try {
          const current = read.result === undefined ? emptyWordDataset() : parseWordDataset(read.result)
          value = mutate ? parseWordDataset(mutate(current)) : current
          if (mutate) store.put(value, 'user')
        } catch (error) { failure = error; tx.abort() }
      }
    })
    if (mutate) {
      window.dispatchEvent(new Event(CHANGE))
      try { const channel = new BroadcastChannel(CHANGE); channel.postMessage('changed'); channel.close() } catch { /* Focus also refreshes. */ }
    }
    return result
  } finally { database.close() }
}
export function readStoredWords() { return transaction() }
/** Takes new recordings, or a whole imported file so its provenance stays with its samples. */
export function addStoredWords(input: WordSample[] | WordDataset) {
  const incoming = parseWordDataset(Array.isArray(input) ? { ...emptyWordDataset(), samples: input } : input)
  return transaction((current) => mergeWordDatasets(current, incoming))
}
export function removeStoredWords(ids: string[]) {
  const selected = new Set(ids)
  return transaction((current) => ({ ...current, samples: current.samples.filter((sample) => !selected.has(sample.id)) }))
}
export function subscribeWordChanges(onChange: () => void) {
  window.addEventListener(CHANGE, onChange); window.addEventListener('focus', onChange)
  let channel: BroadcastChannel | undefined
  try { channel = new BroadcastChannel(CHANGE); channel.onmessage = onChange } catch { /* Same-tab and focus updates still work. */ }
  return () => { window.removeEventListener(CHANGE, onChange); window.removeEventListener('focus', onChange); channel?.close() }
}
export async function readWordRecognitionDataset({ personalOnly = false } = {}) {
  const results = await Promise.allSettled([
    personalOnly ? Promise.resolve(emptyWordDataset()) : fetch('/models/isl-words.json', { cache: 'no-store' }).then(async (response) => {
      if (!response.ok) throw new Error('Bundled words unavailable; using device recordings only.')
      return parseWordDataset(await response.json())
    }), readStoredWords(),
  ])
  const bundled = results[0].status === 'fulfilled' ? results[0].value : emptyWordDataset()
  const local = results[1].status === 'fulfilled' ? results[1].value : emptyWordDataset()
  const warning = results.filter((result) => result.status === 'rejected').map((result) => result.status === 'rejected' && result.reason instanceof Error ? result.reason.message : 'Word recordings unavailable.').join(' ')
  return { dataset: wordRecognitionDataset(bundled, local), personal: local, warning }
}
export function downloadWords(input: WordDataset, fileName = 'isl-words.json') {
  const url = URL.createObjectURL(new Blob([serializeWordDataset(input)], { type: 'application/json' }))
  const link = document.createElement('a')
  link.href = url; link.download = fileName; link.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
