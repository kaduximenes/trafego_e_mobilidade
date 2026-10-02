import { Activity, RefreshCw, TrafficCone } from 'lucide-react'
import { cn } from '../../utils/cn'
import { formatDecimal, formatNumber } from '../../utils/format'

const statusStyles = {
  ok: {
    badge: 'border-ok/40 bg-ok/10 text-ok',
    dot: 'bg-ok',
    iconBox: 'bg-ok/15 text-ok',
    accent: 'text-ok',
    label: 'Sistema operacional',
  },
  warn: {
    badge: 'border-warn/40 bg-warn/10 text-warn',
    dot: 'bg-warn',
    iconBox: 'bg-warn/15 text-warn',
    accent: 'text-warn',
    label: 'Atenção requerida',
  },
  danger: {
    badge: 'border-danger/40 bg-danger/10 text-danger',
    dot: 'bg-danger',
    iconBox: 'bg-danger/15 text-danger',
    accent: 'text-danger',
    label: 'Falhas detectadas',
  },
}

export function TrafficLightKpi({
  loading = false,
  total = 0,
  online = 0,
  offline = 0,
  operationalPct = 0,
  status = 'warn',
  lastUpdated = null,
  onRefresh,
}) {
  if (loading) {
    return (
      <div className="h-full min-h-[212px] animate-pulse rounded-2xl border border-corborder bg-cordeep/60" />
    )
  }

  const s = statusStyles[status] || statusStyles.warn

  return (
    <div className="relative h-full overflow-hidden rounded-2xl border border-corborder bg-corpanel/80 p-5 backdrop-blur-sm transition-all duration-300 card-glow">
      <div
        className={cn('pointer-events-none absolute -right-10 -top-10 size-32 rounded-full blur-3xl', s.dot)}
        style={{ opacity: 0.12 }}
      />

      <div className="relative flex items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className={cn('grid size-9 place-items-center rounded-lg', s.iconBox)}>
              <TrafficCone size={18} strokeWidth={2} />
            </span>
            <p className="text-xs font-semibold uppercase tracking-wider text-text-muted">
              Operação dos Semáforos
            </p>
          </div>

          <p className="mt-3 flex items-baseline gap-1.5">
            <span className={cn('font-mono text-4xl font-bold leading-none tabular', s.accent)}>
              {formatDecimal(operationalPct)}
              <span className="text-xl">%</span>
            </span>
          </p>
          <p className="mt-1 text-xs text-text-muted">Controladores com comunicação ativa</p>

          <p className="mt-3 font-mono text-sm text-text-main tabular">
            <span className={cn('font-bold', s.accent)}>{formatNumber(online)}</span>
            <span className="text-text-muted"> de </span>
            <span className="font-bold">{formatNumber(total)}</span>
            <span className="text-text-muted"> controladores online</span>
          </p>
        </div>

        <span
          className={cn(
            'inline-flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1.5 text-[11px] font-semibold',
            s.badge,
          )}
        >
          <span className="relative flex size-2">
            <span className={cn('absolute inline-flex size-full animate-ping rounded-full opacity-60', s.dot)} />
            <span className={cn('relative inline-flex size-2 rounded-full', s.dot)} />
          </span>
          {s.label}
        </span>
      </div>

      <div className="relative mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-corborder-soft pt-3 text-[11px] text-text-dim">
        <span className="flex items-center gap-1.5">
          <Activity size={12} />
          <span className="font-semibold text-text-main">{formatNumber(offline)}</span>
          <span>sem comunicação / desligados</span>
        </span>
        {onRefresh && (
          <button
            type="button"
            onClick={() => onRefresh()}
            className="inline-flex items-center gap-1.5 rounded-md border border-corborder-soft px-2 py-1 font-semibold uppercase tracking-wide transition-colors hover:border-corborder hover:text-text-main"
          >
            <RefreshCw size={11} />
            Atualizar
          </button>
        )}
        {lastUpdated && (
          <span className="w-full text-text-muted">
            Última leitura: {new Date(lastUpdated).toLocaleTimeString('pt-BR')}
          </span>
        )}
      </div>
    </div>
  )
}
