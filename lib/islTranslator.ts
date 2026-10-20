import { textToGloss } from '@/components/avatar/textToGloss'
import { MAX_ONLINE_TEXT_LENGTH, sanitizeTokens } from './islVocabulary'

export type TranslationMode = 'online' | 'offline'

export type TranslationResult = {
  /** Canonical, avatar-playable gloss tokens. */
  tokens: string[]
  /** `tokens` joined by a space — pass this straight to <AvatarPlayer phrase>. */
  glossText: string
  /** Which pipeline produced the result. */
  mode: TranslationMode
  /** Input words the offline engine could not sign at all (unsupported scripts, emoji). */
  skipped?: string[]
}

// Latin, Devanagari, general punctuation and whitespace are signable or safely
// ignorable; any other script is reported back instead of disappearing.
const UNSUPPORTED_CHARACTER = /[^\u0000-ɏऀ-ॿ -⁯\s]/

export function unsupportedWords(text: string): string[] {
  return text.split(/\s+/).filter((word) => UNSUPPORTED_CHARACTER.test(word))
}

const API_ENDPOINT = '/api/translate-isl'
const API_TIMEOUT_MS = 3000

/** Raised when a translation is deliberately superseded by a newer request. */
export class TranslationAbortedError extends Error {
  constructor() {
    super('translation aborted')
    this.name = 'TranslationAbortedError'
  }
}

/**
 * Deterministic offline rule-based translation via `textToGloss`. Never throws;
 * always returns tokens the avatar can play.
 */
export function translateOffline(text: string): TranslationResult {
  const skipped = unsupportedWords(text)
  try {
    const result = textToGloss(text) as { tokens?: string[]; glossText?: string }
    const tokens = sanitizeTokens(result?.tokens ?? [])
    if (tokens.length > 0) {
      return { tokens, glossText: tokens.join(' '), mode: 'offline', skipped }
    }
  } catch (error) {
    console.warn('[ISL] offline engine threw, falling back to raw text:', error)
  }
  const fallback = sanitizeTokens(text.toUpperCase().split(/\s+/))
  return { tokens: fallback, glossText: fallback.join(' '), mode: 'offline', skipped }
}

function isOffline(): boolean {
  return typeof navigator !== 'undefined' && navigator.onLine === false
}

/**
 * Hybrid translation bridge.
 *
 * Default path: call the Gemini-backed API route. It is raced against a 3s
 * timeout and against `externalSignal` (used by the caller to cancel a stale
 * request when the user submits again). On timeout, network error, HTTP error,
 * offline, or an empty response it transparently falls back to the offline
 * rule-based engine so the avatar never stalls.
 *
 * Throws `TranslationAbortedError` only when `externalSignal` aborts — that
 * means a newer translation has taken over and this result should be ignored.
 */
export async function translateToGloss(
  text: string,
  externalSignal?: AbortSignal,
): Promise<TranslationResult> {
  const trimmed = text.trim()
  if (!trimmed) return { tokens: [], glossText: '', mode: 'offline' }

  if (externalSignal?.aborted) throw new TranslationAbortedError()
  if (isOffline()) return translateOffline(trimmed)
  // The online route rejects longer text; sign all of it offline instead of a prefix.
  if (trimmed.length > MAX_ONLINE_TEXT_LENGTH) return translateOffline(trimmed)

  const controller = new AbortController()
  const abortForExternal = () => controller.abort()
  externalSignal?.addEventListener('abort', abortForExternal)
  const timeoutId = setTimeout(() => controller.abort(), API_TIMEOUT_MS)

  try {
    const response = await fetch(API_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: trimmed }),
      signal: controller.signal,
      cache: 'no-store',
    })

    if (!response.ok) {
      throw new Error(`translate-isl responded ${response.status}`)
    }

    const data = (await response.json()) as { tokens?: unknown; error?: string }
    const tokens = sanitizeTokens(data?.tokens)
    if (tokens.length === 0) {
      throw new Error(data?.error || 'translate-isl returned no tokens')
    }

    return { tokens, glossText: tokens.join(' '), mode: 'online' }
  } catch (error) {
    // The caller cancelled this request because a newer one started.
    if (externalSignal?.aborted) throw new TranslationAbortedError()

    const reason = error instanceof Error ? error.message : String(error)
    const timedOut = controller.signal.aborted
    console.warn(
      `[ISL] AI translation ${timedOut ? 'timed out' : 'failed'} (${reason}); using offline engine.`,
    )
    return translateOffline(trimmed)
  } finally {
    clearTimeout(timeoutId)
    externalSignal?.removeEventListener('abort', abortForExternal)
  }
}
