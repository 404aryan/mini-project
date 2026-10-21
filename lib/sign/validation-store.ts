import { parseValidationSession, type ValidationSession } from './validation'

// One key per session, so a damaged entry cannot hide the others.
const PREFIX = 'yap-render-validation-v1:'

export function listValidationSessions(): { sessions: ValidationSession[]; warning: string } {
  const sessions: ValidationSession[] = []
  let damaged = 0
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i)
      if (!key?.startsWith(PREFIX)) continue
      try { sessions.push(parseValidationSession(JSON.parse(localStorage.getItem(key) ?? ''))) } catch { damaged++ }
    }
  } catch { return { sessions, warning: 'Browser storage is unavailable. Export each session before leaving this page.' } }
  return { sessions: sessions.sort((a, b) => b.createdAt - a.createdAt), warning: damaged ? `${damaged} stored session${damaged === 1 ? ' is' : 's are'} unreadable and ${damaged === 1 ? 'was' : 'were'} skipped.` : '' }
}

/** Throws when storage is full or blocked; the caller keeps the session in memory and offers export. */
export function saveValidationSession(session: ValidationSession) {
  localStorage.setItem(PREFIX + session.id, JSON.stringify(parseValidationSession(session)))
}

export function deleteValidationSession(id: string) {
  try { localStorage.removeItem(PREFIX + id) } catch { /* Nothing stored to remove. */ }
}

export function downloadValidationSession(session: ValidationSession) {
  const url = URL.createObjectURL(new Blob([JSON.stringify(parseValidationSession(session), null, 2)], { type: 'application/json' }))
  const link = document.createElement('a')
  link.href = url; link.download = `isl-validation-${session.signer.id}-${session.id}.json`; link.style.display = 'none'
  document.body.appendChild(link); link.click(); link.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
