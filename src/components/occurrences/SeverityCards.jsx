import { AlertOctagon, AlertTriangle, Info } from 'lucide-react'
import { cn } from '../../utils/cn'

const severityConfig = {
  high: {
    icon: AlertOctagon,
    card: 'border-danger/40 bg-danger/10',
    iconBox: 'bg-danger/20 text-danger',
    glow: 'shadow-[0_0_24px_rgba(239,68,68,0.18)]',
    ping: 'bg-danger',
    label: 'text-danger',
    description: 'Ocorrências críticas • Vias interditadas',
  },
  medium: {
    icon: AlertTriangle,
    card: 'border-warn/40 bg-warn/10',
    iconBox: 'bg-warn/20 text-warn',
    glow: 'shadow-[0_0_18px_rgba(245,158,11,0.12)]',
    ping: 'bg-warn',
    label: 'text-warn',
    description: 'Lentidão • Semáforo desligado',
  },
  low: {
    icon: Info,
    card: 'border-primary-soft/40 bg-primary-soft/10',
    iconBox: 'bg-primary-soft/20 text-primary-soft',
    glow: 'shadow-[0_0_18px_rgba(59,130,246,0.12)]',
    ping: 'bg-primary-soft',
    label: 'text-primary-soft',
    description: 'Manutenção programada • Acostamento',
  },
}

export function SeverityCards({ data = {}, loading = false }) {
  const items = Object.entries(data || {}).map(([key, value]) => {
    if (typeof value === 'object' && value && 'count' in value) {
      return { ...value, key }
    }

    return {
      key,
      label: key === 'high' ? 'Alta' : key === 'low' ? 'Baixa' : 'Média',
      count: Number(value || 0),
      color: severityConfig[key]?.card ? '#ffffff' : undefined,
      description: severityConfig[key]?.description || 'Ocorrência monitorada',
    }
  })

  if (loading) {
    return (
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        {Array.from({ length: 3 }).map((_, index) => (
          <div key={index} className="h-32 animate-pulse rounded-2xl border border-corborder bg-cordeep/60" />
        ))}
      </div>
    )
  }

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
      {items.map((sev) => {
        const cfg = severityConfig[sev.key] || severityConfig.medium
        const Icon = cfg.icon
        return (
          <div
            key={sev.key}
            className={cn(
              'relative overflow-hidden rounded-2xl border p-5 transition-all duration-300 hover:-translate-y-0.5',
              cfg.card,
              cfg.glow,
            )}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className={cn('text-xs font-bold uppercase tracking-wider', cfg.label)}>
                  Gravidade {sev.label}
                </p>
                <p className="mt-2 font-mono text-4xl font-bold leading-none text-text-main tabular">
                  {sev.count}
                </p>
                <p className="mt-2 text-xs text-text-muted">{sev.description || cfg.description}</p>
              </div>
              <span
                className={cn(
                  'grid size-11 shrink-0 place-items-center rounded-xl',
                  cfg.iconBox,
                  sev.key === 'high' && 'animate-pulse',
                )}
              >
                <Icon size={22} strokeWidth={2} />
              </span>
            </div>

            {sev.key === 'high' && (
              <span className="absolute right-3 top-3 flex size-2">
                <span className="absolute inline-flex size-full animate-ping rounded-full bg-danger opacity-60" />
                <span className="relative inline-flex size-2 rounded-full bg-danger" />
              </span>
            )}
          </div>
        )
      })}
    </div>
  )
}
