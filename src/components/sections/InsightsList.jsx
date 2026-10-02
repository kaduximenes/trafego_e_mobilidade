import { Lightbulb } from 'lucide-react'
import { insights } from '../../data/mockData'
import { cn } from '../../utils/cn'

const tagStyles = {
  primary: 'bg-primary/15 text-primary',
  violet: 'bg-violet/15 text-violet',
  warn: 'bg-warn/15 text-warn',
  ok: 'bg-ok/15 text-ok',
  danger: 'bg-danger/15 text-danger',
}

export function InsightsList() {
  return (
    <div className="grid grid-cols-1 gap-2 p-5 lg:grid-cols-2">
      {insights.map((insight, i) => (
        <div
          key={i}
          className="group flex items-start gap-4 rounded-xl border border-transparent p-3 transition-all duration-300 hover:border-corborder hover:bg-cordeep/40"
        >
          <span className="grid size-9 shrink-0 place-items-center rounded-full bg-primary/15 font-mono text-sm font-bold text-primary tabular transition-transform duration-300 group-hover:scale-110">
            {i + 1}
          </span>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <Lightbulb size={13} className="shrink-0 text-warn" />
              <h4 className="text-sm font-semibold text-text-main">{insight.title}</h4>
              <span
                className={cn(
                  'ml-auto hidden shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide sm:inline-block',
                  tagStyles[insight.color],
                )}
              >
                {insight.tag}
              </span>
            </div>
            <p className="mt-1 text-xs leading-relaxed text-text-muted">{insight.text}</p>
          </div>
        </div>
      ))}
    </div>
  )
}
