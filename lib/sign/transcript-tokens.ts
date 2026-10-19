import type { TranscriptToken } from './types'

/** Keep a word's text as characters, so limits, backspace and the text API stay consistent. */
export function appendRecognizedToken(current: TranscriptToken[], token: TranscriptToken, words: boolean): TranscriptToken[] {
  if (!words) return current.length < 1200 ? [...current, token] : current
  const prefix = current.length && !/\s$/.test(current[current.length - 1].text) ? ' ' : ''
  const characters = Array.from(prefix + token.text)
  if (current.length + characters.length > 1200) return current
  return [...current, ...characters.map((text, index) => ({ id: `word-${token.id}-${index}`, text }))]
}
