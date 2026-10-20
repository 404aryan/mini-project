'use client'

import { useState } from 'react'
import { WORD_SIGNS, STATIC_SIGNS } from '@/lib/islVocabulary'

type Coverage = { summary: { bundledWordEntries: number; learnedWordClasses: number; bundledStaticEntries: number }; entries: { id: string; recognition: { trained: boolean; modelAlias: string | null; autoAccept: string } }[] }
const AVAILABILITY: Record<string, string> = {
  'calibrated-runtime-gates': 'Bundled · adds after calibrated check',
  'suggestion-only': 'Bundled · suggestion only, tap to add',
  'experimental-runtime-gates-only': 'Bundled · experimental',
  'numbers-intent-only': 'Bundled · Numbers mode only (same handshape as letter O)',
}

export function VocabularyCoverage() {
  const [report, setReport] = useState<Coverage | null>(null)
  const [error, setError] = useState('')
  const [query, setQuery] = useState('')
  const [loading, setLoading] = useState(false)
  const load = async () => {
    if (report || loading) return
    setLoading(true); setError('')
    try {
      const response = await fetch('/models/isl-coverage.json')
      if (!response.ok) throw new Error('Coverage could not load. Try again.')
      setReport(await response.json())
    } catch { setError('Coverage could not load. Try again.') }
    finally { setLoading(false) }
  }
  const entries = [...WORD_SIGNS, ...STATIC_SIGNS].filter(sign => `${sign.id} ${sign.label} ${sign.aliases.en.join(' ')}`.toLowerCase().includes(query.toLowerCase()))
  return <details className="sign-vocabulary-coverage" onToggle={event => { if (event.currentTarget.open) void load() }}>
    <summary>Avatar vocabulary &amp; recognition coverage</summary>
    <p>{WORD_SIGNS.length} animated words, A–Z and 0–9. Recognition is experimental; sign variants still need ISL review.</p>
    {report && <p>{report.summary.bundledWordEntries} word entries ({report.summary.learnedWordClasses} distinct model classes) and {report.summary.bundledStaticEntries} letters/numbers have bundled data. Other entries need personal recordings.</p>}
    <label>Find a sign<input type="search" value={query} onChange={event => setQuery(event.target.value)} placeholder="HELLO, hi, THANK YOU, letter:I…" /></label>
    {loading && <p role="status">Loading coverage…</p>}
    {error && <p role="status">{error} <button type="button" onClick={load}>Retry coverage</button></p>}
    <div className="sign-coverage-list">{entries.map(sign => {
      const evidence = report?.entries.find(entry => entry.id === sign.id)
      return <div key={sign.id}><strong>{sign.label}</strong><span>{sign.kind}{sign.aliases.en.length ? ` · ${sign.aliases.en.join(', ')}` : ''}</span><span>{evidence ? evidence.recognition.trained ? AVAILABILITY[evidence.recognition.autoAccept] ?? 'Bundled · experimental' : 'Needs recordings' : 'Checking coverage'}{evidence?.recognition.modelAlias ? ` · model alias: ${evidence.recognition.modelAlias.replaceAll('_', ' ')}` : ''}</span></div>
    })}{!entries.length && <p>No matching sign in the avatar vocabulary.</p>}</div>
    <a href="/models/isl-coverage.json" target="_blank" rel="noreferrer">Full coverage, sources &amp; review status</a>
  </details>
}
