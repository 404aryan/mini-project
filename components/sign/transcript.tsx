'use client'

import { memo, useCallback, useEffect, useMemo, useRef, useState, type Dispatch } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { usePrefersReducedMotion } from '@/lib/sign/use-reduced-motion'
import { Check, Copy, Delete, Pencil, Space, Sparkles, Square, Trash2, Undo2, Volume2, X } from 'lucide-react'
import { speakText, speechVoices, type SpeechLanguage } from '@/lib/sign/tts'
import { protectedTerms, reviewSentence } from '@/lib/sign/sentence'
import { describeSign, spelledTerms, transcriptSigns, type TranscriptAction, type TranscriptState } from '@/lib/sign/transcript-tokens'
import type { SignCandidate, SignEvent, TranscriptToken } from '@/lib/sign/types'

const SOURCE_LABELS: Record<SignEvent['source'], string> = {
  'word-model': 'built-in word model', 'personal-words': 'your recordings',
  'thumbs-up-shortcut': 'thumbs-up app gesture', 'letters-numbers': 'handshape library',
}
const commitLabel = (sign: SignEvent) => sign.commit === 'confirmed' ? 'you confirmed' : 'added automatically'

export function Transcript({ active, transcript, dispatch, wordMode = false, feedback, feedbackLive = false, candidates = [], onAcceptCandidate }: {
  active: boolean; transcript: TranscriptState; dispatch: Dispatch<TranscriptAction>
  wordMode?: boolean
  feedback?: string; feedbackLive?: boolean; candidates?: SignCandidate[]; onAcceptCandidate?: (label: string) => void
}) {
  const tokens = transcript.tokens
  const raw = tokens.map((t) => t.text).join('')
  const signs = useMemo(() => transcriptSigns(tokens), [tokens])
  const lastSign = signs.at(-1)
  const undo = transcript.history.at(-1)
  const [editing, setEditing] = useState(false)
  const [language, setLanguage] = useState<SpeechLanguage>('en-IN')
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([])
  const [voiceId, setVoiceId] = useState('')
  const [speechSupported, setSpeechSupported] = useState(false)
  const [speaking, setSpeaking] = useState<'transcript' | 'suggestion' | null>(null)
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState('')
  const [copied, setCopied] = useState<'transcript' | 'suggestion' | null>(null)
  const [cleaned, setCleaned] = useState<{ raw: string; language: SpeechLanguage; text: string; engine: string; issues: string[] } | null>(null)
  const cancelSpeech = useRef<(() => void) | null>(null)
  const requestRef = useRef<AbortController | null>(null)
  const copyTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const latestRaw = useRef(raw)
  latestRaw.current = raw
  // A suggestion belongs to the exact text and language it was made from.
  const visibleCleaned = cleaned?.raw === raw && cleaned.language === language ? cleaned : null

  const stop = useCallback(() => { cancelSpeech.current?.(); cancelSpeech.current = null; setSpeaking(null) }, [])
  useEffect(() => {
    if (!active) return
    const supported = 'speechSynthesis' in window
    setSpeechSupported(supported)
    const refresh = () => { setVoices(speechVoices(language)); setVoiceId('') }
    refresh()
    if (supported) speechSynthesis.addEventListener('voiceschanged', refresh)
    const hidden = () => { if (document.hidden) stop() }
    document.addEventListener('visibilitychange', hidden)
    window.addEventListener('pagehide', stop)
    return () => {
      if (supported) speechSynthesis.removeEventListener('voiceschanged', refresh)
      document.removeEventListener('visibilitychange', hidden)
      window.removeEventListener('pagehide', stop)
      stop(); requestRef.current?.abort(); requestRef.current = null; setBusy(false)
      if (copyTimer.current) clearTimeout(copyTimer.current)
    }
  }, [active, language, stop])
  useEffect(() => {
    stop(); requestRef.current?.abort(); requestRef.current = null; setBusy(false); setNotice(''); setCopied(null)
  }, [raw, language, stop])

  const copy = async (text: string, which: 'transcript' | 'suggestion') => {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(which)
      if (copyTimer.current) clearTimeout(copyTimer.current)
      copyTimer.current = setTimeout(() => setCopied(null), 1800)
    } catch { setNotice('Copy is unavailable here. Use Edit text to select and copy the raw transcript.') }
  }

  const sentence = async () => {
    requestRef.current?.abort()
    const controller = new AbortController()
    requestRef.current = controller
    setBusy(true); setNotice('')
    const timeout = setTimeout(() => controller.abort(), 15000)
    const keep = protectedTerms(raw, spelledTerms(tokens))
    try {
      const response = await fetch('/api/sign/sentence', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, signal: controller.signal,
        body: JSON.stringify({ tokens: Array.from(raw), language, keep }),
      })
      const result = await response.json()
      if (!response.ok || typeof result.text !== 'string') throw new Error(result.error || 'Sentence cleanup is unavailable.')
      if (controller.signal.aborted || latestRaw.current !== raw) return
      setCleaned({ raw, language, text: result.text, engine: result.engine, issues: reviewSentence(raw, result.text, keep) })
      setNotice(result.notice ?? '')
    } catch (error) {
      if (requestRef.current === controller && latestRaw.current === raw) setNotice(controller.signal.aborted ? 'Sentence cleanup paused or timed out. Your raw text is safe.' : error instanceof Error ? error.message : 'Sentence cleanup is unavailable.')
    } finally {
      clearTimeout(timeout)
      if (requestRef.current === controller) { requestRef.current = null; setBusy(false) }
    }
  }

  const speak = (text: string, which: 'transcript' | 'suggestion') => {
    if (speaking === which) { stop(); return }
    cancelSpeech.current?.()
    setNotice('')
    try {
      cancelSpeech.current = speakText(text, language, voices.find((v) => v.voiceURI === voiceId) ?? voices[0], (state) => {
        setSpeaking(state === 'speaking' ? which : null)
        if (state === 'error') setNotice('This voice could not speak. Try another installed voice.')
      })
    } catch { setNotice('Speech is unavailable. Try another voice or browser.') }
  }

  const toggleEditing = () => {
    if (editing) dispatch({ type: 'edit-done' })
    setEditing((value) => !value)
  }

  return <section className="sign-transcript" aria-labelledby="sign-transcript-title">
    <h3 id="sign-transcript-title" className="sign-sr-only">Live transcript</h3>
    {(feedback || lastSign) && <div className="sign-transcript-heading">
      {feedback ? <div className="sign-transcript-feedback" role={feedbackLive ? 'status' : undefined}><span className="dock-live-dot" />{feedback}</div> : <span />}
      {lastSign && <span className="sign-last-sign">Last: <strong>{lastSign.sign.text}</strong> · {lastSign.sign.kind} · {commitLabel(lastSign.sign)}{lastSign.intact ? '' : ' · edited'}</span>}
    </div>}
    {wordMode && candidates.length > 0 && onAcceptCandidate && <div className="sign-suggestions" aria-label="Possible sign matches, not added yet"><span>Possible match · not added until you tap it</span>{candidates.map(candidate => <button key={candidate.id ?? candidate.label} type="button" onClick={() => onAcceptCandidate(candidate.id ?? candidate.label)}>{candidate.label}<small>{candidate.kind ?? 'word'}</small></button>)}</div>}
    {/* Committed changes only: never every inference frame or the whole transcript. */}
    <span className="sign-sr-only" aria-live="polite" aria-atomic="true"><span key={transcript.announcement.serial}>{transcript.announcement.text}</span></span>
    <div className="sign-text-actions" role="group" aria-label="Transcript controls">
      <button type="button" onClick={() => dispatch({ type: 'space' })} disabled={!raw || tokens.length >= 1200}><Space size={14} /> Space</button>
      <button type="button" onClick={() => dispatch({ type: 'backspace' })} disabled={!raw}><Delete size={14} /> Backspace</button>
      <button type="button" onClick={() => dispatch({ type: 'undo' })} disabled={!undo} aria-label={undo ? `Undo ${undo.label}` : 'Undo'}><Undo2 size={14} /> Undo</button>
      <button type="button" onClick={() => dispatch({ type: 'clear' })} disabled={!raw}><Trash2 size={13} /> Clear</button>
      <button type="button" onClick={() => copy(raw, 'transcript')} disabled={!raw.trim()}>{copied === 'transcript' ? <Check size={13} /> : <Copy size={13} />} {copied === 'transcript' ? 'Copied' : 'Copy'}</button>
      <button type="button" onClick={toggleEditing} aria-expanded={editing}><Pencil size={12} /> Edit text</button>
      <button type="button" className="sign-speak-button" onClick={() => speak(raw, 'transcript')} disabled={!raw.trim() || !speechSupported}>{speaking === 'transcript' ? <Square size={13} /> : <Volume2 size={14} />} {speaking === 'transcript' ? 'Stop' : 'Speak'}</button>
      <span className="sign-token-count">{tokens.length} / 1200</span>
    </div>
    {editing && <div className="sign-edit-panel">
      <label className="sign-edit-label">Edit raw text <span>Typed text is added by you. Untouched signs keep their details.</span><textarea aria-label="Edit raw transcript" maxLength={1200} value={raw} onChange={(event) => dispatch({ type: 'edit', text: event.target.value.replace(/[^\p{L}\p{M}\p{N} .,!?'-]/gu, ' ') })} /></label>
      {signs.length > 0 && <div className="sign-event-list">
        <p>Recognized signs · scores are each model’s own measure, not the chance a sign is right.</p>
        <ul aria-label="Recognized signs in this transcript">{signs.map(({ sign, intact }) => <li key={sign.id}>
          <strong>{sign.text}</strong>
          <span>{sign.kind} · {SOURCE_LABELS[sign.source]} · {commitLabel(sign)} · {((sign.endedAt - sign.startedAt) / 1000).toFixed(1)} s{sign.score ? ` · ${sign.score.basis} ${sign.score.value.toFixed(2)}` : ''}{intact ? '' : ' · edited'}</span>
          <button type="button" onClick={() => dispatch({ type: 'remove', id: sign.id })} aria-label={`Remove ${describeSign(sign.kind, sign.text)}`}><X size={12} /> Remove</button>
        </li>)}</ul>
      </div>}
    </div>}
    {visibleCleaned && <div className="sign-cleaned">
      <span>{visibleCleaned.engine === 'ai' ? `Suggested ${language === 'hi-IN' ? 'Hindi' : 'English'} sentence · AI` : 'Formatted text'} · separate from your transcript</span>
      <p lang={language === 'hi-IN' ? 'hi' : 'en'}>{visibleCleaned.text}</p>
      {visibleCleaned.issues.length > 0 && <p className="sign-cleaned-warning" role="status">Not usable: this suggestion {visibleCleaned.issues.join(', ')}. Your transcript is unchanged.</p>}
      <div className="sign-cleaned-actions" role="group" aria-label="Suggestion controls">
        <button type="button" onClick={() => speak(visibleCleaned.text, 'suggestion')} disabled={visibleCleaned.issues.length > 0 || !speechSupported}>{speaking === 'suggestion' ? <Square size={13} /> : <Volume2 size={13} />} {speaking === 'suggestion' ? 'Stop' : 'Speak suggestion'}</button>
        <button type="button" onClick={() => copy(visibleCleaned.text, 'suggestion')} disabled={visibleCleaned.issues.length > 0}>{copied === 'suggestion' ? <Check size={13} /> : <Copy size={13} />} {copied === 'suggestion' ? 'Copied' : 'Copy suggestion'}</button>
        <button type="button" onClick={() => { if (speaking === 'suggestion') stop(); setCleaned(null) }}><X size={13} /> Dismiss</button>
      </div>
    </div>}
    <details className="sign-output-settings"><summary>Language, voice &amp; sentence cleanup</summary><div className="sign-output-actions">
      <label className="sign-language-label">Language<select aria-label="Output language" value={language} onChange={(event) => setLanguage(event.target.value as SpeechLanguage)}><option value="en-IN">English (IN)</option><option value="hi-IN">हिन्दी (IN)</option></select></label>
      <label className="sign-voice-label">Voice<select aria-label="Speech voice" value={voiceId || voices[0]?.voiceURI || ''} onChange={(event) => { stop(); setVoiceId(event.target.value) }} disabled={!speechSupported}><option value="" disabled={voices.length > 0}>System default</option>{voices.map((voice) => <option key={voice.voiceURI} value={voice.voiceURI}>{voice.name} · {voice.localService ? 'on device' : 'online'}</option>)}</select></label>
      <button type="button" className="sign-sentence-button" onClick={sentence} disabled={!raw.trim() || busy}><Sparkles size={14} /> {busy ? 'Shaping your words…' : 'Make it a sentence'}</button>
    </div>
    <p className="sign-output-note">Sentence cleanup sends only this transcript text, never video or hand landmarks, to an online AI service. Its suggestion stays separate and is not spoken or copied unless you choose. Names, numbers and negation must survive unchanged. {speechSupported ? 'Voice availability depends on your device.' : 'Speech is unavailable in this browser.'}</p>
    </details>
    {notice && <p className="sign-output-notice" role="status">{notice}</p>}
  </section>
}

/** The recognized words only, captioned over the camera. Follows the newest text
 * unless the reader has scrolled back to earlier captions. Memoized: the camera stage
 * re-renders several times a second, and each render would re-measure every letter's layout. */
export const TranscriptCaption = memo(function TranscriptCaption({ tokens, placeholder }: { tokens: TranscriptToken[]; placeholder: string }) {
  const reduced = usePrefersReducedMotion()
  const lineRef = useRef<HTMLDivElement | null>(null)
  const followLatest = useRef(true)
  const raw = tokens.map((t) => t.text).join('')
  const latest = tokens.findLast((token) => token.sign)?.sign?.id
  useEffect(() => {
    const line = lineRef.current
    if (line && followLatest.current) line.scrollTop = line.scrollHeight
  }, [raw])
  return <div ref={lineRef} className="sign-raw-line sign-camera-caption" data-empty={!tokens.length} aria-label="Raw transcript" tabIndex={0} onScroll={event => {
    const line = event.currentTarget
    followLatest.current = line.scrollHeight - line.scrollTop - line.clientHeight < 24
  }}>
    <AnimatePresence initial={false}>{tokens.map((token) => <motion.span key={token.id} layout={!reduced} layoutId={reduced ? undefined : `sign-token-${token.id}`} className="sign-letter" data-kind={token.kind ?? 'typed'} data-latest={!!latest && token.sign?.id === latest}
      initial={{ opacity: 0, scale: reduced ? 1 : .75 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: reduced ? 1 : .7 }} transition={{ type: 'spring', stiffness: 260, damping: 22 }}>{token.text === ' ' ? '\u00a0' : token.text}</motion.span>)}</AnimatePresence>
    {!tokens.length && <span className="sign-transcript-placeholder">{placeholder}</span>}
  </div>
})
