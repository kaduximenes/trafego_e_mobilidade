import { cn } from '../../utils/cn'
import { Panel } from '../ui/Panel'

export function KpiCard({ icon: Icon, label, value, suffix, iconClass, hint, footer }) {
  return (
    <Panel className="group relative overflow-hidden p-5">
      <div className="pointer-events-none absolute -right-8 -top-8 size-28 rounded-full bg-primary/5 blur-2xl transition-opacity group-hover:opacity-100" />
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-wider text-text-muted">{label}</p>
          <p className="mt-2 flex items-baseline gap-1.5">
            <span className="font-mono text-3xl font-bold leading-none text-text-main tabular">
              {value}
            </span>
            {suffix && (
              <span className="font-mono text-sm font-medium text-text-muted tabular">{suffix}</span>
            )}
          </p>
          {hint && <p className="mt-1.5 text-[11px] text-text-dim">{hint}</p>}
        </div>
        <span
          className={cn(
            'grid size-10 shrink-0 place-items-center rounded-xl transition-transform duration-300 group-hover:scale-110',
            iconClass,
          )}
        >
          <Icon size={20} strokeWidth={2} />
        </span>
      </div>
      {footer && <div className="mt-3 border-t border-corborder-soft pt-3">{footer}</div>}
    </Panel>
  )
}
