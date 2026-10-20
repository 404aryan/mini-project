'use client'

import { type FormEvent, lazy, Suspense, useCallback, useEffect, useRef, useState } from 'react'
import { motion } from 'motion/react'
import { usePrefersReducedMotion } from '@/lib/sign/use-reduced-motion'
import { Dock } from '@/components/sign/dock'
import { useSignMode } from '@/lib/sign/use-sign-mode'
import { ScrollySignToText } from '@/components/sign/scrolly-sign-to-text'
import {
  translateToGloss,
  translateOffline,
  TranslationAbortedError,
  type TranslationMode,
  type TranslationResult,
} from '@/lib/islTranslator'
import { trailingPhrasePrefixLength } from '@/components/avatar/textToGloss'
import type { AvatarRequest, AvatarState } from '@/components/avatar/AvatarPlayer'
import { appendSpeechHistory, planLiveCommit, readSpeechResults, type HeardSpeech } from '@/lib/live-speech'
import {
  readSignedInAccount,
  registerLocalAccount,
  signInLocalAccount,
  signOutLocalAccount,
  type LocalAccount,
} from '@/lib/local-account'
import { useModalDialog } from '@/lib/use-modal-dialog'
import {
  ArrowDownRight,
  ArrowRight,
  AudioLines,
  ChevronLeft,
  ChevronRight,
  Globe2,
  Hand,
  LayoutDashboard,
  LogOut,
  Maximize2,
  Menu,
  Mic,
  Minimize2,
  Move3d,
  Play,
  Square,
  Sparkles,
  MicOff,
  LogIn,
  UserPlus,
  UserRound,
  X,
} from 'lucide-react'

type SpeechRecognitionResult = ArrayLike<{ transcript: string }> & { isFinal?: boolean }
type SpeechRecognitionConstructor = new () => {
  continuous: boolean
  interimResults: boolean
  lang: string
  onstart: (() => void) | null
  onend: (() => void) | null
  onerror: ((event: { error?: string }) => void) | null
  onresult: ((event: { resultIndex: number; results: ArrayLike<SpeechRecognitionResult> }) => void) | null
  start: () => void
  stop: () => void
  abort: () => void
}

type SpeechState = 'idle' | 'starting' | 'listening' | 'stopping'
// What actually produced the avatar's current phrase, shown in the engine badge.
type EngineUsed = 'online' | 'offline' | 'fallback' | 'live'

const ENGINE_STATUS: Record<EngineUsed, string> = { online: 'online', offline: 'offline', fallback: 'AI unavailable', live: 'live · offline' }

// Errors after which retrying cannot help, so live mode stops and explains why.
const SPEECH_ERROR_MESSAGES: Record<string, string> = {
  'not-allowed': 'Microphone access is blocked. Allow it in your browser settings to use voice input.',
  'service-not-allowed': 'Microphone access is blocked. Allow it in your browser settings to use voice input.',
  'audio-capture': 'No microphone was found. Connect one and try again.',
  'language-not-supported': 'This browser cannot recognise speech in the selected voice language.',
  network: 'Voice recognition lost its network connection. Check your connection and try again.',
}
const TERMINAL_SPEECH_ERRORS = new Set(['not-allowed', 'service-not-allowed', 'audio-capture', 'language-not-supported'])
const MAX_SPEECH_RETRIES = 3

type SpeechLang = 'en-IN' | 'hi-IN'
const SPEECH_LANGUAGES: Record<SpeechLang, { short: string; name: string }> = {
  'en-IN': { short: 'EN', name: 'English (India)' },
  'hi-IN': { short: 'HI', name: 'Hindi' },
}

const team = [
  { name: 'Mitarth Pathak', role: 'Engineering, UI & 3D', image: null, linkedin: 'https://www.linkedin.com/in/mitarth-pathak/' },
  { name: 'Navneet Singh', role: 'Technology & AI', image: null, linkedin: 'https://www.linkedin.com/in/navneet-singh99/' },
  { name: 'Gaurav Soni', role: 'Design & Experience', image: null },
  { name: 'Deep Panchal', role: 'Product & Vision', image: null, linkedin: 'https://www.linkedin.com/in/deep-panchal-3a1474399/' },
  { name: 'Nooren Qureshi', role: 'Research & Community', image: null, linkedin: 'https://www.linkedin.com/in/nooren-qureshi-803a27381/' },
]

const features = [
  { icon: Mic, title: 'Speak naturally', text: 'Yap captures the rhythm, intent, and nuance of everyday speech.' },
  { icon: Move3d, title: 'See every sign', text: 'Render turns language into expressive Indian Sign Language in real time.' },
  { icon: Globe2, title: 'Reach more people', text: 'Make classrooms, clinics, and conversations feel open to everyone.' },
]

const quickPhrases = ['YOU', 'HOME', 'TIME', 'PERSON', 'HELLO', 'HELP', 'THANK YOU', 'YES', 'NO', 'PLEASE', 'SORRY', 'WELCOME', 'GOOD', 'BAD', 'STOP', 'WAIT', 'COME', 'GO', 'WANT', 'NEED', 'LIKE', 'KNOW', 'UNDERSTAND', 'ASK', 'DRINK', 'EAT', 'WATER', 'GIVE', 'TAKE', 'SHOW', 'LOOK', 'SEE', 'LISTEN', 'TALK', 'START', 'FINISH', 'AGAIN', 'SLEEP', 'TOILET', 'DOCTOR', 'HOSPITAL', 'PAIN', 'SCHOOL', 'CLASS', 'TEACHER', 'STUDENT', 'BOOK', 'I', 'MY', 'YOUR', 'MORNING', 'LOVE', 'MEET', 'NAME']

const SignStage = lazy(() => import('@/components/sign/sign-stage').then((module) => ({ default: module.SignStage })))
const AvatarPlayer = lazy(() => import('@/components/avatar/AvatarPlayer').then((module) => ({ default: module.AvatarPlayer })))
// The avatar keeps its own sign queue; this list only has to hold the requests
// that arrive before it renders (several live fragments can share one render).
const AVATAR_REQUEST_HISTORY = 24

export default function Page() {
  const sign = useSignMode()
  const [hasOpenedSign, setHasOpenedSign] = useState(false)
  const [avatarVisited, setAvatarVisited] = useState(false)
  // React re-renders the avatar stage className (it toggles the sign-mode PiP),
  // which drops a class added from outside React, so its reveal is state.
  const [avatarRevealed, setAvatarRevealed] = useState(false)
  const avatarRegionRef = useRef<HTMLDivElement>(null)
  const reducedMotion = usePrefersReducedMotion()
  const heroCopyItem = {
    visible: { opacity: 1, y: 0, filter: 'blur(0px)' },
    hidden: { opacity: 0, y: reducedMotion ? 0 : -24, filter: reducedMotion ? 'blur(0px)' : 'blur(3px)' },
  }
  const [menuOpen, setMenuOpen] = useState(false)
  const [translation, setTranslation] = useState('YOU HOME')
  const [avatarModel, setAvatarModel] = useState<'default' | 'human'>('default')
  const [avatarRequests, setAvatarRequests] = useState<AvatarRequest[]>([])
  const avatarRequestIdRef = useRef(0)
  const [stopId, setStopId] = useState(0)
  const [resetId, setResetId] = useState(0)
  const [speed, setSpeed] = useState(1)
  const [avatarState, setAvatarState] = useState<AvatarState>('loading')
  const [isTranslating, setIsTranslating] = useState(false)
  const [engineUsed, setEngineUsed] = useState<EngineUsed>('online')
  const [translationEngine, setTranslationEngine] = useState<TranslationMode>('online')
  const [speechSupported, setSpeechSupported] = useState(false)
  const [isListening, setIsListening] = useState(false)
  const [liveMode, setLiveMode] = useState(false)
  const [speechError, setSpeechError] = useState<string | null>(null)
  const [speechLang, setSpeechLang] = useState<SpeechLang>('en-IN')
  const [translationNotice, setTranslationNotice] = useState<string | null>(null)
  const speechLangRef = useRef<SpeechLang>('en-IN')
  const [authOpen, setAuthOpen] = useState(false)
  const [authMode, setAuthMode] = useState<'signin' | 'signup'>('signin')
  const [authError, setAuthError] = useState<string | null>(null)
  const [authBusy, setAuthBusy] = useState(false)
  const [account, setAccount] = useState<LocalAccount | null>(null)
  const [accountMenuOpen, setAccountMenuOpen] = useState(false)
  const [dashboardOpen, setDashboardOpen] = useState(false)
  const [isMaximized, setIsMaximized] = useState(false)
  const [aboutOpen, setAboutOpen] = useState(false)
  const authDialogRef = useRef<HTMLElement>(null)
  const dashboardDialogRef = useRef<HTMLElement>(null)
  const aboutDialogRef = useRef<HTMLElement>(null)
  const recognitionRef = useRef<InstanceType<SpeechRecognitionConstructor> | null>(null)
  const speechStateRef = useRef<SpeechState>('idle')
  const restartTimerRef = useRef<number | null>(null)
  const restartFailuresRef = useRef(0)
  // Text heard by earlier sessions of one auto-restarted live run, and the
  // current session's latest results, so a service restart keeps the history.
  const speechHistoryRef = useRef('')
  const lastHeardRef = useRef<HeardSpeech | null>(null)
  const liveModeRef = useRef(false)
  const quickPhrasesRef = useRef<HTMLDivElement>(null)
  const translateAbortRef = useRef<AbortController | null>(null)
  const translationEngineRef = useRef<TranslationMode>('online')
  // Live streaming state: the words of the current recognition session already
  // handed to the avatar, and a promise chain that keeps chunk translations in
  // spoken order.
  const liveCommittedRef = useRef<string[]>([])
  const liveChainRef = useRef<Promise<void>>(Promise.resolve())
  const landingDialogOpen = authOpen || (dashboardOpen && !!account) || aboutOpen

  const closeAuth = useCallback(() => setAuthOpen(false), [])
  const closeDashboard = useCallback(() => setDashboardOpen(false), [])
  const closeAbout = useCallback(() => setAboutOpen(false), [])
  const openAbout = useCallback(() => setAboutOpen(true), [])
  useModalDialog(authOpen, authDialogRef, closeAuth)
  useModalDialog(dashboardOpen && !!account, dashboardDialogRef, closeDashboard)
  useModalDialog(aboutOpen, aboutDialogRef, closeAbout)

  useEffect(() => {
    if (!isMaximized || sign.active || landingDialogOpen) return
    const restoreOnEscape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      event.preventDefault()
      setIsMaximized(false)
    }
    document.addEventListener('keydown', restoreOnEscape)
    return () => document.removeEventListener('keydown', restoreOnEscape)
  }, [isMaximized, sign.active, landingDialogOpen])

  const cancelPendingTranslation = useCallback(() => {
    translateAbortRef.current?.abort()
    translateAbortRef.current = null
    setIsTranslating(false)
  }, [])

  const clearSpeechRestart = useCallback(() => {
    if (restartTimerRef.current === null) return
    window.clearTimeout(restartTimerRef.current)
    restartTimerRef.current = null
  }, [])

  // Ends voice capture of either kind. Live mode is cleared first so neither
  // onend nor an already scheduled restart can bring the microphone back.
  const endSpeech = useCallback((how: 'stop' | 'abort' = 'stop') => {
    liveModeRef.current = false
    setLiveMode(false)
    clearSpeechRestart()
    const recognition = recognitionRef.current
    if (!recognition || speechStateRef.current === 'idle') return
    speechStateRef.current = 'stopping'
    try {
      if (how === 'abort') recognition.abort()
      else recognition.stop()
    } catch { /* Already ended. */ }
  }, [clearSpeechRestart])

  const startSpeech = (live: boolean) => {
    const recognition = recognitionRef.current
    if (!recognition || speechStateRef.current !== 'idle') return
    setSpeechError(null)
    speechHistoryRef.current = ''
    lastHeardRef.current = null
    restartFailuresRef.current = 0
    speechStateRef.current = 'starting'
    recognition.lang = speechLangRef.current
    try {
      recognition.start()
    } catch {
      speechStateRef.current = 'idle'
      if (live) {
        liveModeRef.current = false
        setLiveMode(false)
      }
      setSpeechError('Voice input could not start. Try again in a moment.')
    }
  }

  useEffect(() => {
    if (!sign.active) return
    setHasOpenedSign(true)
    setAvatarVisited(true)
    setAuthOpen(false)
    setDashboardOpen(false)
    setAboutOpen(false)
    setAccountMenuOpen(false)
    cancelPendingTranslation()
    endSpeech('abort')
  }, [sign.active, cancelPendingTranslation, endSpeech])

  useEffect(() => {
    const region = avatarRegionRef.current
    if (!region) return
    // On phones the preview starts below the hero. Load it when enough is in
    // view to use, then retain the same instance across scrolling/mode changes.
    const observer = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting && entry.intersectionRatio >= .2) {
        setAvatarVisited(true)
        observer.disconnect()
      }
    }, { threshold: .2 })
    observer.observe(region)
    return () => observer.disconnect()
  }, [])

  // Hands a resolved gloss to the avatar and reports anything that could not
  // be signed, instead of passing unplayable raw text through.
  const showTranslation = useCallback((result: TranslationResult, used: EngineUsed) => {
    setEngineUsed(used)
    const skipped = result.skipped ?? []
    if (skipped.length) setTranslationNotice(`Could not sign: ${skipped.slice(0, 3).join(' ')}${skipped.length > 3 ? '…' : ''}`)
    else setTranslationNotice(result.glossText ? null : 'Nothing in that message can be signed yet.')
    if (!result.glossText) return
    // Live mode queues each phrase behind the signs already playing.
    const request = { id: ++avatarRequestIdRef.current, phrase: result.glossText, append: liveModeRef.current }
    setAvatarRequests((list) => [...list.slice(1 - AVATAR_REQUEST_HISTORY), request])
  }, [])

  // Hybrid translation trigger: resolve raw input to ISL gloss (Gemini when
  // the engine toggle is "online", rule-based engine otherwise / on failure)
  // and only then hand the clean gloss string to the avatar. A newer call
  // aborts the previous fetch so fast typing and live speech never race.
  const dispatchTranslation = useCallback(async (rawText: string, options?: { append?: boolean }) => {
    const text = rawText.trim()
    if (!text) return

    // Live streaming path: each word-chunk is queued behind the previous one so
    // signs play in spoken order. This always uses the instant offline engine
    // — a Gemini round trip per word is exactly the multi-second stall live
    // mode exists to avoid. The AI engine still applies to typed/Enter runs.
    if (options?.append) {
      liveChainRef.current = liveChainRef.current.catch(() => {}).then(() => {
        if (!liveModeRef.current) return
        showTranslation(translateOffline(text), 'live')
      })
      return
    }

    translateAbortRef.current?.abort()
    translateAbortRef.current = null

    // Forced offline: skip the network entirely, resolve synchronously.
    if (translationEngineRef.current === 'offline') {
      showTranslation(translateOffline(text), 'offline')
      return
    }

    const controller = new AbortController()
    translateAbortRef.current = controller
    setIsTranslating(true)

    try {
      const result = await translateToGloss(text, controller.signal)
      if (controller.signal.aborted) return
      showTranslation(result, result.mode === 'online' ? 'online' : 'fallback')
    } catch (error) {
      if (!(error instanceof TranslationAbortedError)) {
        console.warn('[ISL] translation dispatch failed:', error)
      }
    } finally {
      if (translateAbortRef.current === controller) {
        translateAbortRef.current = null
        setIsTranslating(false)
      }
    }
  }, [showTranslation])

  const chooseTranslationEngine = (engine: TranslationMode) => {
    translationEngineRef.current = engine
    setTranslationEngine(engine)
    if (engine === 'offline') cancelPendingTranslation()
    // Show the selected engine until the next translation reports what it used.
    setEngineUsed(engine)
  }

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => entries.forEach((entry) => {
        if (!entry.isIntersecting) return
        entry.target.classList.add('is-visible')
        if (entry.target.id === 'try-it') setAvatarRevealed(true)
      }),
      { threshold: 0.14 },
    )
    document.querySelectorAll('.reveal').forEach((element) => observer.observe(element))
    return () => observer.disconnect()
  }, [])

  useEffect(() => {
    setAccount(readSignedInAccount())
  }, [])

  useEffect(() => {
    const speechWindow = window as typeof window & {
      SpeechRecognition?: SpeechRecognitionConstructor
      webkitSpeechRecognition?: SpeechRecognitionConstructor
    }
    const SpeechRecognition = speechWindow.SpeechRecognition || speechWindow.webkitSpeechRecognition
    if (!SpeechRecognition) return

    setSpeechSupported(true)
    const recognition = new SpeechRecognition()
    recognition.continuous = true
    recognition.interimResults = true
    recognition.lang = 'en-IN'
    // Sends whatever the stable-word rules decided is new for the avatar.
    const commitLive = (heard: HeardSpeech) => {
      const plan = planLiveCommit(liveCommittedRef.current, heard, trailingPhrasePrefixLength)
      liveCommittedRef.current = plan.committed
      if (plan.chunk) void dispatchTranslation(plan.chunk, { append: true })
    }
    recognition.onstart = () => {
      speechStateRef.current = 'listening'
      setIsListening(true)
      // A fresh recognition session restarts `event.results` from index 0.
      liveCommittedRef.current = []
      lastHeardRef.current = null
    }
    recognition.onend = () => {
      speechStateRef.current = 'idle'
      setIsListening(false)
      const heard = lastHeardRef.current
      lastHeardRef.current = null
      if (heard) {
        // Words still held back when the service ended the session are final now.
        if (liveModeRef.current) commitLive({ ...heard, allFinal: true, finalWordCount: heard.words.length })
        speechHistoryRef.current = appendSpeechHistory(speechHistoryRef.current, heard.transcript)
      }
      if (!liveModeRef.current) return
      if (restartTimerRef.current !== null) window.clearTimeout(restartTimerRef.current)
      restartTimerRef.current = window.setTimeout(() => {
        restartTimerRef.current = null
        // Re-check: Stop, camera mode or unmount may have happened in the gap.
        if (!liveModeRef.current || speechStateRef.current !== 'idle') return
        speechStateRef.current = 'starting'
        try {
          recognition.start()
        } catch {
          speechStateRef.current = 'idle'
        }
      }, 220 * 2 ** restartFailuresRef.current)
    }
    recognition.onerror = (event) => {
      const code = event.error ?? 'unknown'
      // Silence and our own abort() are normal; live mode simply restarts.
      if (code === 'no-speech' || code === 'aborted') return
      if (!TERMINAL_SPEECH_ERRORS.has(code)) {
        restartFailuresRef.current += 1
        if (liveModeRef.current && restartFailuresRef.current <= MAX_SPEECH_RETRIES) return
      }
      liveModeRef.current = false
      setLiveMode(false)
      if (restartTimerRef.current !== null) {
        window.clearTimeout(restartTimerRef.current)
        restartTimerRef.current = null
      }
      setSpeechError(SPEECH_ERROR_MESSAGES[code] ?? 'Voice input stopped unexpectedly. Try again.')
    }
    recognition.onresult = (event) => {
      const heard = readSpeechResults(event.results)
      lastHeardRef.current = heard
      if (heard.words.length) restartFailuresRef.current = 0
      setTranslation(appendSpeechHistory(speechHistoryRef.current, heard.transcript))
      // Don't wait for the speaker to stop: each word becomes signable as soon
      // as the recognizer moves past it, so the avatar starts almost at once.
      if (liveModeRef.current) commitLive(heard)
    }
    recognitionRef.current = recognition

    return () => {
      liveModeRef.current = false
      if (restartTimerRef.current !== null) {
        window.clearTimeout(restartTimerRef.current)
        restartTimerRef.current = null
      }
      recognition.onstart = null
      recognition.onend = null
      recognition.onerror = null
      recognition.onresult = null
      recognition.abort()
      recognitionRef.current = null
      speechStateRef.current = 'idle'
    }
  }, [dispatchTranslation])

  const runTranslation = () => {
    void dispatchTranslation(translation)
  }

  // Quick-phrase chips are already canonical vocabulary, so translate them with
  // the instant offline engine — no API round trip or loader needed.
  const playQuickPhrase = (word: string) => {
    cancelPendingTranslation()
    setTranslation(word)
    showTranslation(translateOffline(word), 'offline')
  }

  // The recognizer reads its language when it starts, so switching ends any
  // capture in progress; the next Voice or Live press uses the new language.
  const toggleSpeechLanguage = () => {
    const next: SpeechLang = speechLangRef.current === 'en-IN' ? 'hi-IN' : 'en-IN'
    speechLangRef.current = next
    setSpeechLang(next)
    if (speechStateRef.current !== 'idle' || liveModeRef.current) endSpeech()
  }

  const toggleVoiceInput = () => {
    const state = speechStateRef.current
    if (state === 'starting') return
    if (state !== 'idle' || liveModeRef.current) endSpeech()
    else startSpeech(false)
  }

  const toggleLiveMode = () => {
    if (liveModeRef.current) {
      endSpeech()
      return
    }
    cancelPendingTranslation()
    liveModeRef.current = true
    setLiveMode(true)
    liveCommittedRef.current = []
    liveChainRef.current = Promise.resolve()
    if (speechStateRef.current === 'idle') startSpeech(true)
  }

  const stopTranslation = () => {
    cancelPendingTranslation()
    endSpeech()
    liveCommittedRef.current = []
    setStopId((current) => current + 1)
  }

  const resetAvatar = () => {
    cancelPendingTranslation()
    setResetId((current) => current + 1)
  }

  const scrollQuickPhrases = (direction: -1 | 1) => {
    quickPhrasesRef.current?.scrollBy({ left: direction * 260, behavior: reducedMotion ? 'auto' : 'smooth' })
  }

  const openAuth = (mode: 'signin' | 'signup') => {
    setAuthMode(mode)
    setAuthError(null)
    setAuthOpen(true)
  }

  const switchAuthMode = () => {
    setAuthMode(authMode === 'signup' ? 'signin' : 'signup')
    setAuthError(null)
  }

  const submitAuth = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (authBusy) return
    const data = new FormData(event.currentTarget)
    const email = String(data.get('email') || '')
    const password = String(data.get('password') || '')
    setAuthBusy(true)
    setAuthError(null)
    try {
      const result = authMode === 'signup'
        ? await registerLocalAccount(String(data.get('name') || ''), email, password)
        : await signInLocalAccount(email, password)
      if (!result.ok) {
        setAuthError(result.error)
        return
      }
      setAccount(result.account)
      setAuthOpen(false)
    } catch {
      setAuthError('Something went wrong while checking your profile. Try again.')
    } finally {
      setAuthBusy(false)
    }
  }

  const signOut = () => {
    signOutLocalAccount()
    setAccount(null)
    setAccountMenuOpen(false)
    setDashboardOpen(false)
    setAuthOpen(false)
  }

  return (
    <>
    <a href="#top" className="site-skip-link">Skip to main content</a>
    <main className={`site-shell has-sign-story ${sign.active ? 'sign-mode-active' : ''}`} inert={sign.active || landingDialogOpen}>
      <header className="topbar">
        <a className="brand" href="#top" aria-label="yap & render home">
          <span className="brand-mark"><img src="/yap-render-logo-mark.png" alt="" /></span>
          <span>yap &amp; render</span>
        </a>
        <nav className={menuOpen ? 'nav-links nav-open' : 'nav-links'} aria-label="Main navigation">
          <a href="#how-it-works" onClick={() => setMenuOpen(false)}>How it works</a>
          <a href="#why-it-matters" onClick={() => setMenuOpen(false)}>Why it matters</a>
          <a href="#about" onClick={() => setMenuOpen(false)}>About</a>
        </nav>
        <div className="auth-actions">
          {account ? <div className="account-menu"><button className="account-button" onClick={() => setAccountMenuOpen((open) => !open)} aria-expanded={accountMenuOpen} aria-haspopup="menu"><UserRound size={15} /> {account.name}</button>{accountMenuOpen && <div className="account-dropdown" role="menu"><button type="button" role="menuitem" onClick={() => { setAccountMenuOpen(false); setDashboardOpen(true) }}><LayoutDashboard size={15} /> Dashboard</button><button type="button" role="menuitem" onClick={signOut}><LogOut size={15} /> Sign out</button></div>}</div> : <><button className="auth-link" onClick={() => openAuth('signin')}>Sign in</button><button className="nav-cta" onClick={() => openAuth('signup')}>Sign up <UserPlus size={15} /></button></>}
        </div>
        <button className="menu-toggle" onClick={() => setMenuOpen(!menuOpen)} aria-label={menuOpen ? 'Close menu' : 'Open menu'} aria-expanded={menuOpen}>
          {menuOpen ? <X size={21} /> : <Menu size={21} />}
        </button>
      </header>

      <section className={isMaximized ? 'hero section-pad is-demo-maximized' : 'hero section-pad'} id="top" tabIndex={-1}>
        <motion.div className="hero-copy reveal" initial={false} animate={sign.active ? 'hidden' : 'visible'} variants={{ hidden: { transition: { staggerChildren: reducedMotion ? 0 : .04 } }, visible: { transition: { staggerChildren: reducedMotion ? 0 : .05 } } }}>
          <motion.p variants={heroCopyItem} className="eyebrow"><span className="eyebrow-dot" /> Language, without limits</motion.p>
          <motion.h1 variants={heroCopyItem} className="hero-title"><span>Say it.</span><span><em>See it.</em></span><span>Share it.</span></motion.h1>
          <motion.p variants={heroCopyItem} className="hero-lede">Yap & Render translates spoken language into Indian Sign Language, so more people can be part of the conversation.</motion.p>
          <motion.div variants={heroCopyItem} className="hero-actions">
            <a className="button button-dark" href="#try-it">See it in action <ArrowDownRight size={17} /></a>
            <a className="text-link" href="#how-it-works">Explore the idea <ArrowRight size={15} /></a>
          </motion.div>
          <motion.div variants={heroCopyItem} className="hero-highlights" aria-label="Yap and Render highlights"><span>ISL-first</span><span>Real-time signs</span><span>Human connection</span></motion.div>
          <motion.p variants={heroCopyItem} className="hero-note"><Sparkles size={14} /> Built with and for the Indian Deaf community</motion.p>
        </motion.div>

        <motion.div layout={!reducedMotion} className={`avatar-stage reveal ${avatarRevealed ? 'is-visible' : ''} ${sign.active ? 'sign-avatar-pip' : ''}`} id="try-it" transition={{ type: 'spring', stiffness: 170, damping: 25 }}>
          {sign.active && <span className="sign-pip-label">Render <span>Still here with you</span></span>}
          <div className="terminal-window" aria-label="Yap and Render live translation workspace">
            <div className="terminal-chrome"><span className="chrome-dot red" /><span className="chrome-dot yellow" /><span className="chrome-dot green" /><span className="terminal-title">yap / render</span><button
              type="button"
              className="terminal-maximize-toggle"
              onClick={() => setIsMaximized((maximized) => !maximized)}
              aria-label={isMaximized ? 'Restore avatar canvas size' : 'Maximize avatar canvas'}
              aria-pressed={isMaximized}
              title={isMaximized ? 'Restore size (Esc)' : 'Maximize canvas'}
            >
              {isMaximized ? <Minimize2 size={16} strokeWidth={1.7} /> : <Maximize2 size={16} strokeWidth={1.7} />}
            </button></div>
            <div className={isMaximized ? 'terminal-body avatar-terminal-body is-maximized' : 'terminal-body avatar-terminal-body'}>
              <div className="avatar-workspace">
              <div
                ref={avatarRegionRef}
                className={isMaximized ? 'avatar-canvas-shell is-maximized' : 'avatar-canvas-shell'}
                aria-label="Interactive 3D avatar canvas ready for Indian Sign Language playback"
                onTransitionEnd={(event) => {
                  if (event.propertyName === 'height') window.dispatchEvent(new Event('resize'))
                }}
              >
                {avatarVisited ? <Suspense fallback={<div className="avatar-load-placeholder" role="status">Loading Render…</div>}><AvatarPlayer requests={avatarRequests} model={avatarModel} stopId={stopId} resetId={resetId} speed={speed} lowPower={sign.active} onStateChange={setAvatarState} /></Suspense> : <div className="avatar-load-placeholder" aria-hidden="true"><Hand size={30} strokeWidth={1.2} /></div>}
                <span className="canvas-badge"><span className="live-dot" /> ISL AVATAR · {avatarState}</span>
                <div className={isTranslating ? 'engine-selector is-busy' : 'engine-selector'} role="group" aria-label="Translation engine">
                  <button type="button" className={translationEngine === 'online' ? 'is-selected' : ''} onClick={() => chooseTranslationEngine('online')} aria-pressed={translationEngine === 'online'} title="Translate with Gemini AI (falls back to the offline engine automatically)"><Sparkles size={10} /> AI</button>
                  <button type="button" className={translationEngine === 'offline' ? 'is-selected' : ''} onClick={() => chooseTranslationEngine('offline')} aria-pressed={translationEngine === 'offline'} title="Translate with the built-in offline rule engine">Offline</button>
                  <span className="engine-status" aria-live="polite">{isTranslating ? 'translating…' : ENGINE_STATUS[engineUsed]}</span>
                </div>
                <div className="avatar-selector" role="group" aria-label="Choose avatar"><span>AVATAR</span><button type="button" className={avatarModel === 'default' ? 'is-selected' : ''} onClick={() => setAvatarModel('default')} aria-pressed={avatarModel === 'default'}>Default</button><button type="button" className={avatarModel === 'human' ? 'is-selected' : ''} onClick={() => setAvatarModel('human')} aria-pressed={avatarModel === 'human'}>Human</button></div>
              </div>
              <aside className="avatar-command-panel" aria-label="Avatar playback and sign commands">
                <div className="avatar-command-input">
                  <input value={translation} onChange={(event) => { setTranslation(event.target.value); setTranslationNotice(null) }} onKeyDown={(event) => event.key === 'Enter' && runTranslation()} aria-label="Text to translate into Indian Sign Language" placeholder="Type a message, then press Enter…" />
                  <button type="button" onClick={runTranslation} className="voice-input translate-submit" aria-label="Sign the typed message" title="Sign the typed message (Enter)" disabled={!translation.trim()}><Play size={13} fill="currentColor" /><span>Play</span></button>
                  <button type="button" onClick={toggleVoiceInput} className={isListening ? 'voice-input is-listening' : 'voice-input'} aria-label={isListening ? 'Stop voice input' : 'Start voice input'} disabled={!speechSupported}>{isListening ? <MicOff size={15} /> : <Mic size={15} />}<span>{isListening ? 'Listening' : 'Voice'}</span></button>
                  <button type="button" onClick={toggleLiveMode} className={liveMode ? 'live-translation is-active' : 'live-translation'} disabled={!speechSupported}><span /> Live</button>
                  <button type="button" onClick={toggleSpeechLanguage} className="live-translation speech-language" aria-label={`Voice language: ${SPEECH_LANGUAGES[speechLang].name}. Switch language`} title="Switch voice language (English / Hindi)" disabled={!speechSupported}>{SPEECH_LANGUAGES[speechLang].short}</button>
                </div>
                <div className="avatar-command-actions"><button type="button" onClick={stopTranslation} className="terminal-play terminal-stop" aria-label="Stop translation" title="Stop translation"><Square size={11} fill="currentColor" /></button><button type="button" onClick={resetAvatar} className="terminal-play terminal-stop" aria-label="Reset avatar" title="Reset avatar to rest pose"><span aria-hidden="true">↺</span></button><label className="avatar-speed" title="Animation speed">Speed<input type="range" min="0.5" max="3" step="0.25" value={speed} onChange={(e) => setSpeed(Number(e.target.value))} />{speed}×</label></div>
                <div className="avatar-command-list" aria-label="Try a supported sign">
                  {quickPhrases.map((word) => <button type="button" key={word} onClick={() => playQuickPhrase(word)}>{word}</button>)}
                </div>
              </aside>
              </div>
              <div className="translator-controls">
                <input value={translation} onChange={(event) => { setTranslation(event.target.value); setTranslationNotice(null) }} onKeyDown={(event) => event.key === 'Enter' && runTranslation()} aria-label="Text to translate into Indian Sign Language" placeholder="Type a message, then press Enter…" />
                <button type="button" onClick={runTranslation} className="voice-input translate-submit" aria-label="Sign the typed message" title="Sign the typed message (Enter)" disabled={!translation.trim()}><Play size={13} fill="currentColor" /><span>Play</span></button>
                <button type="button" onClick={toggleVoiceInput} className={isListening ? 'voice-input is-listening' : 'voice-input'} aria-label={isListening ? 'Stop voice input' : 'Start voice input'} title={speechSupported ? (isListening ? 'Stop listening' : 'Speak your message') : 'Voice input is not supported in this browser'} disabled={!speechSupported}>
                  {isListening ? <MicOff size={15} /> : <Mic size={15} />}
                  <span>{isListening ? 'Listening' : 'Voice'}</span>
                </button>
                <button type="button" onClick={toggleLiveMode} className={liveMode ? 'live-translation is-active' : 'live-translation'} disabled={!speechSupported} title="Continuously convert final speech into ISL"><span /> Live</button>
                <button type="button" onClick={toggleSpeechLanguage} className="live-translation speech-language" aria-label={`Voice language: ${SPEECH_LANGUAGES[speechLang].name}. Switch language`} title="Switch voice language (English / Hindi)" disabled={!speechSupported}>{SPEECH_LANGUAGES[speechLang].short}</button>
              </div>
              <div className="terminal-footer terminal-footer-live"><button type="button" onClick={stopTranslation} className="terminal-play terminal-stop" aria-label="Stop translation"><Square size={11} fill="currentColor" /></button><button type="button" onClick={resetAvatar} className="terminal-play terminal-stop" aria-label="Reset avatar" title="Reset avatar to rest pose" style={{marginLeft: '4px'}}>↺</button><span aria-live="polite">{speechError ?? translationNotice ?? (liveMode ?'live translation is listening' : avatarState === 'signing' ? 'translation in progress' : avatarState === 'loading' ? 'loading avatar' : avatarState === 'error' ? 'avatar unavailable' : 'ready — words or A–Z fingerspelling')}</span><label style={{display:'flex',alignItems:'center',gap:'4px',fontSize:'11px',opacity:0.7,marginLeft:'auto'}} title="Animation speed">Speed<input type="range" min="0.5" max="3" step="0.25" value={speed} onChange={(e) => setSpeed(Number(e.target.value))} style={{width:'60px',accentColor:'currentColor'}} />{speed}×</label><span className="terminal-time">ISL</span></div>
              <div className="quick-phrases" aria-label="Try a supported sign">
                <button type="button" className="quick-phrases-arrow" onClick={() => scrollQuickPhrases(-1)} aria-label="Show previous signs"><ChevronLeft size={15} /></button>
                <div ref={quickPhrasesRef} className="quick-phrases-track">
                  {quickPhrases.map((word) => <button key={word} onClick={() => playQuickPhrase(word)}>{word}</button>)}
                </div>
                <button type="button" className="quick-phrases-arrow" onClick={() => scrollQuickPhrases(1)} aria-label="Show more signs"><ChevronRight size={15} /></button>
              </div>
              <div className="terminal-footer"><span className="terminal-play">{avatarState === 'signing' ? <Square size={11} fill="currentColor" /> : <Play size={14} fill="currentColor" />}</span><span aria-live="polite">{speechError ?? translationNotice ?? (avatarState ==='signing' ? 'translation in progress' : avatarState === 'loading' ? 'loading avatar' : avatarState === 'error' ? 'avatar unavailable' : 'ready — words or A–Z fingerspelling')}</span><span className="terminal-time">ISL</span></div>
            </div>
          </div>
        </motion.div>
      </section>

      <section className="marquee-band" aria-label="Product promise"><div>VOICE <span>→</span> SIGN <span>→</span> UNDERSTANDING <span>→</span> BELONGING <span>→</span> VOICE <span>→</span> SIGN</div></section>

      <section className="intro section-pad reveal" id="how-it-works">
        <div className="section-kicker">The simple idea</div>
        <div className="intro-content"><h2>Communication should never need a <em>middle ground.</em></h2><div><p>Most translation tools move between languages. We are building a bridge between ways of communicating.</p><a className="text-link" href="#why-it-matters">Why we&apos;re building this <ArrowRight size={15} /></a></div></div>
      </section>

      <ScrollySignToText onTry={sign.open} />

      <section className="feature-section section-pad" id="why-it-matters">
        <div className="feature-heading reveal"><p className="eyebrow"><span className="eyebrow-dot" /> From yap to render</p><h2>One conversation.<br /><em>Two ways to be heard.</em></h2></div>
        <div className="feature-grid">{features.map(({ icon: Icon, title, text }, index) => <article className="feature-card reveal" key={title}><span className="feature-number">0{index + 1}</span><div className="feature-icon"><Icon size={22} /></div><h3>{title}</h3><p>{text}</p></article>)}</div>
      </section>

      <section className="proof-band reveal"><div><strong>01</strong><span>shared language</span></div><div><strong>∞</strong><span>possibilities to connect</span></div><div><strong>100%</strong><span>human at the centre</span></div></section>

      <section className="final-cta section-pad reveal" id="about"><div className="cta-symbol"><AudioLines size={28} /></div><p className="eyebrow">A more connected future</p><h2>Let&apos;s make room<br />for <em>every voice.</em></h2><p>We&apos;re early, curious, and building in the open.</p><button type="button" className="button button-coral" onClick={() => setAboutOpen(true)}>About Us <ArrowRight size={17} /></button></section>

      <footer className="footer"><a className="brand" href="#top" aria-label="yap & render home"><span className="brand-mark"><img src="/yap-render-logo-mark.png" alt="" /></span><span>yap &amp; render</span></a><span>Made for more ways to connect.</span><span>© 2026 Yap & Render</span></footer>
    </main>

    {authOpen && <div className="auth-backdrop" role="presentation" onMouseDown={closeAuth}>
      <section ref={authDialogRef} tabIndex={-1} className="auth-modal" role="dialog" aria-modal="true" aria-labelledby="auth-title" onMouseDown={(event) => event.stopPropagation()}>
        <button className="auth-close" onClick={closeAuth} aria-label="Close account dialog"><X size={18} /></button>
        <span className="auth-mark"><Hand size={18} /></span>
        <p className="eyebrow">Yap / Render profile</p>
        <h2 id="auth-title">{account ? 'You are signed in.' : authMode === 'signup' ? 'Create your profile.' : 'Welcome back.'}</h2>
        {account ? <><p className="auth-copy">Signed in as {account.email}</p><button className="auth-submit" onClick={signOut}>Sign out</button></> : <form onSubmit={submitAuth} className="auth-form" aria-describedby="auth-note">
          {authMode === 'signup' && <label>Name<input name="name" required maxLength={80} autoComplete="name" placeholder="Your name" /></label>}
          <label>Email<input name="email" type="email" required autoComplete="email" placeholder="you@example.com" /></label>
          <label>Password<input name="password" type="password" required minLength={6} autoComplete={authMode === 'signup' ? 'new-password' : 'current-password'} placeholder="At least 6 characters" /></label>
          {authError && <p className="auth-error" role="alert">{authError}</p>}
          <button className="auth-submit" type="submit" disabled={authBusy} aria-busy={authBusy}>{authBusy ? 'Checking…' : authMode === 'signup' ? 'Create profile' : 'Sign in'} <LogIn size={15} /></button>
          <p className="auth-note" id="auth-note">Profiles are saved only in this browser on this device. Nothing is sent to a server.</p>
        </form>}
        {!account && <button className="auth-switch" onClick={switchAuthMode}>{authMode === 'signup' ? 'Already have a profile? Sign in' : 'New here? Create a profile'}</button>}
      </section>
    </div>}

    {dashboardOpen && account && <div className="auth-backdrop dashboard-backdrop" role="presentation" onMouseDown={closeDashboard}>
      <section ref={dashboardDialogRef} tabIndex={-1} className="dashboard-modal" role="dialog" aria-modal="true" aria-labelledby="dashboard-title" onMouseDown={(event) => event.stopPropagation()}>
        <button className="auth-close" onClick={closeDashboard} aria-label="Close dashboard"><X size={18} /></button>
        <div className="dashboard-heading"><span className="auth-mark"><LayoutDashboard size={18} /></span><div><p className="eyebrow">Your dashboard</p><h2 id="dashboard-title">Hello, {account.name}.</h2></div></div>
        <div className="dashboard-profile"><span className="dashboard-avatar">{account.name.charAt(0).toUpperCase()}</span><div><strong>{account.name}</strong><span>{account.email}</span></div></div>
        <div className="dashboard-stats" aria-label="Profile status"><div><span>Profile</span><strong>This device</strong></div><div><span>Translator</span><strong>Ready</strong></div><div><span>Voice language</span><strong>{SPEECH_LANGUAGES[speechLang].name}</strong></div></div>
        <div className="dashboard-details"><p>Profile details</p><dl><div><dt>Name</dt><dd>{account.name}</dd></div><div><dt>Email</dt><dd>{account.email}</dd></div></dl></div>
        <button className="auth-submit" onClick={() => { setDashboardOpen(false); document.getElementById('try-it')?.scrollIntoView({ behavior: reducedMotion ? 'auto' : 'smooth' }) }}>Open translator <ArrowDownRight size={15} /></button>
      </section>
    </div>}

    {aboutOpen && <div className="auth-backdrop about-backdrop" role="presentation" onMouseDown={closeAbout}>
      <section ref={aboutDialogRef} tabIndex={-1} className="about-modal" role="dialog" aria-modal="true" aria-labelledby="about-title" onMouseDown={(event) => event.stopPropagation()}>
        <button className="auth-close" onClick={closeAbout} aria-label="Close About Us dialog"><X size={18} /></button>
        <div className="about-identity">
          <span className="about-logo-mark"><img src="/yap-render-logo-mark.png" alt="Yap & Render logo" /></span>
          <p className="about-logo-wordmark">yap <span>&amp;</span> render</p>
        </div>
        <p className="eyebrow">About us</p>
        <h2 id="about-title">Making space for<br /><em>every voice.</em></h2>
        <p className="about-copy">Yap &amp; Render is building a more connected future through language and technology.</p>
        <p className="about-copy">We turn spoken words into Indian Sign Language, helping conversations feel more open and human.</p>
        <p className="about-copy">Our work brings together thoughtful design, accessible technology, and real community needs.</p>
        <p className="about-copy">Together, we are creating more ways for people to be heard, understood, and included.</p>
        <div className="about-team" aria-label="Yap and Render team">
          {team.map((member) => <div className="about-member" key={member.name}>
            <div className="about-member-avatar" aria-label={`${member.name} profile picture`}>{member.image ? <img src={member.image} alt="" /> : member.name.charAt(0)}</div>
            <strong>{member.name}</strong><span>{member.role}</span>
            {member.linkedin && <a className="about-member-link" href={member.linkedin} target="_blank" rel="noreferrer" aria-label={`Open ${member.name}'s LinkedIn profile`}><span className="about-member-link-mark">in</span> LinkedIn</a>}
          </div>)}
        </div>
      </section>
    </div>}

    <div className={sign.active ? 'sign-dialog-root' : undefined} inert={!sign.active && landingDialogOpen} role={sign.active ? 'dialog' : undefined} aria-modal={sign.active ? true : undefined} aria-labelledby={sign.active ? 'sign-stage-title' : undefined}>
      {!sign.active && !hasOpenedSign && <div id="sign-stage" hidden />}
      {(sign.active || hasOpenedSign) && <Suspense fallback={<section id="sign-stage" className="sign-stage sign-stage-loading" aria-hidden={!sign.active} inert={!sign.active} style={{ opacity: sign.active ? 1 : 0, pointerEvents: sign.active ? 'auto' : 'none' }}>
        <div className="sign-loading-card"><h2 id="sign-stage-title" className="sign-sr-only">You Sign. We Speak.</h2><p role="status">Opening your signing space…</p><button type="button" autoFocus className="sign-stage-close" aria-label="Close Sign to Text" onClick={() => sign.close()}><X size={20} /></button></div>
      </section>}><SignStage active={sign.active} status={sign.status} origin={sign.origin} attachVideo={sign.attachVideo} onAccept={sign.acceptPrivacy} onRetry={sign.requestCamera} onClose={sign.close} /></Suspense>}
      <Dock signActive={sign.active} cameraLive={sign.status === 'live'} onSign={sign.open} onExit={sign.close} onAbout={openAbout} />
    </div>
    </>
  )
}
