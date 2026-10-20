import type { Provenance } from './provenance'

export type Landmark = { x: number; y: number; z: number; visibility?: number }
export type TokenKind = 'word' | 'letter' | 'number'
/** Which recogniser produced a sign. Scores from different sources are not comparable. */
export type SignSource = 'word-model' | 'personal-words' | 'thumbs-up-shortcut' | 'letters-numbers'
export type SignCandidate = { label: string; confidence: number; id?: string; kind?: TokenKind; source?: SignSource }
export type SignerObservation = {
  schema: 'signer-frame-v2'; normalization: 'shoulder-xy-local-hand-z-v1'; pose: Landmark[]; face: Landmark[]
  hands: { id: string; side: 'left' | 'right' | 'unknown'; landmarks: readonly Landmark[]; bodyRelative: Landmark[] | null; palmNormal: Landmark | null }[]
  faceBlendshapes: Record<string, number>; headTransform: number[] | null
  elbows: { left: number | null; right: number | null }
  masks: { torso: boolean; face: boolean; leftElbow: boolean; rightElbow: boolean }
  quality: string[]
}
export type SignFrame = { hands: readonly (readonly Landmark[])[]; timestamp: number; gestures?: readonly { name: string; score: number }[]; signer?: SignerObservation }
export type SignPrediction = { label: string | null; confidence: number; completed?: boolean
  wordEvent?: 'ready' | 'collecting' | 'matching' | 'uncertain' | 'committed'
  candidates?: SignCandidate[]; progress?: number; kind?: TokenKind; routing?: string; source?: SignSource }

export interface SignRecognizer {
  init(): Promise<void>
  predict(frame: SignFrame): SignPrediction
}

/** `relation`: two-hand samples only, see extractRelation(). Older samples may lack it. */
export type SignSample = { id: string; label: string; features: number[]; relation?: number[]; recordedAt?: number } & Provenance
export type SignDataset = { version: 1; normalization: 'wrist-maxdist-v1'; samples: SignSample[] } & Provenance
/** One committed recognition. `score` is the source model's own score, named by
 * `basis`; it is not a calibrated probability that the sign is correct.
 * The time span runs from the start of the hands-visible segment to the commit. */
export type SignEvent = {
  id: string; kind: TokenKind; canonical: string; text: string; source: SignSource
  commit: 'automatic' | 'confirmed'; startedAt: number; endedAt: number
  score?: { value: number; basis: string }
}
/** Every character of one sign shares its `sign`; typed characters have none. */
export type TranscriptToken = { id: string; text: string; kind?: TokenKind; sign?: SignEvent }
