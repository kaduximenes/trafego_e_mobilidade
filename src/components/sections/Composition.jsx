import { composition } from '../../data/mockData'
import { formatNumber, formatPercent } from '../../utils/format'

export function Composition() {
  return (
    <div className="grid grid-cols-1 gap-x-8 gap-y-4 p-5 sm:grid-cols-2">
      {composition.map((c) => (
        <div key={c.key} className="group">
          <div className="mb-1.5 flex items-baseline justify-between">
            <span className="flex items-center gap-2 text-xs font-medium text-text-main">
              <span className="size-2 rounded-full" style={{ backgroundColor: c.color }} />
              {c.label}
            </span>
            <span className="font-mono text-xs text-text-muted tabular">
              <span className="font-semibold text-text-main">{formatNumber(c.value)}</span>{' '}
              <span className="text-text-dim">• {formatPercent(c.pct)}</span>
            </span>
          </div>
          <div className="h-2.5 w-full overflow-hidden rounded-full bg-cordeep">
            <div
              className="h-full rounded-full transition-all duration-500 group-hover:brightness-125"
              style={{
                width: `${c.pct}%`,
                backgroundColor: c.color,
                boxShadow: `0 0 12px ${c.color}66`,
              }}
            />
          </div>
        </div>
      ))}
    </div>
  )
}
