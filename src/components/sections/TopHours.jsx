import { topHours } from '../../data/mockData'
import { formatNumber, formatPercent } from '../../utils/format'
import { cn } from '../../utils/cn'

const rankStyles = {
  1: 'bg-warn/20 text-warn border-warn/40',
  2: 'bg-primary/20 text-primary border-primary/40',
  3: 'bg-ok/20 text-ok border-ok/40',
}

export function TopHours() {
  const max = topHours[0].volume
  return (
    <div className="flex flex-col gap-3 p-5">
      {topHours.map((t) => (
        <div key={t.rank} className="group flex items-center gap-3">
          <span
            className={cn(
              'grid size-8 shrink-0 place-items-center rounded-full border text-xs font-bold tabular',
              rankStyles[t.rank] || 'bg-cordeep text-text-muted border-corborder',
            )}
          >
            {t.rank}º
          </span>
          <div className="min-w-0 flex-1">
            <div className="mb-1 flex items-baseline justify-between">
              <span className="font-mono text-sm font-semibold text-text-main tabular">{t.hour}</span>
              <span className="font-mono text-xs text-text-muted tabular">
                {formatNumber(t.volume)}{' '}
                <span className="text-text-dim">• {formatPercent(t.pct)}</span>
              </span>
            </div>
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-cordeep">
              <div
                className="h-full rounded-full bg-gradient-to-r from-primary to-primary-soft transition-all duration-500 group-hover:brightness-125"
                style={{ width: `${(t.volume / max) * 100}%` }}
              />
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}
