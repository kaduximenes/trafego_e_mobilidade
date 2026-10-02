import { useCallback, useEffect, useMemo, useState } from 'react'
import { MISSING_CONFIG, aggregateTraffic, fetchTrafficJams, getWazeConfig } from '../services/waze'

export function useWazeTraffic({ pollingMs = 120000 } = {}) {
  const config = useMemo(() => getWazeConfig(), [])
  const [jams, setJams] = useState([])
  const [loading, setLoading] = useState(config.ready)
  const [error, setError] = useState(null)
  const [lastUpdated, setLastUpdated] = useState(null)

  const refresh = useCallback(
    async ({ silent = false } = {}) => {
      if (!config.ready) return
      if (!silent) setLoading(true)

      try {
        const next = await fetchTrafficJams()
        setJams(next)
        setError(null)
        setLastUpdated(new Date().toISOString())
      } catch (err) {
        // Mantém o último resultado válido no polling para não zerar o painel
        // em falhas transitórias de rede.
        setError(err?.code === MISSING_CONFIG ? null : err?.message || 'Erro ao carregar o tráfego do Waze.')
      } finally {
        if (!silent) setLoading(false)
      }
    },
    [config.ready],
  )

  useEffect(() => {
    // Sem credenciais o hook não faz polling; `loading` já inicia como false
    // porque é derivado de config.ready no useState.
    if (!config.ready) return undefined

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
  }, [config.ready, pollingMs, refresh])

  const summary = useMemo(() => aggregateTraffic(jams), [jams])

  return {
    configured: config.ready,
    missing: config.missing,
    jams,
    loading,
    error,
    lastUpdated,
    refresh,
    ...summary,
  }
}
