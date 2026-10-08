import { Ban, Car, CircleAlert, Clock, Construction, Droplets, Info, MapPin, OctagonAlert, RefreshCw, TriangleAlert, Wrench } from 'lucide-react'
import { cn } from '../../utils/cn'
import { formatNumber } from '../../utils/format'

const GROUP_ICONS = {
  blocked: Ban,
  accident: Car,
  signal: TriangleAlert,
  construction: Construction,
  jam: Clock,
  lane: OctagonAlert,
  pothole: CircleAlert,
  hazard: Wrench,
  shoulder: Droplets,
  other: Info,
}

const SEVERITY_STYLES = {
  high: 'border-danger/40 bg-danger/15 text-danger',
  medium: 'border-warn/40 bg-warn/15 text-warn',
  low: 'border-primary-soft/40 bg-primary-soft/15 text-primary-soft',
}

const SEVERITY_LABELS = { high: 'Alta', medium: 'Média', low: 'Baixa' }

const formatTimeAgo = (timestamp) => {
  if (!timestamp) return 'agora'
  const minutes = Math.max(0, Math.round((Date.now() - Number(timestamp)) / 60000))
  if (minutes < 1) return 'agora'
  if (minutes < 60) return `há ${minutes} min`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `há ${hours}h`
  return `há ${Math.floor(hours / 24)}d`
}

function GroupChips({ groups = [] }) {
  if (!groups.length) return null

  return (
    <div className="flex flex-wrap gap-1.5 border-b border-corborder-soft px-5 py-3">
      {groups.map((group) => {
        const Icon = GROUP_ICONS[group.key] || Info
        return (
          <span
            key={group.key}
            className="inline-flex items-center gap-1.5 rounded-full border border-corborder-soft bg-cordeep/50 px-2.5 py-1 text-[10px] font-medium text-text-muted"
          >
            <Icon size={11} className="text-text-dim" />
            {group.label}
            <span className="font-mono font-bold text-text-main tabular">{formatNumber(group.count)}</span>
          </span>
        )
      })}
    </div>
  )
}

export function WazeAlertsPanel({
  alerts = [],
  byGroup = [],
  bySeverity = { high: 0, medium: 0, low: 0 },
  loading = false,
  configured = true,
  lastUpdated = null,
  onRefresh,
}) {
  if (!configured) {
    return (
      <p className="grid h-32 place-items-center px-5 text-center text-sm text-text-muted">
        Aguardando o feed do Waze for Cities.
      </p>
    )
  }

  if (loading) {
    return (
      <div className="flex flex-col gap-2.5 p-4">
        {Array.from({ length: 6 }).map((_, index) => (
          <div key={index} className="h-16 animate-pulse rounded-xl border border-corborder bg-cordeep/60" />
        ))}
      </div>
    )
  }

  const items = Array.isArray(alerts) ? alerts : []

  return (
    <div className="flex flex-col">
      <GroupChips groups={byGroup} />

      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-corborder-soft px-5 py-2.5 text-[11px] text-text-dim">
        <span className="font-medium uppercase tracking-wide">
          {formatNumber(items.length)} alertas ativos
          <span className="ml-2 font-normal normal-case tracking-normal text-text-muted">
            • Alta <span className="font-mono font-bold text-danger tabular">{formatNumber(bySeverity.high)}</span> • Média{' '}
            <span className="font-mono font-bold text-warn tabular">{formatNumber(bySeverity.medium)}</span> • Baixa{' '}
            <span className="font-mono font-bold text-primary-soft tabular">{formatNumber(bySeverity.low)}</span>
          </span>
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
      </div>

      {items.length === 0 ? (
        <p className="px-5 py-10 text-center text-sm text-text-muted">
          Nenhum alerta relevante no momento.
        </p>
      ) : (
        <div className="flex max-h-[340px] flex-col gap-2.5 overflow-y-auto p-4">
          {items.map((alert) => {
            const Icon = GROUP_ICONS[alert.groupKey] || Info
            const severityClass = SEVERITY_STYLES[alert.severity] || SEVERITY_STYLES.medium
            return (
              <div
                key={alert.id}
                className="flex items-start gap-3 rounded-xl border border-corborder-soft bg-cordeep/40 p-3 transition-all duration-300 hover:border-corborder hover:bg-cordeep/70"
              >
                <span className={cn('grid size-9 shrink-0 place-items-center rounded-lg border', severityClass)}>
                  <Icon size={17} />
                </span>

                <div className="min-w-0 flex-1">
                  <p className="truncate text-xs font-semibold text-text-main">{alert.label}</p>
                  <p className="mt-0.5 flex items-center gap-1.5 truncate text-[11px] text-text-muted">
                    <MapPin size={10} className="shrink-0" />
                    {alert.street || 'Local não informado'}
                    {alert.city && <span className="text-text-dim">• {alert.city}</span>}
                  </p>
                  {alert.description && (
                    <p className="mt-1 line-clamp-2 text-[10px] leading-relaxed text-text-dim">{alert.description}</p>
                  )}
                  <div className="mt-1.5 flex flex-wrap items-center gap-2">
                    <span
                      className={cn(
                        'rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide',
                        severityClass,
                      )}
                    >
                      {SEVERITY_LABELS[alert.severity] || 'Média'}
                    </span>
                    <span className="font-mono text-[10px] text-text-dim tabular">
                      confiabilidade {alert.reliability}/10
                    </span>
                    <span className="ml-auto flex items-center gap-1 font-mono text-[10px] text-text-muted tabular">
                      <Clock size={10} />
                      {formatTimeAgo(alert.updatedAt)}
                    </span>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {lastUpdated && (
        <p className="border-t border-corborder-soft px-5 py-2 text-[10px] text-text-dim">
          Última leitura: {new Date(lastUpdated).toLocaleTimeString('pt-BR')} • fonte: Waze for Cities
        </p>
      )}
    </div>
  )
}
