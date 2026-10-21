'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { ArrowLeft, Camera, CameraOff, Check, ClipboardCheck, Download, Hand, LoaderCircle, Play, ShieldCheck, Square, Trash2 } from 'lucide-react'
import { useSignMode, warmSignModel } from '@/lib/sign/use-sign-mode'
import { useSignRecognition } from '@/lib/sign/use-sign-recognition'
import type { SignCandidate, TranscriptToken } from '@/lib/sign/types'
import { LIGHTING, PRIORITY_WORDS, SIGNER_TYPES, VALIDATION_SCHEMA, addCandidates, addCommit, addRelease, buildPlan, canonicalId, evaluateValidation, pct, readableTarget, startTrial,
  type TrialOutcome, type ValidationReport, type ValidationSession, type ValidationTrial } from '@/lib/sign/validation'
import { deleteValidationSession, downloadValidationSession, listValidationSessions, saveValidationSession } from '@/lib/sign/validation-store'
import { HandOverlay } from './hand-overlay'

const INTENT_LABELS = { words: 'Words', static: 'Spell', numbers: 'Numbers' } as const
const OUTCOME_LABELS: [TrialOutcome, string][] = [['ok', 'Counted'], ['variant-differs', 'Different sign variant'], ['performance-error', 'Signing error · redo'], ['skipped', 'Skip']]
const emptyForm = { signerId: '', signerType: 'deaf-isl-signer', region: '', dominantHand: 'unknown', inTrainingData: 'unknown', consentId: '', consent: false,
  device: '', lighting: 'bright', background: '', wordSet: 'priority', repeats: 3, phrases: true, letters: true, digits: true, names: '', nonSignSeconds: 60, tracking: true }

function ReportView({ report, title }: { report: ValidationReport; title: string }) {
  const intents = (['words', 'static', 'numbers'] as const).filter(intent => report.byIntent[intent].isolated.trials || report.byIntent[intent].sequence.trials || report.byIntent[intent].nonSign.minutes)
  return <div className="validation-report">
    <h3>{title}</h3>
    <p className={`validation-independence ${report.independence.eligible ? 'is-eligible' : ''}`} role="status">{report.independence.message}</p>
    {!intents.length ? <p className="train-small">No completed trials yet.</p> : <div className="validation-table-wrap"><table className="validation-table">
      <thead><tr><th scope="col">Intent</th><th scope="col">Isolated trials</th><th scope="col">Automatic-commit precision</th><th scope="col">Correct-output coverage</th><th scope="col">Top choice correct</th><th scope="col">Sequence error rate</th><th scope="col">False commits / 10 min</th><th scope="col">Latency after release p50 / p95</th></tr></thead>
      <tbody>{intents.map(intent => { const result = report.byIntent[intent]; return <tr key={intent}>
        <th scope="row">{INTENT_LABELS[intent]}</th><td>{result.isolated.trials}{result.isolated.excluded ? ` (+${result.isolated.excluded} excluded)` : ''}</td>
        <td>{pct(result.isolated.precision)}</td><td>{pct(result.isolated.coverage)}</td><td>{pct(result.isolated.top1)}</td>
        <td>{result.sequence.errorRate === null ? 'n/a' : `${(result.sequence.errorRate * 100).toFixed(1)}% · S${result.sequence.substitutions} I${result.sequence.insertions} D${result.sequence.deletions} / ${result.sequence.referenceTokens}`}</td>
        <td>{result.nonSign.perTenMinutes === null ? 'n/a' : `${result.nonSign.perTenMinutes.toFixed(1)} (${result.nonSign.falseCommits} in ${result.nonSign.minutes.toFixed(1)} min)`}</td>
        <td>{result.latency.p50 === null ? 'n/a' : `${Math.round(result.latency.p50)} / ${Math.round(result.latency.p95!)} ms (${result.latency.measured})`}</td>
      </tr> })}</tbody></table></div>}
    {intents.flatMap(intent => report.byIntent[intent].weakClasses).length > 0 && <p className="train-small">Below 95% precision or 80% recall: {intents.flatMap(intent => report.byIntent[intent].weakClasses.map(entry => `${entry.id} (recall ${entry.recall.k}/${entry.recall.n}, precision ${entry.precision.k}/${entry.precision.n})`)).join(' · ')}</p>}
    <ul className="validation-targets">{report.targets.map(target => <li key={target.name}><strong>{target.status === 'met' ? 'Met (point estimate)' : target.status === 'not-met' ? 'Not met' : 'Insufficient data'}</strong> {target.name} · {target.detail}</li>)}</ul>
  </div>
}

export function ValidationStudio() {
  const camera = useSignMode({ surface: 'training' })
  const [sessions, setSessions] = useState<ValidationSession[]>([])
  const [activeId, setActiveId] = useState('')
  const [form, setForm] = useState(emptyForm)
  const [notice, setNotice] = useState('Create a session for one consented signer. Personal recordings saved in this browser are not used here.')
  const [model, setModel] = useState<{ sha256: string | null; autoAccept: string[] }>({ sha256: null, autoAccept: [] })
  const [phase, setPhase] = useState<'idle' | 'running' | 'review'>('idle')
  const [review, setReview] = useState<ValidationTrial | null>(null)
  const [note, setNote] = useState('')
  const [elapsed, setElapsed] = useState(0)
  const [confirmDelete, setConfirmDelete] = useState('')
  const videoRef = useRef<HTMLVideoElement | null>(null), canvasRef = useRef<HTMLCanvasElement | null>(null), ringRef = useRef<SVGCircleElement | null>(null)
  const trialRef = useRef<ValidationTrial | null>(null), phaseRef = useRef(phase), handsRef = useRef(0)
  phaseRef.current = phase
  const session = sessions.find(entry => entry.id === activeId)
  const planned = session?.plan[0]
  const kind = planned?.intent ?? 'words'
  const live = camera.status === 'live'
  // Trial events are recorded only while a trial runs; nothing is shown to the signer meanwhile.
  const onCommit = useCallback((token: TranscriptToken) => {
    if (trialRef.current && phaseRef.current === 'running' && token.sign) trialRef.current = addCommit(trialRef.current, token.sign)
  }, [])
  const recognition = useSignRecognition({ active: camera.active, live, videoRef, canvasRef, ringRef, onCommit, kind, bodyTracking: session?.app.tracking !== 'hands', personal: false })
  const ready = live && recognition.model === 'ready' && !recognition.dataset.loading && recognition.dataset.kind === kind && recognition.dataset.labels > 0
    && (session?.app.tracking === 'hands' || recognition.tracking.mode !== 'loading')
  const attach = useCallback((video: HTMLVideoElement | null) => { videoRef.current = video; camera.attachVideo(video) }, [camera.attachVideo])

  useEffect(() => {
    const { sessions: stored, warning } = listValidationSessions()
    setSessions(stored)
    if (warning) setNotice(warning)
    fetch('/models/isl-temporal-model.json').then(response => response.ok ? response.json() : null).then(data => {
      if (data) setModel({ sha256: typeof data.sha256 === 'string' ? data.sha256 : null, autoAccept: Array.isArray(data.autoAccept) ? data.autoAccept.filter((label: unknown) => typeof label === 'string') : [] })
    }).catch(() => {})
  }, [])
  useEffect(() => {
    const trial = trialRef.current, snapshot = recognition.snapshot
    if (trial && phaseRef.current === 'running') {
      const at = snapshot.at ?? Date.now()
      const held: SignCandidate[] = snapshot.label && snapshot.phase === 'holding' ? [{ label: snapshot.label, confidence: snapshot.confidence }] : []
      let next = addCandidates(trial, [...(snapshot.candidates ?? []), ...held].map(candidate => {
        const type = candidate.kind ?? (trial.intent === 'words' ? 'word' : /^[0-9]$/.test(candidate.label) ? 'number' : 'letter')
        return { id: candidate.id ?? canonicalId(type, candidate.label), kind: type, score: candidate.confidence }
      }), at)
      if (handsRef.current > 0 && snapshot.handCount === 0) next = addRelease(next, at)
      trialRef.current = next
    }
    handsRef.current = snapshot.handCount
  }, [recognition.snapshot])
  const end = useCallback(() => {
    const trial = trialRef.current
    if (!trial || phaseRef.current !== 'running') return
    trialRef.current = { ...trial, endedAt: Date.now() }
    setReview(trialRef.current); setPhase('review')
  }, [])
  useEffect(() => {
    if (phase !== 'running') return
    const started = Date.now(), seconds = trialRef.current?.seconds
    const timer = window.setInterval(() => {
      setElapsed(Date.now() - started)
      if (seconds && Date.now() - started >= seconds * 1000) end()
    }, 250)
    return () => clearInterval(timer)
  }, [phase, end])
  useEffect(() => {
    if (live || phaseRef.current !== 'running') return
    trialRef.current = null; setPhase('idle')
    setNotice('The camera stopped, so the unfinished trial was discarded. Resume the camera and start it again.')
  }, [live])

  const persist = (next: ValidationSession) => {
    setSessions(current => [next, ...current.filter(entry => entry.id !== next.id)])
    try { saveValidationSession(next) } catch { setNotice('This browser could not save the session. Export it now so the results are not lost.') }
  }
  const create = () => {
    const names = form.names.split(/[,\s]+/).filter(Boolean)
    const problem = !/^[A-Za-z0-9-]{1,32}$/.test(form.signerId) ? 'Use a pseudonymous signer code such as s-017: letters, digits and hyphens only, never a name.'
      : !/^[\w-]{1,64}$/.test(form.consentId) ? 'Enter the ID of the written consent record (letters, digits, hyphens).'
      : !form.consent ? 'Confirm that written informed consent is recorded before starting.'
      : names.some(name => !/^[A-Za-z]{1,12}$/.test(name)) || names.length > 4 ? 'Names to spell: up to 4, letters only, 12 letters each.'
      : form.wordSet === 'auto-accept' && !model.autoAccept.length ? 'The word model list has not loaded yet. Try again in a moment.' : ''
    if (problem) { setNotice(problem); return }
    const seed = crypto.getRandomValues(new Uint32Array(1))[0] & 0x7fffffff
    const next: ValidationSession = {
      schema: VALIDATION_SCHEMA, id: crypto.randomUUID(), createdAt: Date.now(), seed,
      app: { wordModelSha256: model.sha256, tracking: form.tracking ? 'signer' : 'hands', personalRecordings: 'excluded' },
      signer: { id: form.signerId, type: form.signerType as ValidationSession['signer']['type'], region: form.region.trim().slice(0, 60), dominantHand: form.dominantHand as ValidationSession['signer']['dominantHand'], inTrainingData: form.inTrainingData as ValidationSession['signer']['inTrainingData'] },
      consent: { recordId: form.consentId, confirmed: true },
      conditions: { device: form.device.trim().slice(0, 60), lighting: form.lighting as ValidationSession['conditions']['lighting'], background: form.background.trim().slice(0, 60) },
      plan: buildPlan({ words: form.wordSet === 'priority' ? PRIORITY_WORDS : model.autoAccept, repeats: form.repeats, phrases: form.phrases, letters: form.letters, digits: form.digits, names, nonSignSeconds: form.nonSignSeconds }, seed),
      trials: [],
    }
    persist(next); setActiveId(next.id); setForm(emptyForm)
    setNotice(`Session ready with ${next.plan.length} trials. Open the camera, then start the first trial.`)
  }
  const start = () => {
    if (!session || !planned || !ready || phase !== 'idle') return
    trialRef.current = startTrial(planned, `t${session.trials.length + 1}-${Date.now().toString(36)}`, Date.now())
    handsRef.current = recognition.snapshot.handCount
    setElapsed(0); setPhase('running')
    setNotice(planned.block === 'non-sign' ? 'Ordinary movement only: rest, scratch, adjust glasses or hair, use a phone, wave to someone. The trial ends by itself.' : 'Recording. When the signer has finished and lowered their hands, wait about two seconds, then end the trial.')
  }
  const finish = (outcome: TrialOutcome) => {
    const trial = trialRef.current
    if (!session || !trial || phase !== 'review') return
    const [current, ...rest] = session.plan
    persist({ ...session, trials: [...session.trials, { ...trial, outcome, note: note.trim().slice(0, 200) }], plan: outcome === 'performance-error' ? [current, ...rest] : rest })
    trialRef.current = null; setReview(null); setNote(''); setPhase('idle')
    setNotice(outcome === 'performance-error' ? 'Recorded as a signing error; the same trial comes again.' : 'Trial saved on this device.')
  }
  const openCamera = () => {
    if (camera.status === 'primer') camera.acceptPrivacy()
    else if (camera.active) void camera.requestCamera()
    else camera.open({ x: 0, y: 0 })
  }
  const report = useMemo(() => session ? evaluateValidation([session]) : null, [session])
  const overall = useMemo(() => evaluateValidation(sessions), [sessions])
  const set = (key: keyof typeof emptyForm) => (event: { target: { value: string; checked?: boolean; type?: string } }) =>
    setForm(current => ({ ...current, [key]: event.target.type === 'checkbox' ? !!event.target.checked : typeof emptyForm[key] === 'number' ? Number(event.target.value) : event.target.value }))
  const done = session ? session.trials.length : 0, total = session ? done + session.plan.length : 0

  return <main className="training-studio validation-studio">
    <header className="train-header"><Link href="/" className="brand"><Hand size={21} /><span>yap &amp; render</span></Link><span className="train-beta">Signer validation · facilitator</span><Link className="train-back" href="/?mode=sign" onClick={() => camera.close()}><ArrowLeft size={15} /> Live recognition</Link></header>
    <div className="train-heading"><p className="eyebrow"><span className="eyebrow-dot" /> Stage 7 · independent signers</p><h1>A fair test.<br /><em>With real signers.</em></h1><p>Run a facilitated session with a consented ISL signer whose recordings were never used for training. The shipped models are measured end to end through this camera. Only recognized outputs and timings are stored, on this device; no video, images or landmarks.</p></div>
    <div className="train-stats" aria-label="Validation summary"><span><strong>{sessions.length}</strong> sessions on this device</span><span><strong>{overall.independence.unseenIslSigners}</strong> unseen ISL signers</span><span><ShieldCheck size={15} /> Outputs and timings only · personal recordings excluded</span></div>
    <p className="train-notice" role="status">{notice}</p>
    {!session ? <section className="validation-setup" aria-labelledby="validation-setup-title"><p className="eyebrow">01 / New session</p><h2 id="validation-setup-title">Who is signing, and where</h2>
      <div className="validation-form">
        <label className="train-hands-label">Pseudonymous signer code<input value={form.signerId} onChange={set('signerId')} placeholder="s-017" autoComplete="off" /></label>
        <label className="train-hands-label">Signer<select value={form.signerType} onChange={set('signerType')}>{SIGNER_TYPES.map(type => <option key={type} value={type}>{type.replaceAll('-', ' ')}</option>)}</select></label>
        <label className="train-hands-label">Recordings used to train this app?<select value={form.inTrainingData} onChange={set('inTrainingData')}><option value="unknown">Unknown</option><option value="no">No, never recorded for ISL500, INCLUDE or ISLRTC</option><option value="yes">Yes</option></select></label>
        <label className="train-hands-label">Dominant hand<select value={form.dominantHand} onChange={set('dominantHand')}><option value="unknown">Not recorded</option><option value="right">Right</option><option value="left">Left</option><option value="both">Both</option></select></label>
        <label className="train-hands-label">Region or sign variant (optional)<input value={form.region} onChange={set('region')} maxLength={60} /></label>
        <label className="train-hands-label">Device and camera<input value={form.device} onChange={set('device')} maxLength={60} placeholder="laptop-webcam, android-front" /></label>
        <label className="train-hands-label">Lighting<select value={form.lighting} onChange={set('lighting')}>{LIGHTING.map(value => <option key={value}>{value}</option>)}</select></label>
        <label className="train-hands-label">Background (optional)<input value={form.background} onChange={set('background')} maxLength={60} placeholder="plain wall, busy room" /></label>
        <label className="train-hands-label">Words<select value={form.wordSet} onChange={set('wordSet')}><option value="priority">15 priority words</option><option value="auto-accept">{model.autoAccept.length || 52} words that can commit automatically</option></select></label>
        <label className="train-hands-label">Repeats per sign<input type="number" min={1} max={10} value={form.repeats} onChange={set('repeats')} /></label>
        <label className="train-hands-label">Non-sign activity per block (seconds)<input type="number" min={0} max={600} step={30} value={form.nonSignSeconds} onChange={set('nonSignSeconds')} /></label>
        <label className="train-hands-label">Names to fingerspell (optional)<input value={form.names} onChange={set('names')} placeholder="AMIT, RIYA" /></label>
        <label className="train-hands-label">Consent record ID<input value={form.consentId} onChange={set('consentId')} placeholder="consent-2026-0042" autoComplete="off" /></label>
      </div>
      <div className="validation-checks">
        <label><input type="checkbox" checked={form.phrases} onChange={set('phrases')} /> Word sequences</label>
        <label><input type="checkbox" checked={form.letters} onChange={set('letters')} /> Letters A–Z</label>
        <label><input type="checkbox" checked={form.digits} onChange={set('digits')} /> Digits 0–9</label>
        <label><input type="checkbox" checked={form.tracking} onChange={set('tracking')} /> Track body and face (the app default)</label>
        <label className="validation-consent"><input type="checkbox" checked={form.consent} onChange={set('consent')} /> Written informed consent is recorded under this ID for camera use and evaluation of this app. The signer knows that only recognized outputs and timings are kept.</label>
      </div>
      <button type="button" className="train-record-button validation-primary" onClick={create}><ClipboardCheck size={15} /> Create session</button>
    </section> : <section className="train-workspace validation-run" aria-labelledby="validation-run-title">
      <div className="train-label-panel"><p className="eyebrow">02 / Trial {Math.min(done + 1, total)} of {total}</p><h2 id="validation-run-title">Signer {session.signer.id}</h2>
        <p className="train-small">{session.signer.type.replaceAll('-', ' ')} · in training data: {session.signer.inTrainingData} · {session.conditions.device || 'device not recorded'} · {session.conditions.lighting}</p>
        <progress className="train-record-progress" max={Math.max(total, 1)} value={done} aria-label="Session progress" />
        {planned ? <div className="validation-trial" aria-live="polite">
          <span>{INTENT_LABELS[planned.intent]} · {planned.block === 'non-sign' ? `${planned.seconds} s of non-sign movement` : planned.block}</span>
          <strong>{planned.block === 'non-sign' ? 'No signing' : readableTarget(planned.target)}</strong>
          {phase === 'running' && <small>Recording · {(elapsed / 1000).toFixed(0)} s · {recognition.snapshot.handCount} hands in view</small>}
        </div> : <div className="validation-trial"><span>Session complete</span><strong>Export the results</strong></div>}
        {phase === 'review' && review && <div className="validation-review">
          <p><strong>Recognized:</strong> {review.commits.length ? review.commits.map(commit => readableTarget([commit.canonical])).join(', ') : 'nothing committed'}{review.candidates.length ? ` · offered: ${[...review.candidates].sort((a, b) => b.bestScore - a.bestScore).slice(0, 3).map(candidate => readableTarget([candidate.id])).join(', ')}` : ''}</p>
          <label className="train-hands-label">Facilitator note (optional, no names)<input value={note} onChange={event => setNote(event.target.value)} maxLength={200} /></label>
          <div className="validation-outcomes" role="group" aria-label="Trial outcome">{OUTCOME_LABELS.map(([outcome, label]) => <button key={outcome} type="button" onClick={() => finish(outcome)}>{outcome === 'ok' && <Check size={13} />}{label}</button>)}</div>
        </div>}
        <div className="train-record-controls">
          {phase === 'running' ? <button type="button" className="train-record-button" onClick={end}><Square size={14} /> End trial</button>
            : <button type="button" className="train-record-button" onClick={start} disabled={!planned || !ready || phase !== 'idle'}><Play size={14} /> Start trial</button>}
          <button type="button" className="train-camera-stop" onClick={() => { camera.close(); setActiveId(''); setPhase('idle'); trialRef.current = null }} disabled={phase === 'running'}>Leave session</button>
          <span className="train-small">{!live ? 'Open the camera first.' : !ready ? `Loading ${INTENT_LABELS[kind]} recognition…` : 'Recognition ready.'}</span>
        </div>
      </div>
      <div className="train-capture-panel"><div className={`train-camera ${live ? 'is-live' : ''}`}><div className="sign-viewfinder train-viewfinder"><video ref={attach} autoPlay playsInline muted className="sign-camera-video" aria-label="Mirrored validation camera preview" /><HandOverlay canvasRef={canvasRef} />
        {camera.active && <div className="sign-model-chip" role="status">{recognition.model === 'loading' ? <LoaderCircle size={13} className="sign-spinner" /> : recognition.model === 'ready' ? <Check size={13} /> : <CameraOff size={13} />}{ready ? `${INTENT_LABELS[kind]} ready` : 'Preparing recognition…'}</div>}
        {!live && <div className="sign-camera-message"><span className="sign-message-icon"><ShieldCheck size={26} /></span><h3>Camera for this session</h3><p>Frame the signer’s head, elbows and both hands. Video stays on this device.</p>{camera.status !== 'requesting' && camera.status !== 'unsupported' && <button type="button" className="sign-camera-button" onClick={openCamera} onPointerEnter={warmSignModel} onFocus={warmSignModel}><Camera size={15} />{camera.status === 'primer' ? 'Got it. Open the camera' : camera.status === 'paused' ? 'Resume camera' : 'Open camera'}</button>}</div>}
      </div></div></div>
    </section>}
    {report && <section className="train-library"><ReportView report={report} title="This session" /></section>}
    <section className="train-library" aria-labelledby="validation-sessions-title"><div className="train-library-heading"><div><p className="eyebrow">03 / Results</p><h2 id="validation-sessions-title">Sessions <span>{sessions.length}</span></h2>
      <p className="train-small">Export each session and analyse them together with <code>node scripts/evaluate-signer-validation.cjs &lt;files&gt;</code>. Sessions stay in this browser until deleted.</p></div></div>
      {sessions.length > 0 && <ul className="validation-sessions">{sessions.map(entry => <li key={entry.id}>
        <span><strong>{entry.signer.id}</strong> · {new Date(entry.createdAt).toLocaleString()} · {entry.trials.length} done, {entry.plan.length} left</span>
        <span className="train-file-actions">
          {entry.id !== activeId && <button type="button" disabled={phase !== 'idle'} onClick={() => { setActiveId(entry.id); setNotice(`Resumed ${entry.signer.id}.`) }}>Resume</button>}
          <button type="button" onClick={() => downloadValidationSession(entry)}><Download size={13} /> Export JSON</button>
          <button type="button" disabled={entry.id === activeId && phase !== 'idle'} onClick={() => {
            if (confirmDelete !== entry.id) { setConfirmDelete(entry.id); return }
            deleteValidationSession(entry.id); setSessions(current => current.filter(item => item.id !== entry.id)); setConfirmDelete('')
            if (entry.id === activeId) setActiveId('')
          }}><Trash2 size={13} /> {confirmDelete === entry.id ? 'Confirm delete' : 'Delete'}</button>
        </span>
      </li>)}</ul>}
      {sessions.length > 1 && <ReportView report={overall} title="All sessions on this device" />}
    </section>
    <footer className="train-footer"><span><ShieldCheck size={14} /> Stored in this browser · export each session</span><Link href="/?mode=sign" onClick={() => camera.close()}>Back to live recognition <ArrowLeft size={14} /></Link></footer>
  </main>
}
