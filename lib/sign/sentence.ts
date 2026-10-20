export type SentenceRequest = { tokens: string[]; language: 'en-IN' | 'hi-IN' }

/** Only explicit text tokens are accepted; frame/landmark payloads are rejected. */
export function sentenceRequest(input: unknown): SentenceRequest {
  if (!input || typeof input !== 'object') throw new Error('Send text tokens and an output language.')
  const value = input as Record<string, unknown>
  if (Object.keys(value).some((key) => key !== 'tokens' && key !== 'language')
    || !Array.isArray(value.tokens) || !value.tokens.length || value.tokens.length > 1200
    || !value.tokens.every((token) => typeof token === 'string' && /^[\p{L}\p{M}\p{N} .,!?'-]$/u.test(token))
    || (value.language !== 'en-IN' && value.language !== 'hi-IN')) throw new Error('Send at most 1,200 text characters and choose English or Hindi.')
  const tokens = value.tokens as string[]
  if (!tokens.join('').trim()) throw new Error('Add some text first.')
  return { tokens, language: value.language }
}

export function formatTokens(tokens: string[]) {
  const text = tokens.join('').replace(/\s+/g, ' ').trim()
  return /[.!?।]$/.test(text) ? text : `${text}.`
}
