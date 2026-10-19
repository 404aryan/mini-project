'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { emptyDataset, readStoredDataset, subscribeSampleChanges } from './sample-store'

export function useSampleLibrary() {
  const [dataset, setDataset] = useState(emptyDataset)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const generation = useRef(0)
  const refresh = useCallback(async () => {
    const ticket = ++generation.current
    try {
      const value = await readStoredDataset()
      if (ticket === generation.current) { setDataset(value); setError('') }
      return value
    } catch (cause) {
      if (ticket === generation.current) setError(cause instanceof Error ? cause.message : 'Device storage unavailable.')
      return null
    } finally { if (ticket === generation.current) setLoading(false) }
  }, [])
  useEffect(() => {
    void refresh()
    const unsubscribe = subscribeSampleChanges(() => { void refresh() })
    return () => { generation.current++; unsubscribe() }
  }, [refresh])
  return { dataset, loading, error, refresh }
}
