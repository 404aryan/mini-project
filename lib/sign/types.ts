import type { Provenance } from './provenance'

export type Landmark = { x: number; y: number; z: number }
export type SignFrame = { hands: readonly (readonly Landmark[])[]; timestamp: number; gestures?: readonly { name: string; score: number }[] }
export type SignPrediction = { label: string | null; confidence: number; completed?: boolean
  wordEvent?: 'ready' | 'collecting' | 'matching' | 'uncertain' | 'committed'
  candidates?: { label: string; confidence: number }[]; progress?: number }

export interface SignRecognizer {
  init(): Promise<void>
  predict(frame: SignFrame): SignPrediction
}

/** `relation`: two-hand samples only, see extractRelation(). Older samples may lack it. */
export type SignSample = { id: string; label: string; features: number[]; relation?: number[]; recordedAt?: number } & Provenance
export type SignDataset = { version: 1; normalization: 'wrist-maxdist-v1'; samples: SignSample[] } & Provenance
export type TranscriptToken = { id: string; text: string }
