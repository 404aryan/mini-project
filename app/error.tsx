'use client' // Error boundaries must be Client Components

import { useEffect } from 'react'

// Last-resort boundary for the app: a render failure shows a way back instead
// of a blank page.
export default function Error({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  useEffect(() => {
    console.error(error)
  }, [error])

  return (
    <main className="avatar-load-placeholder" role="alert" style={{ position: 'fixed' }}>
      <div style={{ display: 'grid', justifyItems: 'center', gap: '.7rem', maxWidth: '22rem', padding: '0 1rem', textAlign: 'center' }}>
        <span>Something went wrong while showing this page.</span>
        <button type="button" className="voice-input" style={{ minHeight: 34, background: 'var(--lime)', color: 'var(--primary)' }} onClick={() => retry()}>Try again</button>
      </div>
    </main>
  )
}
