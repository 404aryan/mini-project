'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { usePrefersReducedMotion } from '@/lib/sign/use-reduced-motion'
import { Check, Copy, Delete, Pencil, Space, Sparkles, Square, Trash2, Volume2 } from 'lucide-react'
import { speakText, speechVoices, type SpeechLanguage } from '@/lib/sign/tts'
import type { TranscriptToken } from '@/lib/sign/types'

export function Transcript({ active, tokens, onSpace, onBackspace, onClear, onEdit, wordMode = false, feedback, candidates = [], onAcceptCandidate }: {
  active: boolean; tokens: TranscriptToken[]; onSpace: () => void; onBackspace: () => void
  onClear: () => void; onEdit: (text: string) => void
  wordMode?: boolean
  feedback?: string; candidates?: { label: string; confidence: number }[]; onAcceptCandidate?: (label: string) => void
}) {
  const reduced = usePrefersReducedMotion()
  const raw = tokens.map((t) => t.text).join('')
  const [editing, setEditing] = useState(false)
  const [language, setLanguage] = useState<SpeechLanguage>('en-IN')
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([])
  const [voiceId, setVoiceId] = useState('')
  const [speechSupported, setSpeechSupported] = useState(false)
  const [speaking, setSpeaking] = useState(false)
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState('')
  const [copied, setCopied] = useState(false)
  const [cleaned, setCleaned] = useState<{ raw: string; language: SpeechLanguage; text: string; engine: string } | null>(null)
  const cancelSpeech = useRef<(() => void) | null>(null)
  const requestRef = useRef<AbortController | null>(null)
  const copyTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const latestRaw = useRef(raw)
  latestRaw.current = raw
  const visibleCleaned = cleaned?.raw === raw && cleaned.language === language ? cleaned : null
  const output = visibleCleaned?.text ?? raw

  const stop = useCallback(() => { cancelSpeech.current?.(); cancelSpeech.current = null; setSpeaking(false) }, [])
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
    stop(); requestRef.current?.abort(); requestRef.current = null; setBusy(false); setNotice(''); setCopied(false)
  }, [raw, language, stop])

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(output)
      setCopied(true)
      if (copyTimer.current) clearTimeout(copyTimer.current)
      copyTimer.current = setTimeout(() => setCopied(false), 1800)
    } catch { setNotice('Copy is unavailable here. Use Edit text to select and copy the raw transcript.') }
  }

  const sentence = async () => {
    requestRef.current?.abort()
    const controller = new AbortController()
    requestRef.current = controller
    setBusy(true); setNotice('')
    const timeout = setTimeout(() => controller.abort(), 15000)
    try {
      const response = await fetch('/api/sign/sentence', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, signal: controller.signal,
        body: JSON.stringify({ tokens: Array.from(raw), language }),
      })
      const result = await response.json()
      if (!response.ok || typeof result.text !== 'string') throw new Error(result.error || 'Sentence cleanup is unavailable.')
      if (controller.signal.aborted || latestRaw.current !== raw) return
      setCleaned({ raw, language, text: result.text, engine: result.engine })
      setNotice(result.notice ?? '')
    } catch (error) {
      if (requestRef.current === controller && latestRaw.current === raw) setNotice(controller.signal.aborted ? 'Sentence cleanup paused or timed out. Your raw text is safe.' : error instanceof Error ? error.message : 'Sentence cleanup is unavailable.')
    } finally {
      clearTimeout(timeout)
      if (requestRef.current === controller) { requestRef.current = null; setBusy(false) }
    }
  }

  const speak = () => {
    if (speaking) { stop(); return }
    cancelSpeech.current?.()
    setNotice('')
    try {
      cancelSpeech.current = speakText(output, language, voices.find((v) => v.voiceURI === voiceId) ?? voices[0], (state) => {
        setSpeaking(state === 'speaking')
        if (state === 'error') setNotice('This voice could not speak. Try another installed voice.')
      })
    } catch { setNotice('Speech is unavailable. Try another voice or browser.') }
  }

  return <section className="sign-transcript" aria-labelledby="sign-transcript-title">
    <div className="sign-transcript-heading"><div><p className="eyebrow">Your words, taking shape</p><h3 id="sign-transcript-title">Live transcript</h3></div><span className="sign-token-count">{tokens.length} / 1200</span></div>
    <div className="sign-raw-line" aria-label="Raw transcript">
      <AnimatePresence initial={false}>{tokens.map((token) => <motion.span key={token.id} layout={!reduced} layoutId={reduced ? undefined : `sign-token-${token.id}`} className="sign-letter"
        initial={{ opacity: 0, scale: reduced ? 1 : .75 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: reduced ? 1 : .7 }} transition={{ type: 'spring', stiffness: 260, damping: 22 }}>{token.text === ' ' ? '\u00a0' : token.text}</motion.span>)}</AnimatePresence>
      {!tokens.length && <span className="sign-transcript-placeholder">{wordMode ? 'Your recognized words will appear here.' : 'Your recognized letters will appear here.'}</span>}
    </div>
    {feedback && <div className="sign-transcript-feedback" role="status"><span className="dock-live-dot" />{feedback}</div>}
    {wordMode && candidates.length > 0 && onAcceptCandidate && <div className="sign-suggestions" aria-label="Possible sign matches"><span>Possible match · tap to add</span>{candidates.map(candidate => <button key={candidate.label} type="button" onClick={() => onAcceptCandidate(candidate.label)}>{candidate.label}<small>{Math.round(candidate.confidence*100)}% match</small></button>)}</div>}
    <span className="sign-sr-only" aria-live="polite" aria-atomic="true">{raw || 'Transcript empty'}</span>
    <div className="sign-text-actions" role="group" aria-label="Transcript controls">
      <button type="button" onClick={onSpace} disabled={!raw || tokens.length >= 1200}><Space size={14} /> Space</button>
      <button type="button" onClick={onBackspace} disabled={!raw}><Delete size={14} /> Backspace</button>
      <button type="button" onClick={onClear} disabled={!raw}><Trash2 size={13} /> Clear</button>
      <button type="button" onClick={copy} disabled={!output.trim()}>{copied ? <Check size={13} /> : <Copy size={13} />} {copied ? 'Copied' : 'Copy'}</button>
      <button type="button" onClick={() => setEditing((value) => !value)} aria-expanded={editing}><Pencil size={12} /> Edit text</button>
    </div>
    {editing && <label className="sign-edit-label">Edit raw text <span>Typed text is added by you.</span><textarea aria-label="Edit raw transcript" maxLength={1200} value={raw} onChange={(event) => onEdit(event.target.value.replace(/[^\p{L}\p{M}\p{N} .,!?'-]/gu, ' '))} /></label>}
    {visibleCleaned && <div className="sign-cleaned" aria-live="polite"><span>{visibleCleaned.engine === 'ai' ? 'Suggested sentence' : 'Formatted text'}</span><p>{visibleCleaned.text}</p></div>}
    <div className="sign-output-actions">
      <label className="sign-language-label">Language<select aria-label="Output language" value={language} onChange={(event) => setLanguage(event.target.value as SpeechLanguage)}><option value="en-IN">English (IN)</option><option value="hi-IN">हिन्दी (IN)</option></select></label>
      <label className="sign-voice-label">Voice<select aria-label="Speech voice" value={voiceId || voices[0]?.voiceURI || ''} onChange={(event) => { stop(); setVoiceId(event.target.value) }} disabled={!speechSupported}><option value="" disabled={voices.length > 0}>System default</option>{voices.map((voice) => <option key={voice.voiceURI} value={voice.voiceURI}>{voice.name} · {voice.localService ? 'on device' : 'online'}</option>)}</select></label>
      <button type="button" className="sign-sentence-button" onClick={sentence} disabled={!raw.trim() || busy}><Sparkles size={14} /> {busy ? 'Shaping your words…' : 'Make it a sentence'}</button>
      <button type="button" className="sign-speak-button" onClick={speak} disabled={!output.trim() || !speechSupported}>{speaking ? <Square size={13} /> : <Volume2 size={14} />} {speaking ? 'Stop' : 'Speak'}<span className={`sign-speech-wave ${speaking ? 'is-speaking' : ''}`} aria-hidden="true">{[0, 1, 2, 3, 4].map((n) => <i key={n} style={{ animationDelay: `${n * .1}s` }} />)}</span></button>
    </div>
    <p className="sign-output-note">Only text is sent when you choose sentence cleanup. {speechSupported ? 'Voice availability depends on your device.' : 'Speech is unavailable in this browser.'}</p>
    <p className="sign-output-notice" role="status">{notice}</p>
  </section>
}
