export type SpeechLanguage = 'en-IN' | 'hi-IN'

export function speechVoices(language: SpeechLanguage) {
  if (typeof window === 'undefined' || !('speechSynthesis' in window)) return []
  return speechSynthesis.getVoices().filter((voice) => voice.lang.toLowerCase().startsWith(language.slice(0, 2))).sort((a, b) =>
    Number(b.localService) - Number(a.localService) || Number(b.lang === language) - Number(a.lang === language))
}

export function speakText(text: string, language: SpeechLanguage, voice: SpeechSynthesisVoice | undefined, onState: (state: 'speaking' | 'idle' | 'error') => void) {
  const speech = window.speechSynthesis
  speech.cancel()
  const utterance = new SpeechSynthesisUtterance(text)
  utterance.lang = language
  if (voice) utterance.voice = voice
  let cancelled = false
  utterance.onstart = () => { if (!cancelled) onState('speaking') }
  utterance.onend = () => { if (!cancelled) onState('idle') }
  utterance.onerror = () => { if (!cancelled) onState('error') }
  speech.speak(utterance)
  return () => { cancelled = true; speech.cancel() }
}
