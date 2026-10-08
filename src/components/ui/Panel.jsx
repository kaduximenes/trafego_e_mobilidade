import { cn } from '../../utils/cn'

export function Panel({ children, className, as: Tag = 'section' }) {
  return (
    <Tag
      className={cn(
        'rounded-lg border border-corborder bg-corpanel',
        'shadow-[0_5px_18px_-14px_rgba(19,51,90,0.35)] transition-all duration-200 card-glow',
        className,
      )}
    >
      {children}
    </Tag>
  )
}

export function PanelHeader({ title, subtitle, icon: Icon, right }) {
  return (
    <div className="flex items-start justify-between gap-3 border-b border-corborder-soft px-4 py-2.5">
      <div className="flex items-center gap-2.5">
        {Icon && (
          <span className="grid size-8 place-items-center rounded-lg bg-primary/10 text-primary">
            <Icon size={16} strokeWidth={2} />
          </span>
        )}
        <div>
          <h3 className="text-sm font-semibold text-text-main">{title}</h3>
          {subtitle && <p className="mt-0.5 text-xs text-text-muted">{subtitle}</p>}
        </div>
      </div>
      {right && <div className="shrink-0">{right}</div>}
    </div>
  )
}

export function SectionTitle({ icon: Icon, title, subtitle }) {
  return (
    <div className="mb-2 flex items-center gap-2 px-1">
      {Icon && (
        <span className="grid size-6 place-items-center rounded-md bg-primary/15 text-primary">
          <Icon size={14} strokeWidth={2.2} />
        </span>
      )}
      <div>
        <h2 className="text-sm font-bold uppercase text-text-main">{title}</h2>
        {subtitle && <p className="text-xs text-text-muted">{subtitle}</p>}
      </div>
    </div>
  )
}
