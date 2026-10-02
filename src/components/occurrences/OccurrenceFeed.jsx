import { AlertOctagon, AlertTriangle, Car, Clock, Construction, Droplets, Info, RefreshCw, Wrench } from 'lucide-react'
import { cn } from '../../utils/cn'

const severityBadge = {
  high: 'border-danger/40 bg-danger/15 text-danger',
  medium: 'border-warn/40 bg-warn/15 text-warn',
  low: 'border-primary-soft/40 bg-primary-soft/15 text-primary-soft',
}

const severityIcon = {
  high: AlertOctagon,
  medium: AlertTriangle,
  low: Info,
}

const typeIcons = {
  Car,
  Droplets,
  AlertTriangle,
  Wrench,
  Construction,
}

const severityRank = { high: 0, medium: 1, low: 2 }

const formatTimeAgo = (timestamp) => {
  if (!timestamp) return 'agora'
  const diffMinutes = Math.max(0, Math.round((Date.now() - Number(timestamp)) / 60000))
  if (diffMinutes < 1) return 'agora'
  if (diffMinutes < 60) return `há ${diffMinutes} min`
  const hours = Math.floor(diffMinutes / 60)
  const minutes = diffMinutes % 60
  if (hours < 24) return `há ${hours}h ${minutes}m`
  return `há ${Math.floor(hours / 24)}d ${hours % 24}h`
}

function FeedSkeleton() {
  return (
    <div className="flex max-h-[480px] flex-col gap-2.5 overflow-y-auto p-5">
      {Array.from({ length: 4 }).map((_, index) => (
        <div key={index} className="h-20 animate-pulse rounded-xl border border-corborder bg-cordeep/60" />
      ))}
    </div>
  )
}

export function OccurrenceFeed({ data = [], loading = false, lastUpdated = null, onRefresh }) {
  if (loading) return <FeedSkeleton />

  const items = (Array.isArray(data) ? data : [])
    .slice()
    .sort(
      (a, b) =>
        (severityRank[a.severity] ?? 1) - (severityRank[b.severity] ?? 1) || b.timestamp - a.timestamp,
    )

  return (
    <div className="flex flex-col">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-corborder-soft px-5 py-2.5 text-[11px] text-text-dim">
        <span className="font-medium uppercase tracking-wide">
          {items.length} {items.length === 1 ? 'ocorrência ativa' : 'ocorrências ativas'}
          {lastUpdated && (
            <span className="ml-2 font-normal normal-case tracking-normal text-text-muted">
              • atualizado {formatTimeAgo(new Date(lastUpdated).getTime())}
            </span>
          )}
        </span>
        {onRefresh && (
          <button
            type="button"
            onClick={() => onRefresh()}
            className="inline-flex items-center gap-1.5 rounded-md border border-corborder-soft px-2 py-1 font-semibold uppercase tracking-wide transition-colors hover:border-corborder hover:text-text-main"
          >
            <RefreshCw size={11} />
            Atualizar
          </button>
        )}
      </div>

      {items.length === 0 ? (
        <p className="px-5 py-10 text-center text-sm text-text-muted">
          Nenhuma ocorrência em aberto no momento.
        </p>
      ) : (
        <div className="flex max-h-[480px] flex-col gap-2.5 overflow-y-auto p-5">
          {items.map((o) => {
            const SeIcon = severityIcon[o.severity] || Info
            const TypeIcon = typeIcons[o.icon] || Info
            return (
              <div
                key={o.id}
                className="group flex items-start gap-3 rounded-xl border border-corborder-soft bg-cordeep/40 p-3 transition-all duration-300 hover:border-corborder hover:bg-cordeep/70"
              >
                <span
                  className={cn(
                    'grid size-9 shrink-0 place-items-center rounded-lg',
                    severityBadge[o.severity] || severityBadge.medium,
                  )}
                >
                  <SeIcon size={17} />
                </span>

                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <TypeIcon size={13} className="shrink-0 text-text-dim" />
                    <p className="truncate text-xs font-semibold text-text-main">
                      {o.type} • <span className="font-normal text-text-muted">{o.location}</span>
                    </p>
                  </div>
                  <div className="mt-1.5 flex flex-wrap items-center gap-2">
                    <span
                      className={cn(
                        'rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide',
                        severityBadge[o.severity] || severityBadge.medium,
                      )}
                    >
                      {o.severityLabel || (o.severity === 'high' ? 'Alta' : o.severity === 'low' ? 'Baixa' : 'Média')}
                    </span>
                    {o.typeCode && (
                      <span className="font-mono text-[10px] font-semibold text-text-dim">{o.typeCode}</span>
                    )}
                    <span className="flex items-center gap-1 font-mono text-[10px] text-text-muted tabular">
                      <Clock size={11} />
                      {formatTimeAgo(o.timestamp)}
                    </span>
                    <span className="ml-auto text-[10px] font-medium text-text-muted">{o.status}</span>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
