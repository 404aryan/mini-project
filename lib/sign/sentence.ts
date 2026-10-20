export type SentenceRequest = { tokens: string[]; language: 'en-IN' | 'hi-IN'; keep: string[] }

const contains = (text: string, term: string) => new RegExp(`(^|[^\\p{L}\\p{M}\\p{N}])${term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?=$|[^\\p{L}\\p{M}\\p{N}])`, 'iu').test(text)

/** Only explicit text tokens are accepted; frame/landmark payloads are rejected.
 * `keep` lists fingerspelled terms from that same text, which cleanup must copy exactly. */
export function sentenceRequest(input: unknown): SentenceRequest {
  if (!input || typeof input !== 'object') throw new Error('Send text tokens and an output language.')
  const value = input as Record<string, unknown>
  if (Object.keys(value).some((key) => key !== 'tokens' && key !== 'language' && key !== 'keep')
    || !Array.isArray(value.tokens) || !value.tokens.length || value.tokens.length > 1200
    || !value.tokens.every((token) => typeof token === 'string' && /^[\p{L}\p{M}\p{N} .,!?'-]$/u.test(token))
    || (value.language !== 'en-IN' && value.language !== 'hi-IN')) throw new Error('Send at most 1,200 text characters and choose English or Hindi.')
  const tokens = value.tokens as string[]
  const raw = tokens.join('')
  if (!raw.trim()) throw new Error('Add some text first.')
  const keep = value.keep ?? []
  if (!Array.isArray(keep) || keep.length > 100 || keep.join('').length > raw.length
    || !keep.every((term) => typeof term === 'string' && /^[\p{L}\p{M}\p{N}]{1,60}$/u.test(term) && contains(raw, term))) throw new Error('Protected terms must be words from the same text.')
  return { tokens, language: value.language, keep: keep as string[] }
}

/** The subset of `terms` a request accepts: whole words of `raw`, within the size limits. */
export function protectedTerms(raw: string, terms: readonly string[]) {
  const kept: string[] = []
  let length = 0
  for (const term of terms) {
    if (kept.length >= 100 || length + term.length > raw.length || !/^[\p{L}\p{M}\p{N}]{1,60}$/u.test(term) || !contains(raw, term)) continue
    kept.push(term); length += term.length
  }
  return kept
}

export function formatTokens(tokens: string[]) {
  const text = tokens.join('').replace(/\s+/g, ' ').trim()
  return /[.!?।]$/.test(text) ? text : `${text}.`
}

const NEGATION = /(^|[^\p{L}\p{M}])(no|not|never|nothing|none|nobody|neither|nor|cannot|dont|cant|नहीं|मत|ना|न)(?=$|[^\p{L}\p{M}])|n['’]t(?=$|[^\p{L}])/iu
const numbers = (text: string) => text.replace(/[०-९]/g, (digit) => String(digit.charCodeAt(0) - 0x966)).match(/\d+/g) ?? []
const count = (values: string[], value: string) => values.filter((entry) => entry === value).length

/** A suggested sentence may not change spelled words, quantities or negation.
 * Returns readable problems; an empty list means none of these checks failed.
 * This is a safety net, not proof that the suggestion keeps the signer's meaning. */
export function reviewSentence(raw: string, suggestion: string, keep: readonly string[] = []): string[] {
  const issues: string[] = []
  for (const term of keep) if (!contains(suggestion, term)) issues.push(`changes or drops the spelled word ${term}`)
  const before = numbers(raw), after = numbers(suggestion)
  for (const value of new Set(before)) if (count(after, value) < count(before, value)) issues.push(`changes or drops the number ${value}`)
  for (const value of new Set(after)) if (count(after, value) > count(before, value)) issues.push(`adds the number ${value}`)
  const negatedBefore = NEGATION.test(raw), negatedAfter = NEGATION.test(suggestion)
  if (negatedBefore && !negatedAfter) issues.push('drops a negation')
  if (!negatedBefore && negatedAfter) issues.push('adds a negation')
  return issues
}
