import { cn } from '../../utils/cn'

export function Panel({ children, className, as: Tag = 'section' }) {
  return (
    <Tag
      className={cn(
        'rounded-2xl border border-corborder bg-corpanel/80 backdrop-blur-sm',
        'shadow-[0_10px_30px_-15px_rgba(0,0,0,0.6)] transition-all duration-300 card-glow',
        className,
      )}
    >
      {children}
    </Tag>
  )
}

export function PanelHeader({ title, subtitle, icon: Icon, right }) {
  return (
    <div className="flex items-start justify-between gap-4 border-b border-corborder-soft px-5 py-4">
      <div className="flex items-center gap-3">
        {Icon && (
          <span className="grid size-9 place-items-center rounded-lg bg-primary/10 text-primary">
            <Icon size={18} strokeWidth={2} />
          </span>
        )}
        <div>
          <h3 className="text-sm font-semibold tracking-wide text-text-main">{title}</h3>
          {subtitle && <p className="mt-0.5 text-xs text-text-muted">{subtitle}</p>}
        </div>
      </div>
      {right && <div className="shrink-0">{right}</div>}
    </div>
  )
}

export function SectionTitle({ icon: Icon, title, subtitle }) {
  return (
    <div className="mb-3 flex items-center gap-2.5 px-1">
      {Icon && (
        <span className="grid size-7 place-items-center rounded-md bg-primary/15 text-primary">
          <Icon size={15} strokeWidth={2.2} />
        </span>
      )}
      <div>
        <h2 className="text-sm font-bold uppercase tracking-[0.14em] text-text-main">{title}</h2>
        {subtitle && <p className="text-xs text-text-muted">{subtitle}</p>}
      </div>
    </div>
  )
}
