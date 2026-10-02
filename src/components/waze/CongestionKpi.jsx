import { Activity, AlertTriangle, KeyRound, RefreshCw, Route } from 'lucide-react'
import { cn } from '../../utils/cn'
import { formatDecimal, formatNumber } from '../../utils/format'

function PendingState({ missing }) {
  return (
    <div className="relative overflow-hidden rounded-2xl border border-dashed border-corborder bg-corpanel/60 p-5">
      <div className="flex items-start gap-3">
        <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary">
          <KeyRound size={17} />
        </span>
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-wider text-text-muted">
            Quilômetros de Engarrafamento
          </p>
          <p className="mt-1.5 text-sm font-semibold text-text-main">Aguardando credenciais do Waze for Cities</p>
          <p className="mt-1 text-[11px] text-text-muted">
            O KPI usa o feed de congestionamento do programa Waze for Cities, disponível apenas para parceiros
            aprovados. Nenhum número é exibido enquanto a integração não estiver habilitada.
          </p>
          <p className="mt-2 font-mono text-[10px] text-text-dim">
            Faltando: {missing.length > 0 ? missing.join(', ') : 'VITE_WAZE_FEED_URL'}
          </p>
        </div>
      </div>
    </div>
  )
}

export function CongestionKpi({
  configured = false,
  missing = [],
  loading = false,
  error = null,
  congestionKm = 0,
  totalKm = 0,
  slowKm = 0,
  jamCount = 0,
  avgCongestedSpeedKmh = null,
  byLevel = [],
  lastUpdated = null,
  onRefresh,
}) {
  if (!configured) return <PendingState missing={missing} />

  if (loading) {
    return (
      <div className="h-full min-h-[212px] animate-pulse rounded-2xl border border-corborder bg-cordeep/60" />
    )
  }

  const dominant = byLevel.reduce((acc, level) => (!acc || level.km > acc.km ? level : acc), null)
  const accent = dominant?.color || '#EF4444'

  return (
    <div className="relative flex h-full flex-col overflow-hidden rounded-2xl border border-corborder bg-corpanel/80 p-5 backdrop-blur-sm transition-all duration-300 card-glow">
      <div
        className="pointer-events-none absolute -right-10 -top-10 size-32 rounded-full blur-3xl"
        style={{ backgroundColor: accent, opacity: 0.12 }}
      />

      <div className="relative flex items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="grid size-9 place-items-center rounded-lg bg-danger/15 text-danger">
              <Route size={18} strokeWidth={2} />
            </span>
            <p className="text-xs font-semibold uppercase tracking-wider text-text-muted">
              Quilômetros de Engarrafamento
            </p>
          </div>

          <p className="mt-3 flex items-baseline gap-1.5">
            <span className="font-mono text-4xl font-bold leading-none text-text-main tabular">
              {formatDecimal(congestionKm)}
            </span>
            <span className="text-xl font-bold text-text-muted">km</span>
          </p>
          <p className="mt-1 text-xs text-text-muted">
            em {formatNumber(jamCount)} trechos com tráfego intenso ou parado
          </p>

          <p className="mt-3 font-mono text-sm text-text-main tabular">
            <span className="font-bold text-warn">{formatDecimal(slowKm)}</span>
            <span className="text-text-muted"> km em lentidão • </span>
            <span className="font-bold">{formatDecimal(totalKm)}</span>
            <span className="text-text-muted"> km monitorados</span>
          </p>
        </div>

        {avgCongestedSpeedKmh !== null && (
          <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-danger/40 bg-danger/10 px-3 py-1.5 text-[11px] font-semibold text-danger">
            <Activity size={12} />
            {formatDecimal(avgCongestedSpeedKmh)} km/h
          </span>
        )}
      </div>

      {error && (
        <div className="relative mt-3 flex items-start gap-2 rounded-lg border border-warn/30 bg-warn/10 p-2 text-[11px] text-warn">
          <AlertTriangle size={13} className="mt-0.5 shrink-0" />
          <span className="min-w-0">{error}</span>
        </div>
      )}

      {byLevel.length > 0 && (
        <div className="relative mt-4 flex flex-col gap-2">
          <div className="flex h-2.5 w-full overflow-hidden rounded-full bg-cordeep">
            {byLevel.map((level) => (
              <div
                key={level.key}
                className="h-full transition-all duration-500"
                style={{ width: `${level.pct}%`, backgroundColor: level.color }}
                title={`${level.label}: ${level.km} km`}
              />
            ))}
          </div>
          <div className="flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-text-muted">
            {byLevel.map((level) => (
              <span key={level.key} className="flex items-center gap-1.5">
                <span className="size-2 rounded-full" style={{ backgroundColor: level.color }} />
                {level.label}
                <span className="font-mono tabular text-text-dim">{formatDecimal(level.km)} km</span>
              </span>
            ))}
          </div>
        </div>
      )}

      <div className="relative mt-auto flex flex-wrap items-center justify-between gap-2 border-t border-corborder-soft pt-3 text-[11px] text-text-dim">
        <span className="font-medium uppercase tracking-wide">Fonte: Waze for Cities</span>
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
          <span className={cn('w-full text-text-muted')}>
            Última leitura: {new Date(lastUpdated).toLocaleTimeString('pt-BR')}
          </span>
        )}
      </div>
    </div>
  )
}
