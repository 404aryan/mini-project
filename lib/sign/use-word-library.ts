'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { emptyWordDataset } from './word-data'
import { readStoredWords, subscribeWordChanges } from './word-store'

export function useWordLibrary() {
  const [dataset, setDataset] = useState(emptyWordDataset)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const generation = useRef(0)
  const refresh = useCallback(async () => {
    const ticket = ++generation.current
    try {
      const value = await readStoredWords()
      if (ticket === generation.current) { setDataset(value); setError('') }
      return value
    } catch (cause) {
      if (ticket === generation.current) setError(cause instanceof Error ? cause.message : 'Word storage unavailable.')
      return null
    } finally { if (ticket === generation.current) setLoading(false) }
  }, [])
  useEffect(() => {
    void refresh()
    const unsubscribe = subscribeWordChanges(() => { void refresh() })
    return () => { generation.current++; unsubscribe() }
  }, [refresh])
  return { dataset, loading, error, refresh }
}
