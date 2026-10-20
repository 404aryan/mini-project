import type { SignEvent, TokenKind, TranscriptToken } from './types'
import { readableSignLabel } from '../islVocabulary'

export const MAX_TRANSCRIPT_LENGTH = 1200
const MAX_HISTORY = 50

/** Keep a word's text as characters, so limits, backspace and the text API stay consistent.
 * A boundary space belongs to the sign that needed it, so removing the sign removes both. */
export function appendRecognizedToken(current: TranscriptToken[], token: TranscriptToken, words: boolean): TranscriptToken[] {
  const word = token.kind ? token.kind === 'word' : words
  if (!word && !token.kind) return current.length < MAX_TRANSCRIPT_LENGTH ? [...current, token] : current
  const last = current.at(-1)
  const boundary = word || !!last?.kind && last.kind !== token.kind
  const prefix = boundary && last && !/\s$/.test(last.text) ? ' ' : ''
  const characters = Array.from(prefix + readableSignLabel(token.text))
  if (current.length + characters.length > MAX_TRANSCRIPT_LENGTH) return current
  return [...current, ...characters.map((text, index) => ({ id: `word-${token.id}-${index}`, text,
    ...(token.kind ? { kind: token.kind } : {}), ...(token.sign ? { sign: token.sign } : {}) }))]
}

export type TranscriptSign = { sign: SignEvent; text: string; intact: boolean }

/** Committed signs in transcript order. A sign whose characters were edited or split is not intact;
 * text typed between a sign and its own boundary space does not count as a change. */
export function transcriptSigns(tokens: readonly TranscriptToken[]): TranscriptSign[] {
  const signs = new Map<string, { sign: SignEvent; text: string; indices: number[] }>()
  tokens.forEach((token, index) => {
    if (!token.sign) return
    const entry = signs.get(token.sign.id) ?? { sign: token.sign, text: '', indices: [] }
    signs.set(token.sign.id, entry)
    if (entry.text.trim() || token.text.trim()) entry.indices.push(index)
    entry.text += token.text
  })
  return [...signs.values()].map(({ sign, text, indices }) => ({ sign, text: text.trim(),
    intact: indices.every((index, i) => !i || index === indices[i - 1] + 1) && text.trim() === readableSignLabel(sign.text) }))
}

/** Fingerspelled groups, which sentence cleanup must copy exactly (names, unknown words). */
export function spelledTerms(tokens: readonly TranscriptToken[]): string[] {
  const terms = new Set<string>()
  let term = ''
  for (const token of [...tokens, { id: '', text: ' ' }]) {
    if (token.kind === 'letter' && token.text.trim()) term += token.text
    else { if (term) terms.add(term); term = '' }
  }
  return [...terms]
}

export function removeSign(tokens: TranscriptToken[], id: string): TranscriptToken[] {
  const next = tokens.filter(token => token.sign?.id !== id)
  // Removing the first sign must not leave its successor's boundary space at the start.
  return next[0]?.text === ' ' && tokens[0]?.text !== ' ' ? next.slice(1) : next
}

/** Typed corrections keep the metadata of every untouched character before and after the change. */
export function editTokens(tokens: TranscriptToken[], text: string, serial: number): TranscriptToken[] {
  const next = Array.from(text).slice(0, MAX_TRANSCRIPT_LENGTH)
  let start = 0, end = 0
  while (start < tokens.length && start < next.length && tokens[start].text === next[start]) start++
  if (start === tokens.length && start === next.length) return tokens
  while (end < tokens.length - start && end < next.length - start && tokens[tokens.length - 1 - end].text === next[next.length - 1 - end]) end++
  const typed = next.slice(start, next.length - end).map((char, index) => ({ id: `manual-${serial}-${index}`, text: char }))
  return [...tokens.slice(0, start), ...typed, ...tokens.slice(tokens.length - end)]
}

export type TranscriptState = {
  tokens: TranscriptToken[]
  /** Earlier transcripts, newest last, each with the change that replaced it. */
  history: { tokens: TranscriptToken[]; label: string }[]
  serial: number
  /** Consecutive keystrokes in the editor form one undo step. */
  editing: boolean
  /** Polite screen reader message for the latest committed change only. */
  announcement: { text: string; serial: number }
}
export type TranscriptAction =
  | { type: 'commit'; token: TranscriptToken; words: boolean }
  | { type: 'space' } | { type: 'backspace' } | { type: 'clear' } | { type: 'undo' }
  | { type: 'remove'; id: string } | { type: 'edit'; text: string } | { type: 'edit-done' }

export const emptyTranscript: TranscriptState = { tokens: [], history: [], serial: 0, editing: false, announcement: { text: '', serial: 0 } }

export const describeSign = (kind: TokenKind | undefined, text: string) => kind === 'letter' ? `letter ${text}` : kind === 'number' ? `number ${text}` : text

export function transcriptReducer(state: TranscriptState, action: TranscriptAction): TranscriptState {
  const serial = state.serial + 1
  const change = (tokens: TranscriptToken[], label: string, announce?: string): TranscriptState => tokens === state.tokens ? state : {
    tokens, serial, editing: false,
    history: [...state.history, { tokens: state.tokens, label }].slice(-MAX_HISTORY),
    announcement: announce ? { text: announce, serial } : state.announcement,
  }
  switch (action.type) {
    case 'commit': {
      const name = describeSign(action.token.kind, readableSignLabel(action.token.text))
      const tokens = appendRecognizedToken(state.tokens, action.token, action.words)
      if (tokens === state.tokens) return { ...state, serial, announcement: { text: `Transcript is full. ${name} was not added.`, serial } }
      return change(tokens, name, `Added ${name}`)
    }
    case 'space':
      return state.tokens.length && state.tokens.length < MAX_TRANSCRIPT_LENGTH ? change([...state.tokens, { id: `manual-${serial}`, text: ' ' }], 'space') : state
    case 'backspace': {
      const last = state.tokens.at(-1)
      return last ? change(state.tokens.slice(0, -1), 'backspace', `Deleted ${last.text === ' ' ? 'space' : last.text}`) : state
    }
    case 'clear':
      return change(state.tokens.length ? [] : state.tokens, 'clear', 'Transcript cleared')
    case 'remove': {
      const sign = state.tokens.find(token => token.sign?.id === action.id)?.sign
      if (!sign) return state
      const name = describeSign(sign.kind, sign.text)
      return change(removeSign(state.tokens, action.id), `removing ${name}`, `Removed ${name}`)
    }
    case 'edit': {
      const tokens = editTokens(state.tokens, action.text, serial)
      if (tokens === state.tokens) return state
      return state.editing ? { ...state, tokens, serial } : { ...change(tokens, 'text edit'), editing: true }
    }
    case 'edit-done':
      return state.editing ? { ...state, editing: false } : state
    case 'undo': {
      const entry = state.history.at(-1)
      if (!entry) return state
      return { tokens: entry.tokens, history: state.history.slice(0, -1), serial, editing: false, announcement: { text: `Undid ${entry.label}`, serial } }
    }
  }
}
