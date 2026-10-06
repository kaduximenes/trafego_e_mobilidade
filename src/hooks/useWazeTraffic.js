import { useCallback, useEffect, useMemo, useState } from 'react'
import { MISSING_CONFIG, aggregateAlerts, aggregateTraffic, fetchWazeFeed } from '../services/waze'

export function useWazeTraffic({ pollingMs = 120000 } = {}) {
  const [jams, setJams] = useState([])
  const [alerts, setAlerts] = useState([])
  const [feedEndMillis, setFeedEndMillis] = useState(null)
  const [stale, setStale] = useState(false)
  const [configured, setConfigured] = useState(true)
  const [missing, setMissing] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [lastUpdated, setLastUpdated] = useState(null)

  const refresh = useCallback(async ({ silent = false } = {}) => {
    if (!silent) setLoading(true)

    try {
      const feed = await fetchWazeFeed()
      setJams(feed.jams)
      setAlerts(feed.alerts)
      setFeedEndMillis(feed.feedEndMillis)
      setStale(feed.stale)
      setConfigured(true)
      setMissing([])
      setError(feed.stale ? 'Servindo a última leitura válida — o feed do Waze está indisponível no momento.' : null)
      setLastUpdated(new Date().toISOString())
    } catch (err) {
      // Sem `WAZE_FEED_URL` no servidor: estado "aguardando credenciais" (não é
      // erro de rede). Nos demais casos mantém o último resultado válido para
      // não zerar o painel em falhas transitórias.
      if (err?.code === MISSING_CONFIG) {
        setConfigured(false)
        setMissing(['WAZE_FEED_URL'])
        setError(null)
      } else {
        setError(err?.message || 'Erro ao carregar o tráfego do Waze.')
      }
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

  const traffic = useMemo(() => aggregateTraffic(jams), [jams])
  const alertSummary = useMemo(() => aggregateAlerts(alerts), [alerts])

  return {
    configured,
    missing,
    jams,
    alerts,
    loading,
    error,
    stale,
    lastUpdated,
    feedEndMillis,
    refresh,
    ...traffic,
    ...alertSummary,
  }
}
