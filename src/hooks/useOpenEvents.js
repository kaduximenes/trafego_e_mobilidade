import { useCallback, useEffect, useMemo, useState } from 'react'
import { aggregateEvents, fetchActiveEvents } from '../services/apiEvents'

export function useOpenEvents({ pollingMs = 60000 } = {}) {
  const [events, setEvents] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [lastUpdated, setLastUpdated] = useState(null)

  const refresh = useCallback(async ({ silent = false } = {}) => {
    if (!silent) setLoading(true)

    try {
      const nextEvents = await fetchActiveEvents()
      setEvents(nextEvents)
      setError(null)
      setLastUpdated(new Date().toISOString())
    } catch (err) {
      // Mantém o último resultado válido no polling para não zerar o dashboard
      // em falhas transitórias de rede.
      setError(err?.message || 'Erro ao carregar ocorrências.')
    } finally {
      if (!silent) setLoading(false)
    }
  }, [])

  useEffect(() => {
    let cancelled = false

    const run = async () => {
      if (cancelled) return
      await refresh({ silent: false })
      if (cancelled) return
      setLoading(false)
    }

    void run()

    const intervalId = setInterval(() => {
      if (!cancelled) {
        void refresh({ silent: true })
      }
    }, pollingMs)

    return () => {
      cancelled = true
      clearInterval(intervalId)
    }
  }, [pollingMs, refresh])

  const summary = useMemo(() => aggregateEvents(events), [events])

  return {
    events,
    loading,
    error,
    lastUpdated,
    refresh,
    ...summary,
  }
}
