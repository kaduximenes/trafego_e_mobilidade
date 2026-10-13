import { cn } from '../../utils/cn'
import { describeFreshness } from '../../utils/freshness'

const levelDotStyles = {
  fresh: 'bg-emerald-500',
  warn: 'bg-amber-500',
  stale: 'bg-rose-500',
  unknown: 'bg-slate-400',
}

export function SourceFreshness({ sources = [], now }) {
  return (
    <div className="border-t border-slate-300/60 bg-white/20 px-3 py-2">
      <div className="mb-1.5 text-[9px] font-semibold uppercase tracking-[0.14em] text-slate-500">
        Atualização das fontes
      </div>
      <div className="grid grid-cols-2 gap-x-3 gap-y-1">
        {sources.map(({ key, label, lastUpdated, expectedMs }) => {
          const freshness = describeFreshness(lastUpdated, expectedMs, now)
          return (
            <div
              key={key}
              className="flex min-w-0 items-center gap-1.5"
              title={`${label} • última leitura ${freshness.label}`}
            >
              <span className={cn('h-1.5 w-1.5 shrink-0 rounded-full', levelDotStyles[freshness.level])} />
              <span className="truncate text-[10px] text-slate-600">{label}</span>
              <span
                className={cn(
                  'ml-auto shrink-0 font-mono text-[10px] tabular',
                  freshness.level === 'stale' ? 'font-semibold text-rose-700' : 'text-slate-500',
                )}
              >
                {freshness.label}
              </span>
            </div>
          )
        })}
      </div>
    </div>
  )
}
