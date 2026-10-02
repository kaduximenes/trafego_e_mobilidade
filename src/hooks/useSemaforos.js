import { useCallback, useEffect, useMemo, useState } from 'react'
import { aggregateControllers, fetchControllerStatus } from '../services/antares'

export function useSemaforos({ pollingMs = 60000 } = {}) {
  const [controllers, setControllers] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [lastUpdated, setLastUpdated] = useState(null)

  const refresh = useCallback(async ({ silent = false } = {}) => {
    if (!silent) setLoading(true)

    try {
      const next = await fetchControllerStatus()
      setControllers(next)
      setError(null)
      setLastUpdated(new Date().toISOString())
    } catch (err) {
      // Mantém o último resultado válido no polling para não zerar o painel
      // em falhas transitórias de rede.
      setError(err?.message || 'Erro ao carregar os semáforos.')
    } finally {
      if (!silent) setLoading(false)
    }
  }, [])

  useEffect(() => {
    let cancelled = false

    void (async () => {
      if (cancelled) return
      await refresh({ silent: false })
    })()

    const intervalId = setInterval(() => {
      if (!cancelled) void refresh({ silent: true })
    }, pollingMs)

    return () => {
      cancelled = true
      clearInterval(intervalId)
    }
  }, [pollingMs, refresh])

  const summary = useMemo(() => aggregateControllers(controllers), [controllers])

  return {
    controllers,
    loading,
    error,
    lastUpdated,
    refresh,
    ...summary,
  }
}
