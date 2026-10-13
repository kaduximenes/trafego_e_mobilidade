import { ChevronLeft, ChevronRight, Clock, Gauge, History, Pause, Play, Radio } from 'lucide-react'
import { useTimeCursor } from '../../contexts/timeCursorContext'

// Converte um instante em posição (0..1) dentro da janela de frames.
function positionOf(instant, bounds) {
  if (!bounds || !instant) return 0
  const first = new Date(bounds.first).getTime()
  const last = new Date(bounds.last).getTime()
  if (last <= first) return 1
  const at = new Date(instant).getTime()
  return Math.min(1, Math.max(0, (at - first) / (last - first)))
}

function formatInstant(instant) {
  if (!instant) return '—'
  return new Date(instant).toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function formatClock(instant) {
  if (!instant) return '--:--'
  return new Date(instant).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
}

export function TimelineBar() {
  const {
    isHistory,
    cursor,
    frames,
    bounds,
    frameCount,
    loadingFrames,
    loadingSnapshot,
    snapshot,
    error,
    playing,
    speedLabel,
    enterHistory,
    goLive,
    setCursor,
    stepPrev,
    stepNext,
    togglePlay,
    cycleSpeed,
  } = useTimeCursor()

  const effectiveAt = snapshot?.at || cursor
  const lagMs = snapshot?.effectiveLagMs
  // Ao vivo o cursor está em "agora": a alça fica na ponta direita da janela.
  const position = isHistory ? positionOf(effectiveAt, bounds) : 1
  const hasFrames = frameCount > 0

  const handleSlider = (event) => {
    const ratio = Number(event.target.value) / 1000
    if (!bounds) return
    const first = new Date(bounds.first).getTime()
    const last = new Date(bounds.last).getTime()
    setCursor(new Date(first + (last - first) * ratio).toISOString())
  }

  return (
    <div className="border-t border-slate-200 bg-white/70 px-4 py-2.5 backdrop-blur-sm">
      <div className="flex items-center gap-3">
        <div className="flex shrink-0 items-center gap-1.5">
          <button
            type="button"
            onClick={goLive}
            aria-pressed={!isHistory}
            title="Voltar ao tempo real"
            className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-[10px] font-semibold transition-colors ${
              isHistory
                ? 'border-amber-300 bg-amber-50 text-amber-800 hover:bg-amber-100'
                : 'border-emerald-300 bg-emerald-50 text-emerald-700'
            }`}
          >
            <Radio size={12} className={isHistory ? '' : 'animate-pulse'} />
            {isHistory ? 'Voltar ao vivo' : 'Ao vivo'}
          </button>
        </div>

        <div className="flex shrink-0 items-center gap-1">
          <button
            type="button"
            onClick={stepPrev}
            disabled={!hasFrames}
            aria-label="Instante anterior"
            className="rounded-lg border border-slate-300/70 bg-white/50 p-1.5 text-slate-600 hover:bg-white/80 disabled:opacity-40"
          >
            <ChevronLeft size={14} />
          </button>
          <button
            type="button"
            onClick={() => (isHistory ? togglePlay() : enterHistory())}
            disabled={!hasFrames}
            aria-label={playing ? 'Pausar' : 'Reproduzir'}
            className="rounded-lg border border-slate-300/70 bg-white/50 p-1.5 text-slate-600 hover:bg-white/80 disabled:opacity-40"
          >
            {playing ? <Pause size={14} /> : <Play size={14} />}
          </button>
          <button
            type="button"
            onClick={stepNext}
            disabled={!hasFrames}
            aria-label="Próximo instante"
            className="rounded-lg border border-slate-300/70 bg-white/50 p-1.5 text-slate-600 hover:bg-white/80 disabled:opacity-40"
          >
            <ChevronRight size={14} />
          </button>
          <button
            type="button"
            onClick={cycleSpeed}
            disabled={!isHistory}
            title="Velocidade de reprodução"
            className="inline-flex items-center gap-1 rounded-lg border border-slate-300/70 bg-white/50 px-2 py-1.5 text-[10px] font-semibold text-slate-600 hover:bg-white/80 disabled:opacity-40"
          >
            <Gauge size={12} />
            {speedLabel}
          </button>
        </div>

        <div className="relative min-w-0 flex-1">
          <input
            type="range"
            min="0"
            max="1000"
            value={Math.round(position * 1000)}
            onChange={handleSlider}
            disabled={!hasFrames || loadingFrames}
            aria-label="Linha do tempo"
            className="w-full accent-blue-600 disabled:opacity-40"
          />
          {/* Marcações dos frames gravados: mostram onde há dado e onde há buraco. */}
          {hasFrames && (
            <div className="pointer-events-none absolute inset-x-0 top-1/2 h-1 -translate-y-1/2">
              {frames.map((frame) => (
                <span
                  key={frame.collectedAt}
                  className={`absolute top-0 h-1 w-px ${frame.sourcesFailed?.length ? 'bg-amber-500' : 'bg-slate-400/70'}`}
                  style={{ left: `${positionOf(frame.collectedAt, bounds) * 100}%` }}
                />
              ))}
            </div>
          )}
        </div>

        <div className="flex shrink-0 items-center gap-2 text-[10px] text-slate-600">
          <span className="inline-flex items-center gap-1 font-mono tabular">
            <Clock size={11} />
            {isHistory ? formatClock(effectiveAt) : 'ao vivo'}
          </span>
          <span className="font-mono tabular text-slate-500">{frameCount} frames</span>
        </div>
      </div>

      <div className="mt-1 flex items-center justify-between gap-3 text-[10px]">
        <div className="flex items-center gap-2">
          {isHistory && (
            <span className="inline-flex items-center gap-1 rounded-md bg-amber-100 px-1.5 py-0.5 font-semibold uppercase tracking-wide text-amber-800">
              <History size={10} />
              Modo histórico
            </span>
          )}
          {isHistory && effectiveAt && (
            <span className="text-slate-600">
              Exibindo {formatInstant(effectiveAt)}
              {lagMs > 60000 && (
                <span className="text-slate-500">
                  {' '}(frame {Math.round(lagMs / 60000)} min antes do instante pedido)
                </span>
              )}
            </span>
          )}
          {!isHistory && (
            <span className="text-slate-500">
              {hasFrames ? 'Deslize para revisar o que aconteceu' : 'Sem histórico ainda — a coleta precisa rodar'}
            </span>
          )}
        </div>

        <div className="flex items-center gap-2">
          {loadingSnapshot && <span className="text-slate-500">Carregando instante…</span>}
          {!loadingSnapshot && error && <span className="text-rose-700">{error}</span>}
          {bounds && (
            <span className="font-mono tabular text-slate-500">
              {formatInstant(bounds.first)} → {formatInstant(bounds.last)}
            </span>
          )}
        </div>
      </div>
    </div>
  )
}
