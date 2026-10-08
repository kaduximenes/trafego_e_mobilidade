import { useCallback, useEffect, useMemo, useState } from 'react'
import { getCameras } from '../services/tixxi'

export function useCameras() {
  const [cameras, setCameras] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const refresh = useCallback(async ({ silent = false } = {}) => {
    if (!silent) setLoading(true)
    setError(null)
    try {
      setCameras(await getCameras())
    } catch (err) {
      setError(err?.message || 'Erro ao carregar câmeras')
    } finally {
      if (!silent) setLoading(false)
    }
  }, [])

  useEffect(() => {
    let cancelled = false

    void getCameras()
      .then((data) => {
        if (!cancelled) setCameras(data)
      })
      .catch((err) => {
        if (!cancelled) setError(err?.message || 'Erro ao carregar câmeras')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [])

  const counts = useMemo(() => {
    const result = { total: cameras.length }
    for (const camera of cameras) {
      result[camera.statusRaw] = (result[camera.statusRaw] || 0) + 1
    }
    return result
  }, [cameras])

  return { cameras, counts, loading, error, refresh }
}
