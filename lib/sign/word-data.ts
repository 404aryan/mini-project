import { FEATURE_LENGTH, featureHandCount } from './features'
import { WORD_SIGNS } from '../islVocabulary'
import { readProvenance, sampleProvenance, type Provenance } from './provenance'

export const WORD_LABELS: readonly string[] = WORD_SIGNS.map(sign => sign.label)
export const WORD_FRAMES = 30
export const WORD_FEATURE_LENGTH = FEATURE_LENGTH + 6
export const WORD_NORMALIZATION = 'sequence-wrist-motion-v1' as const
export const MIN_WORD_SAMPLES = 3
export const MAX_WORD_SAMPLES = 5
export const MAX_WORD_FILE_BYTES = 64 * 1024 * 1024
/** The recorder keeps frames at least this far apart... */
export const WORD_MIN_FRAME_GAP_MS = 65
/** ...and stops on a longer stall, so a saved motion always lasts between these bounds. */
export const WORD_MAX_FRAME_GAP_MS = 250
export const MIN_WORD_DURATION_MS = 1400
export const MAX_WORD_DURATION_MS = (WORD_FRAMES - 1) * WORD_MAX_FRAME_GAP_MS
export type WordSample = { id: string; label: string; handCount: 1 | 2; durationMs: number; frames: number[][]; recordedAt?: number } & Provenance
export type WordDataset = { version: 1; normalization: typeof WORD_NORMALIZATION; samples: WordSample[] } & Provenance
// Six decimals keep landmark precision far below tracking noise while
// keeping a full library export well under the import size limit.
const round = (value: number) => Math.round(value * 1e6) / 1e6 || 0
export function emptyWordDataset(): WordDataset { return { version: 1, normalization: WORD_NORMALIZATION, samples: [] } }

export function trainedWordLabels(samples: readonly WordSample[]) {
  const counts = new Map<string, number>()
  samples.forEach((sample) => { const key = `${sample.label}:${sample.handCount}`; counts.set(key, (counts.get(key) ?? 0) + 1) })
  return [...new Set(samples.filter((sample) => counts.get(`${sample.label}:${sample.handCount}`)! >= MIN_WORD_SAMPLES).map((sample) => sample.label))].sort()
}

/** Keep private recordings intact in storage. At recognition time, a trained
 * personal word replaces the baseline; incomplete words keep bundled coverage. */
export function wordRecognitionDataset(bundled: WordDataset, local: WordDataset): WordDataset {
  const personal = new Set(trainedWordLabels(local.samples)), samples: WordSample[] = []
  for (const label of WORD_LABELS) {
    const saved = local.samples.filter((sample) => sample.label === label)
    const ids = new Set(saved.map((sample) => sample.id))
    const baseline = bundled.samples.filter((sample) => sample.label === label && !ids.has(sample.id))
    samples.push(...(personal.has(label) ? saved : [...baseline.slice(0, MIN_WORD_SAMPLES), ...saved, ...baseline.slice(MIN_WORD_SAMPLES)]).slice(0, MAX_WORD_SAMPLES))
  }
  return parseWordDataset({ ...emptyWordDataset(), samples })
}

/** Separate format: old static-pose files remain unchanged and cannot be misread as words. */
export function parseWordDataset(input: unknown): WordDataset {
  if (!input || typeof input !== 'object') throw new Error('Choose a versioned word recording file.')
  const value = input as Partial<WordDataset>
  if (value.version !== 1 || value.normalization !== WORD_NORMALIZATION || !Array.isArray(value.samples)) throw new Error('Choose a sequence-wrist-motion-v1 word file. Letters use their own sample format.')
  if (value.samples.length > WORD_LABELS.length * MAX_WORD_SAMPLES) throw new Error(`Import at most ${WORD_LABELS.length * MAX_WORD_SAMPLES} word recordings.`)
  const ids = new Set<string>(), counts = new Map<string, number>()
  const samples = value.samples.map((input, index) => {
    const sample = input && Array.isArray(input.frames) ? { ...input, frames: input.frames.map((frame) => Array.isArray(frame) ? frame.map((n) => typeof n === 'number' ? round(n) : n) : frame) } : input
    if (!sample || typeof sample.id !== 'string' || !sample.id || sample.id.length > 100 || ids.has(sample.id)
      || !WORD_LABELS.some((label) => label === sample.label) || (sample.handCount !== 1 && sample.handCount !== 2)
      || !Number.isFinite(sample.durationMs) || sample.durationMs < MIN_WORD_DURATION_MS || sample.durationMs > MAX_WORD_DURATION_MS
      || (sample.recordedAt !== undefined && (!Number.isFinite(sample.recordedAt) || sample.recordedAt < 0))
      || !Array.isArray(sample.frames) || sample.frames.length !== WORD_FRAMES
      || !sample.frames.every((frame) => Array.isArray(frame) && frame.length === WORD_FEATURE_LENGTH
        && frame.every((n, i) => typeof n === 'number' && Number.isFinite(n) && Math.abs(n) <= (i < FEATURE_LENGTH ? 1.00001 : 12))
        && featureHandCount(frame.slice(0, FEATURE_LENGTH)) === sample.handCount
        && (sample.handCount === 2 || frame.slice(63, 126).every((n) => n === 0) && frame.slice(129).every((n) => n === 0)))
      || sample.frames[0].slice(126).some((n) => Math.abs(n) > 1e-6)) throw new Error(`Word recording ${index + 1} is invalid. Use 30 real frames with 132 finite features and a consistent hand count.`)
    ids.add(sample.id)
    const count = (counts.get(sample.label) ?? 0) + 1
    if (count > MAX_WORD_SAMPLES) throw new Error(`Keep at most ${MAX_WORD_SAMPLES} recordings for ${sample.label}. Delete a poor recording before adding another.`)
    counts.set(sample.label, count)
    return { id: sample.id, label: sample.label, handCount: sample.handCount, durationMs: sample.durationMs, frames: sample.frames.map((frame) => [...frame]), ...(sample.recordedAt !== undefined ? { recordedAt: sample.recordedAt } : {}), ...readProvenance(sample) }
  })
  return { ...readProvenance(value), ...emptyWordDataset(), samples }
}

/** Compact JSON, so any library the parser accepts also fits the import limit. */
export function serializeWordDataset(input: WordDataset) {
  return JSON.stringify(parseWordDataset(input))
}

export function mergeWordDatasets(current: WordDataset, incoming: WordDataset): WordDataset {
  const previous = parseWordDataset(current), next = parseWordDataset(incoming), origin = sampleProvenance(next)
  const records = new Map(previous.samples.map((sample) => [sample.id, sample]))
  for (const sample of next.samples) {
    const existing = records.get(sample.id)
    if (existing && (existing.label !== sample.label || existing.handCount !== sample.handCount || existing.durationMs !== sample.durationMs
      || existing.frames.some((frame, i) => frame.some((n, j) => n !== sample.frames[i][j])))) throw new Error(`Word recording ID “${sample.id}” already has different motion. Nothing was changed.`)
    if (!existing) records.set(sample.id, { ...origin, ...sample })
  }
  return parseWordDataset({ ...emptyWordDataset(), ...readProvenance(previous), samples: [...records.values()] })
}
