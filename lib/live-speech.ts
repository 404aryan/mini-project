// Pure helpers for turning Web Speech results into live sign chunks. Kept free
// of React and browser globals so the commit rules can be tested directly.

export type SpeechResultLike = ArrayLike<{ transcript: string }> & { isFinal?: boolean }

export type HeardSpeech = {
  transcript: string
  words: string[]
  /** Words belonging to the leading run of final results. */
  finalWordCount: number
  /** True when no result in the list is still interim. */
  allFinal: boolean
}

/** Joins every result segment with one space; providers do not guarantee separators. */
export function readSpeechResults(results: ArrayLike<SpeechResultLike>): HeardSpeech {
  const segments: string[] = []
  let finalWordCount = 0
  let allFinal = true
  for (let index = 0; index < results.length; index += 1) {
    const result = results[index]
    const text = (result[0]?.transcript || '').replace(/\s+/g, ' ').trim()
    if (!result.isFinal) allFinal = false
    if (!text) continue
    segments.push(text)
    if (result.isFinal && allFinal) finalWordCount += text.split(' ').length
  }
  const transcript = segments.join(' ')
  return { transcript, words: transcript ? transcript.split(' ') : [], finalWordCount, allFinal }
}

const sameWord = (left: string, right: string) =>
  left.toLowerCase().replace(/[.,!?;:"]/g, '') === right.toLowerCase().replace(/[.,!?;:"]/g, '')

/**
 * Decides which newly heard words to sign. Final words are committed at once;
 * the last interim word, and any trailing words that may still grow into a
 * multi-word sign (THANK YOU, HOW MUCH…), are held until the next update.
 * When the recognizer revises a word that was already signed, the corrected
 * words from the first difference onward are sent again.
 */
export function planLiveCommit(
  committed: readonly string[],
  heard: Pick<HeardSpeech, 'words' | 'finalWordCount' | 'allFinal'>,
  phraseHoldBack: (words: string[]) => number = () => 0,
): { chunk: string; committed: string[] } {
  const { words, allFinal } = heard
  const finalWords = Math.min(heard.finalWordCount, words.length)
  let stable = words.length
  if (!allFinal) {
    stable = finalWords + Math.max(0, words.length - finalWords - 1)
    stable = Math.max(finalWords, stable - phraseHoldBack(words.slice(0, stable)))
  }
  const target = words.slice(0, stable)
  let shared = 0
  while (shared < committed.length && shared < target.length && sameWord(committed[shared], target[shared])) shared += 1
  // A shorter, consistent hypothesis: keep what was signed and wait for more.
  if (shared === target.length) return { chunk: '', committed: [...committed] }
  return { chunk: target.slice(shared).join(' '), committed: target }
}

/** Adds a finished recognition session to the visible history, keeping the newest words. */
export function appendSpeechHistory(history: string, transcript: string, maxWords = 80) {
  const words = `${history} ${transcript}`.trim().split(/\s+/).filter(Boolean)
  return words.slice(-maxWords).join(' ')
}
