import { NextResponse } from 'next/server'
import { GoogleGenAI, Type } from '@google/genai'
import { MAX_ONLINE_TEXT_LENGTH, SUPPORTED_TOKENS, sanitizeTokens } from '@/lib/islVocabulary'
import { BodyTooLargeError, clientKey, createConcurrencyLimit, createRateLimiter, describeError, isRateLimitError, readBodyText } from '@/lib/api-guard'

// Route Handlers are never cached for POST, but be explicit: every request is a
// fresh translation that must run on the server at request time.
export const dynamic = 'force-dynamic'

const MODEL = 'gemini-2.5-flash'
// The client gives up after 3 s and signs offline; the provider call gets a
// little longer, then stops.
const PROVIDER_TIMEOUT_MS = 6000
// UTF-8 JSON for the longest accepted text, with room for escaping.
const MAX_BODY_BYTES = 8 * 1024
const perClient = createRateLimiter({ limit: 30, windowMs: 60_000 })
const perInstance = createRateLimiter({ limit: 300, windowMs: 60_000 })
const providerCalls = createConcurrencyLimit(8)

const busy = (retryAfterSeconds: number) => NextResponse.json(
  { error: 'Online translation is busy. Try again shortly.', tokens: [] },
  { status: 429, headers: { 'Retry-After': String(retryAfterSeconds) } },
)

const SYSTEM_INSTRUCTION = `You are an expert Indian Sign Language (ISL) interpreter. You convert English or Hindi (Devanagari or romanized) text into an ordered list of ISL gloss tokens for a signing avatar.

# ISL GRAMMAR (apply strictly, in this order)
1. TEMPORAL FIRST: time words (YESTERDAY, TODAY, TOMORROW, NOW, LATER, MORNING, NIGHT, TIME, ...) come first.
2. SOV ORDER: then SUBJECT, then OBJECT, then VERB. Drop articles (a, an, the), copulas (is, am, are, was, were, be), and auxiliaries (do, does, will, have).
3. NEGATION LAST-ISH: negation (not, no, never, cannot) is the token "NO" at the END of the clause, after the verb.
4. WH-QUESTIONS AT THE VERY END: question words (WHAT, WHY, WHEN, WHERE, WHO, HOW, WHICH, HOW_MUCH, HOW_MANY) always come last.
Never drop a word that carries meaning. A time word with no sign of its own is fingerspelled in the time position.
Example: "Where did you go yesterday?" -> ["Y-E-S-T-E-R-D-A-Y","YOU","GO","WHERE"].
Example: "I do not understand" -> ["I","UNDERSTAND","NO"].
Example: "मुझे पानी चाहिए" -> ["I","WATER","NEED"].

# VOCABULARY (you may ONLY output tokens from this exact list)
${JSON.stringify(SUPPORTED_TOKENS)}

# MAPPING RULES
- If an input word is not in the list, map it to the CLOSEST supported synonym. Examples: "automobile"->"CAR", "vehicle"->"CAR", "sick"/"ill"/"hurt"->"PAIN", "instructor"/"professor"->"TEACHER", "buy"/"purchase"->"TAKE", "physician"->"DOCTOR", "kid"->"CHILD", "cellphone"->"MOBILE", "restroom"/"washroom"->"TOILET", "cash"->"MONEY", "cannot"->"NO".
- Pronouns have dedicated signs: "I"/"me"/"myself"/"we"/"us" -> "I"; "my"/"mine"/"our" -> "MY"; "you" -> "YOU"; "your"/"yours" -> "YOUR". Third person "he"/"she"/"they"/"him"/"her" -> "PERSON".
- "good morning" -> ["GOOD","MORNING"]; "love"/"loves"/"loved" -> "LOVE"; "meet"/"met"/"meeting" -> "MEET".
- Multi-word signs must use the underscore form exactly as in the list: THANK_YOU, HOW_MUCH, HOW_MANY, COME_IN, GO_OUT, NEED_HELP, WAIT_MINUTE.
- PROPER NOUNS & UNKNOWNS: if a word is a person's name (e.g. "Amit"), a brand, or has no reasonable supported equivalent, output it as ONE token of uppercase letters joined by hyphens for fingerspelling, e.g. "Amit" -> "A-M-I-T". Write Hindi names in Latin letters first ("अमित" -> "A-M-I-T"). Never split a spelled word into separate one-letter tokens: a lone "I" always means the pronoun.
- NUMBERS: keep every number as digits joined by hyphens, e.g. "112" -> "1-1-2", "two books" -> ["2","BOOK"]. Never drop a quantity.
- Never invent tokens. Never output lowercase. Never output punctuation or empty strings.

# OUTPUT
Return ONLY a JSON array of strings, e.g. ["YOU","HOME","GO"]. No explanation, no markdown.`

type TranslateRequestBody = { text?: unknown }

export async function POST(request: Request) {
  const client = perClient(clientKey(request))
  if (!client.allowed) return busy(client.retryAfterSeconds)
  const instance = perInstance('all')
  if (!instance.allowed) return busy(instance.retryAfterSeconds)

  let text = ''
  try {
    const body = JSON.parse(await readBodyText(request, MAX_BODY_BYTES)) as TranslateRequestBody
    text = typeof body?.text === 'string' ? body.text.trim() : ''
  } catch (error) {
    if (error instanceof BodyTooLargeError) return NextResponse.json({ error: 'Request body is too large.', tokens: [] }, { status: 413 })
    return NextResponse.json({ error: 'Request body must be valid JSON.', tokens: [] }, { status: 400 })
  }

  if (!text) {
    return NextResponse.json({ error: 'Missing "text" field.', tokens: [] }, { status: 400 })
  }
  // Never translate only a prefix: the client signs longer text offline, whole.
  if (text.length > MAX_ONLINE_TEXT_LENGTH) {
    return NextResponse.json({ error: `Online translation accepts up to ${MAX_ONLINE_TEXT_LENGTH} characters.`, tokens: [] }, { status: 413 })
  }

  const apiKey = process.env.GEMINI_API_KEY
  if (!apiKey) {
    return NextResponse.json({ error: 'Online translation is not configured.', tokens: [] }, { status: 503 })
  }
  const release = providerCalls.acquire()
  if (!release) return busy(1)

  try {
    const ai = new GoogleGenAI({ apiKey })
    const response = await ai.models.generateContent({
      model: MODEL,
      contents: text,
      config: {
        systemInstruction: SYSTEM_INSTRUCTION,
        temperature: 0,
        // Disable multi-step "thinking" so gemini-2.5-flash replies with the
        // lowest possible latency for short conversational inputs.
        thinkingConfig: { thinkingBudget: 0 },
        responseMimeType: 'application/json',
        responseSchema: { type: Type.ARRAY, items: { type: Type.STRING } },
        // A client that disconnects stops our wait for the provider too.
        abortSignal: request.signal,
        httpOptions: { timeout: PROVIDER_TIMEOUT_MS },
      },
    })

    const raw = (response.text ?? '').trim()
    let parsed: unknown
    try {
      parsed = JSON.parse(raw || '[]')
    } catch {
      // Model output can echo user text, so only its size is logged.
      console.error(`[translate-isl] model returned a non-JSON payload (${raw.length} characters)`)
      return NextResponse.json({ error: 'Online translation failed.', tokens: [] }, { status: 502 })
    }

    const tokens = sanitizeTokens(parsed)
    if (tokens.length === 0) {
      return NextResponse.json({ error: 'Model produced no usable tokens.', tokens: [] }, { status: 422 })
    }

    return NextResponse.json({ tokens, mode: 'online', model: MODEL })
  } catch (error) {
    if (request.signal.aborted) return new NextResponse(null, { status: 499 })
    const rateLimited = isRateLimitError(error)
    console.error('[translate-isl] Gemini request failed:', describeError(error))
    return NextResponse.json(
      { error: rateLimited ? 'Online translation is busy. Try again shortly.' : 'Online translation failed.', tokens: [] },
      { status: rateLimited ? 429 : 502 },
    )
  } finally {
    release()
  }
}
