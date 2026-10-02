import { AlertTriangle, Clock, MapPin, Wrench } from 'lucide-react'
import { cn } from '../../utils/cn'

const groupStyles = {
  offline: {
    row: 'border-danger/25 bg-danger/5',
    icon: 'bg-danger/15 text-danger',
    text: 'text-danger',
    iconComp: AlertTriangle,
  },
  alarm: {
    row: 'border-violet/25 bg-violet/5',
    icon: 'bg-violet/15 text-violet',
    text: 'text-violet',
    iconComp: AlertTriangle,
  },
  flashing: {
    row: 'border-warn/25 bg-warn/5',
    icon: 'bg-warn/15 text-warn',
    text: 'text-warn',
    iconComp: AlertTriangle,
  },
  maintenance: {
    row: 'border-primary-soft/25 bg-primary-soft/5',
    icon: 'bg-primary-soft/15 text-primary-soft',
    text: 'text-primary-soft',
    iconComp: Wrench,
  },
}

const formatSince = (timestamp) => {
  if (!timestamp) return 'sem registro'
  const diffMs = Date.now() - timestamp
  if (diffMs < 0) return 'agora'
  const minutes = Math.floor(diffMs / 60000)
  if (minutes < 60) return `há ${minutes} min`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `há ${hours}h`
  const days = Math.floor(hours / 24)
  if (days < 30) return `há ${days}d`
  return `há ${Math.floor(days / 30)}m`
}

export function TrafficLightOccurrences({ data = [], loading = false }) {
  if (loading) {
    return (
      <div className="flex max-h-[420px] flex-col gap-2.5 overflow-y-auto p-5">
        {Array.from({ length: 5 }).map((_, index) => (
          <div key={index} className="h-16 animate-pulse rounded-xl border border-corborder bg-cordeep/60" />
        ))}
      </div>
    )
  }

  const items = Array.isArray(data) ? data : []

  if (!items.length) {
    return (
      <p className="grid h-40 place-items-center text-sm text-text-muted">
        Todos os controladores estão operando normalmente.
      </p>
    )
  }

  return (
    <div className="flex flex-col">
      <div className="border-b border-corborder-soft px-5 py-2.5 text-[11px] font-medium uppercase tracking-wide text-text-dim">
        {items.length} controladores com falha
      </div>
      <div className="flex max-h-[420px] flex-col gap-2.5 overflow-y-auto p-5">
        {items.map((c) => {
          const s = groupStyles[c.groupKey] || groupStyles.alarm
          const Icon = s.iconComp
          return (
            <div
              key={c.id}
              className={cn(
                'flex items-center gap-3 rounded-xl border p-3 transition-all duration-300 hover:-translate-y-0.5',
                s.row,
              )}
            >
              <span className={cn('grid size-9 shrink-0 place-items-center rounded-lg', s.icon)}>
                <Icon size={17} />
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-xs font-semibold text-text-main">
                  Controlador {c.id}
                  {c.externalCode && <span className="font-normal text-text-dim"> • cód. {c.externalCode}</span>}
                </p>
                <p className={cn('flex items-center gap-1.5 text-[11px] font-medium', s.text)}>
                  {c.estado}
                  {c.flags.length > 0 && (
                    <span className="font-normal text-text-muted">
                      • {c.flags.slice(0, 2).map((f) => f.label).join(', ')}
                      {c.flags.length > 2 && ` +${c.flags.length - 2}`}
                    </span>
                  )}
                </p>
              </div>
              <div className="flex shrink-0 flex-col items-end gap-0.5">
                <span className="flex items-center gap-1 font-mono text-[11px] text-text-muted tabular">
                  <Clock size={11} />
                  {formatSince(c.lastCommunication)}
                </span>
                {c.latitude !== null && c.longitude !== null && (
                  <span className="flex items-center gap-1 font-mono text-[10px] text-text-dim tabular">
                    <MapPin size={10} />
                    {c.latitude.toFixed(4)}, {c.longitude.toFixed(4)}
                  </span>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
