import { useCallback, useEffect, useMemo, useState } from 'react'
import { getSnapshot, listFrames } from '../services/history'
import { DEFAULT_TIMELINE_WINDOW_HOURS, TIMELINE_WINDOWS } from '../constants/timelineWindows'
import { TimeCursorContext } from './timeCursorContext'

// Cursor temporal do painel.
//
// Regra central: `cursor === null` significa AO VIVO. Qualquer outro valor é um
// instante ISO em modo histórico, e nesse caso o mapa desenha o frame daquele
// momento em vez dos dados ao vivo. Manter isso explícito evita o pior cenário
// operacional possível: o operador olhar dado antigo acreditando ser o agora.

// Velocidades de reprodução. O rótulo é um múltiplo do ritmo base de 60 s por
// quadro: 0,5× segura 120 s em cada quadro e 12× passa um a cada 5 s.
//
// Atenção: isso NÃO é "velocidade em relação ao tempo real". Como a coleta é a
// cada 15 min, mesmo 1× avança bem mais rápido que o relógio — por isso a barra
// mostra os segundos por quadro, que é a informação sem ambiguidade.
const PLAYBACK_BASE_MS = 60000

const PLAYBACK_SPEEDS = [
  { label: '0,5×', ms: PLAYBACK_BASE_MS / 0.5 },
  { label: '1×', ms: PLAYBACK_BASE_MS },
  { label: '2×', ms: PLAYBACK_BASE_MS / 2 },
  { label: '4×', ms: PLAYBACK_BASE_MS / 4 },
  { label: '12×', ms: PLAYBACK_BASE_MS / 12 },
]

// A lista de frames é recarregada periodicamente para que a linha do tempo
// incorpore as coletas novas sem exigir recarregar a página. A cadência da
// coleta é de 15 min, então 5 min mantém a janela atualizada sem custo relevante.
const DEFAULT_FRAME_REFRESH_MS = 5 * 60 * 1000

export function TimeCursorProvider({
  children,
  windowHours: initialWindowHours = DEFAULT_TIMELINE_WINDOW_HOURS,
  frameRefreshMs = DEFAULT_FRAME_REFRESH_MS,
}) {
  const [cursor, setCursor] = useState(null)
  const [windowHours, setWindowHours] = useState(initialWindowHours)
  // `loadedForHours: null` representa "ainda carregando". Guardar para qual
  // janela os frames foram carregados permite derivar o estado de carregamento
  // (e dar feedback ao trocar a janela) sem setState em efeito.
  const [framesState, setFramesState] = useState({ loadedForHours: null, list: [] })
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
      const requestedHours = windowHours
      try {
        const to = new Date()
        const from = new Date(to.getTime() - requestedHours * 60 * 60 * 1000)
        const list = await listFrames({ from: from.toISOString(), to: to.toISOString(), signal })
        if (signal?.aborted) return
        setFramesState({ loadedForHours: requestedHours, list })
        setError(null)
      } catch (err) {
        if (signal?.aborted) return
        // Marca a janela como carregada mesmo em erro: sem isso a interface
        // ficaria presa em "carregando" e nunca mostraria a falha.
        setFramesState({ loadedForHours: requestedHours, list: [] })
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

    // Atualização silenciosa: não mexe em `refreshing`, para não piscar o
    // estado de carregamento a cada ciclo.
    const id = setInterval(() => {
      void loadFrames(controller.signal)
    }, frameRefreshMs)

    return () => {
      controller.abort()
      clearInterval(id)
    }
  }, [loadFrames, frameRefreshMs])

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
  const loadingFrames = framesState.loadedForHours !== windowHours || refreshing
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
      // Segundos de reprodução por quadro: o rótulo "1×" é um múltiplo do ritmo
      // base, não do tempo real, então expor isso evita interpretação errada.
      secondsPerFrame: Math.round(speedMs / 1000),
      windowOptions: TIMELINE_WINDOWS,
      windowHours,
      setWindowHours,
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
      speedMs,
      windowHours,
      refreshFrames,
      enterHistory,
      goLive,
      step,
    ],
  )

  return <TimeCursorContext.Provider value={value}>{children}</TimeCursorContext.Provider>
}
