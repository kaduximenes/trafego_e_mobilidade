import { useCallback, useEffect, useMemo, useState } from 'react'
import { getSnapshot, listFrames } from '../services/history'
import { TimeCursorContext } from './timeCursorContext'

// Cursor temporal do painel.
//
// Regra central: `cursor === null` significa AO VIVO. Qualquer outro valor é um
// instante ISO em modo histórico, e nesse caso o mapa desenha o frame daquele
// momento em vez dos dados ao vivo. Manter isso explícito evita o pior cenário
// operacional possível: o operador olhar dado antigo acreditando ser o agora.

const PLAYBACK_SPEEDS = [
  { label: '1×', ms: 60000 },
  { label: '4×', ms: 15000 },
  { label: '12×', ms: 5000 },
]

const DEFAULT_WINDOW_HOURS = 12

export function TimeCursorProvider({ children, windowHours = DEFAULT_WINDOW_HOURS }) {
  const [cursor, setCursor] = useState(null)
  // `loaded: false` representa "ainda carregando" — assim o estado de carregamento
  // é derivado em vez de sincronizado por setState.
  const [framesState, setFramesState] = useState({ loaded: false, list: [] })
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState(null)
  const [playingRequested, setPlayingRequested] = useState(false)
  const [speedIndex, setSpeedIndex] = useState(0)

  // O snapshot é guardado junto do instante a que pertence: assim o estado de
  // "carregando" é derivado (cursor != snapshot.cursor) em vez de sincronizado
  // por setState dentro do efeito.
  const [snapshotState, setSnapshotState] = useState({ forCursor: null, data: null, error: null })

  const loadFrames = useCallback(
    async (signal) => {
      try {
        const to = new Date()
        const from = new Date(to.getTime() - windowHours * 60 * 60 * 1000)
        const list = await listFrames({ from: from.toISOString(), to: to.toISOString(), signal })
        if (signal?.aborted) return
        setFramesState({ loaded: true, list })
        setError(null)
      } catch (err) {
        if (signal?.aborted) return
        setFramesState({ loaded: true, list: [] })
        setError(err?.message || 'Falha ao carregar os instantes do histórico.')
      }
    },
    [windowHours],
  )

  useEffect(() => {
    const controller = new AbortController()
    // Buscar dados ao montar é o caso que a própria regra prevê: sincronizar
    // com um sistema externo (a API de histórico). Não há valor derivável aqui.
    // oxlint-disable-next-line react/set-state-in-effect
    void loadFrames(controller.signal)
    return () => controller.abort()
  }, [loadFrames])

  const refreshFrames = useCallback(async () => {
    setRefreshing(true)
    try {
      await loadFrames()
    } finally {
      setRefreshing(false)
    }
  }, [loadFrames])

  // Busca o frame do instante selecionado. Ao vivo, o mapa volta a consumir os
  // dados em tempo real.
  useEffect(() => {
    if (cursor === null) return undefined

    const controller = new AbortController()

    void (async () => {
      try {
        const result = await getSnapshot(cursor, { signal: controller.signal })
        if (controller.signal.aborted) return
        setSnapshotState({
          forCursor: cursor,
          data: result,
          error: result ? null : 'Nenhum frame gravado para este instante.',
        })
      } catch (err) {
        if (controller.signal.aborted) return
        setSnapshotState({
          forCursor: cursor,
          data: null,
          error: err?.message || 'Falha ao carregar o instante selecionado.',
        })
      }
    })()

    return () => controller.abort()
  }, [cursor])

  const isHistory = cursor !== null
  const frames = framesState.list
  const loadingFrames = !framesState.loaded || refreshing
  const snapshotApplied = isHistory && snapshotState.forCursor === cursor
  const snapshot = snapshotApplied ? snapshotState.data : null
  const loadingSnapshot = isHistory && !snapshotApplied

  const bounds = useMemo(() => {
    if (!frames.length) return null
    return {
      first: frames[0].collectedAt,
      last: frames[frames.length - 1].collectedAt,
    }
  }, [frames])

  const frameInstants = useMemo(
    () => frames.map((frame) => new Date(frame.collectedAt).getTime()),
    [frames],
  )

  // Avança o cursor para o próximo frame gravado, preservando a cadência real
  // da série (não pulando buracos de coleta).
  const step = useCallback(
    (direction) => {
      if (!frameInstants.length) return
      const target = cursor ? new Date(cursor).getTime() : Date.now()
      const next =
        direction > 0
          ? frameInstants.find((instant) => instant > target)
          : [...frameInstants].reverse().find((instant) => instant < target)

      if (next === undefined) return
      setCursor(new Date(next).toISOString())
    },
    [cursor, frameInstants],
  )

  const speedMs = (PLAYBACK_SPEEDS[speedIndex] || PLAYBACK_SPEEDS[0]).ms

  // Chegou ao fim da série: a reprodução para por derivação, sem efeito.
  const atLastFrame =
    isHistory &&
    Boolean(bounds) &&
    Boolean(cursor) &&
    new Date(cursor).getTime() >= new Date(bounds.last).getTime()
  const playing = playingRequested && !atLastFrame

  // Reprodução: anda um frame por tick, na velocidade escolhida.
  useEffect(() => {
    if (!playing || cursor === null) return undefined
    const id = setInterval(() => step(1), speedMs)
    return () => clearInterval(id)
  }, [playing, cursor, step, speedMs])

  const enterHistory = useCallback(
    (instant) => {
      setCursor(instant || bounds?.last || new Date().toISOString())
    },
    [bounds],
  )

  const goLive = useCallback(() => {
    setPlayingRequested(false)
    setCursor(null)
  }, [])

  const value = useMemo(
    () => ({
      cursor,
      isHistory,
      frames,
      bounds,
      frameCount: frames.length,
      loadingFrames,
      loadingSnapshot,
      snapshot,
      error: error || (snapshotApplied ? snapshotState.error : null),
      playing,
      speedLabel: (PLAYBACK_SPEEDS[speedIndex] || PLAYBACK_SPEEDS[0]).label,
      refreshFrames,
      setCursor,
      enterHistory,
      goLive,
      stepPrev: () => step(-1),
      stepNext: () => step(1),
      togglePlay: () => setPlayingRequested((current) => !current),
      cycleSpeed: () => setSpeedIndex((index) => (index + 1) % PLAYBACK_SPEEDS.length),
    }),
    [
      cursor,
      isHistory,
      frames,
      bounds,
      loadingFrames,
      loadingSnapshot,
      snapshot,
      snapshotApplied,
      snapshotState.error,
      error,
      playing,
      speedIndex,
      refreshFrames,
      enterHistory,
      goLive,
      step,
    ],
  )

  return <TimeCursorContext.Provider value={value}>{children}</TimeCursorContext.Provider>
}
