import { CAMERA_STATUS } from '../../services/tixxi'
import { cn } from '../../utils/cn'

const summaryStyles = {
  ok: 'border-ok/30 bg-ok/10 text-ok',
  danger: 'border-danger/30 bg-danger/10 text-danger',
  warn: 'border-warn/30 bg-warn/10 text-warn',
  maintenance: 'border-violet/30 bg-violet/10 text-violet',
  unknown: 'border-corborder bg-cordeep text-text-muted',
}

export function CameraSummary({ counts }) {
  const total = counts.total || 0

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-5">
      {Object.entries(CAMERA_STATUS).map(([raw, info]) => {
        const count = counts[raw] || 0
        return (
          <div
            key={raw}
            className={cn(
              'rounded-xl border p-3 transition-transform duration-300 hover:-translate-y-0.5',
              summaryStyles[info.badge],
            )}
          >
            <div className="flex items-center gap-2">
              <span className="size-2 rounded-full" style={{ backgroundColor: info.color }} />
              <span className="text-[10px] font-semibold uppercase tracking-wide opacity-80">{info.label}</span>
            </div>
            <p className="mt-2 font-mono text-2xl font-bold leading-none tabular">{count}</p>
            <p className="mt-1 text-[10px] opacity-70">
              {total ? ((count / total) * 100).toLocaleString('pt-BR', { maximumFractionDigits: 1 }) : 0}% do total
            </p>
          </div>
        )
      })}
    </div>
  )
}
