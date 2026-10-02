import { getStatusInfo } from '../../services/tixxi'
import { cn } from '../../utils/cn'

const badgeStyles = {
  ok: 'border-ok/40 bg-ok/10 text-ok',
  danger: 'border-danger/40 bg-danger/10 text-danger',
  warn: 'border-warn/40 bg-warn/10 text-warn',
  maintenance: 'border-violet/40 bg-violet/10 text-violet',
  unknown: 'border-corborder bg-cordeep text-text-muted',
}

const dotStyles = {
  ok: 'bg-ok',
  danger: 'bg-danger',
  warn: 'bg-warn',
  maintenance: 'bg-violet',
  unknown: 'bg-text-dim',
}

export function CameraStatusBadge({ statusRaw, className }) {
  const status = getStatusInfo(statusRaw)
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide',
        badgeStyles[status.badge],
        className,
      )}
    >
      <span className="relative flex size-1.5">
        <span
          className={cn('absolute inline-flex size-full animate-ping rounded-full opacity-60', dotStyles[status.badge])}
        />
        <span className={cn('relative inline-flex size-1.5 rounded-full', dotStyles[status.badge])} />
      </span>
      {status.label}
    </span>
  )
}
