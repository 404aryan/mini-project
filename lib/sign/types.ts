export type Landmark = { x: number; y: number; z: number }
export type SignFrame = { hands: readonly (readonly Landmark[])[]; timestamp: number }
export type SignPrediction = { label: string | null; confidence: number; completed?: boolean
  wordEvent?: 'ready' | 'collecting' | 'matching' | 'uncertain' | 'committed'
  candidates?: { label: string; confidence: number }[]; progress?: number }

export interface SignRecognizer {
  init(): Promise<void>
  predict(frame: SignFrame): SignPrediction
}

export type SignSample = { id: string; label: string; features: number[]; recordedAt?: number }
export type SignDataset = { version: 1; normalization: 'wrist-maxdist-v1'; samples: SignSample[] }
export type TranscriptToken = { id: string; text: string }
