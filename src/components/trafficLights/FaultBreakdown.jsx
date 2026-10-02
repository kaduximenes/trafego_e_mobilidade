import { AlertTriangle, Wrench } from 'lucide-react'
import { cn } from '../../utils/cn'
import { formatNumber } from '../../utils/format'

const severityStyles = {
  danger: {
    row: 'border-danger/25 bg-danger/5',
    icon: 'bg-danger/15 text-danger',
    text: 'text-danger',
    bar: 'bg-danger',
    iconComp: AlertTriangle,
  },
  warn: {
    row: 'border-warn/25 bg-warn/5',
    icon: 'bg-warn/15 text-warn',
    text: 'text-warn',
    bar: 'bg-warn',
    iconComp: Wrench,
  },
}

export function FaultBreakdown({ data = [], loading = false, total = 0 }) {
  if (loading) {
    return (
      <div className="flex flex-col gap-4 p-5">
        {Array.from({ length: 5 }).map((_, index) => (
          <div key={index} className="h-9 animate-pulse rounded-lg bg-cordeep/60" />
        ))}
      </div>
    )
  }

  const faults = Array.isArray(data) ? data : []

  if (!faults.length) {
    return (
      <p className="grid h-40 place-items-center text-sm text-text-muted">
        Nenhuma falha registrada no momento.
      </p>
    )
  }

  const max = Math.max(...faults.map((f) => f.value), 1)
  const visible = faults.slice(0, 7)

  return (
    <div className="flex flex-col gap-3 p-5">
      {visible.map((fault) => {
        const s = severityStyles[fault.severity] || severityStyles.warn
        const Icon = s.iconComp
        return (
          <div
            key={fault.key}
            className={cn('rounded-lg border p-2.5 transition-all duration-300 hover:-translate-y-0.5', s.row)}
          >
            <div className="flex items-center gap-2.5">
              <span className={cn('grid size-7 shrink-0 place-items-center rounded-md', s.icon)}>
                <Icon size={14} />
              </span>
              <p className="min-w-0 flex-1 truncate text-xs font-semibold text-text-main">{fault.label}</p>
              <span className="shrink-0 font-mono text-xs tabular">
                <span className={cn('font-bold', s.text)}>{formatNumber(fault.value)}</span>
                <span className="text-text-dim">
                  {' '}
                  • {fault.pct.toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%
                </span>
              </span>
            </div>
            <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-cordeep">
              <div
                className={cn('h-full rounded-full transition-all duration-500', s.bar)}
                style={{ width: `${Math.max((fault.value / max) * 100, 3)}%` }}
              />
            </div>
          </div>
        )
      })}

      <p className="text-[11px] text-text-dim">
        Percentuais sobre <span className="font-mono font-semibold text-text-muted">{formatNumber(total)}</span>{' '}
        controladores monitorados.
      </p>
    </div>
  )
}
