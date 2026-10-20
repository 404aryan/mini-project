/** Text fields that describe where a dataset or recording came from and how it may be used. */
export const PROVENANCE_KEYS = ['description', 'license', 'source', 'attribution'] as const
export type Provenance = Partial<Record<(typeof PROVENANCE_KEYS)[number], string>>

/**
 * Copies only the known provenance text fields, so annotated datasets keep
 * their source and license through import, storage and export.
 */
export function readProvenance(value: unknown): Provenance {
  const result: Provenance = {}
  if (!value || typeof value !== 'object') return result
  for (const key of PROVENANCE_KEYS) {
    const text = (value as Record<string, unknown>)[key]
    if (typeof text === 'string' && text.length <= 2000) result[key] = text
  }
  return result
}

/**
 * A file's license, source and attribution, copied onto each of its samples
 * when they join a library that mixes several files.
 */
export function sampleProvenance(dataset: unknown): Provenance {
  const { license, source, attribution } = readProvenance(dataset)
  return { ...(license ? { license } : {}), ...(source ? { source } : {}), ...(attribution ? { attribution } : {}) }
}
