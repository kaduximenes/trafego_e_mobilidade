import { Ban, Gauge, MapPin } from 'lucide-react'
import { cn } from '../../utils/cn'
import { formatDecimal, formatNumber } from '../../utils/format'

const BUCKET_TEXT = {
  light: 'text-primary-soft',
  moderate: 'text-warn',
  heavy: 'text-danger',
}

function formatDelay(seconds) {
  if (seconds === -1) return 'Bloqueado'
  if (seconds >= 60) return `${Math.round(seconds / 60)} min`
  return `${seconds}s`
}

export function WazeTopJams({ data = [], loading = false, configured = true }) {
  if (!configured) {
    return (
      <p className="grid h-32 place-items-center px-5 text-center text-sm text-text-muted">
        Aguardando o feed do Waze for Cities.
      </p>
    )
  }

  if (loading) {
    return (
      <div className="flex flex-col gap-2.5 p-4">
        {Array.from({ length: 6 }).map((_, index) => (
          <div key={index} className="h-14 animate-pulse rounded-xl border border-corborder bg-cordeep/60" />
        ))}
      </div>
    )
  }

  const items = Array.isArray(data) ? data : []

  if (!items.length) {
    return (
      <p className="grid h-32 place-items-center px-5 text-center text-sm text-text-muted">
        Nenhum trecho com retenção no momento.
      </p>
    )
  }

  const maxKm = Math.max(...items.map((jam) => jam.lengthKm), 0.1)

  return (
    <div className="flex max-h-[320px] flex-col gap-2.5 overflow-y-auto p-4">
      {items.map((jam, index) => (
        <div
          key={jam.id}
          className="rounded-xl border border-corborder-soft bg-cordeep/40 p-3 transition-all duration-300 hover:border-corborder hover:bg-cordeep/70"
        >
          <div className="flex items-center gap-2.5">
            <span className="grid size-6 shrink-0 place-items-center rounded-md bg-corborder/60 font-mono text-[11px] font-bold text-text-muted tabular">
              {index + 1}
            </span>
            <span
              className="size-2.5 shrink-0 rounded-full"
              style={{ backgroundColor: jam.bucketColor }}
              title={jam.bucketLabel}
            />
            <div className="min-w-0 flex-1">
              <p className="truncate text-xs font-semibold text-text-main">{jam.street}</p>
              <p className="flex items-center gap-1.5 truncate text-[11px] text-text-muted">
                <MapPin size={10} className="shrink-0" />
                {jam.city || 'Município não informado'}
              </p>
            </div>
            <div className="flex shrink-0 flex-col items-end gap-0.5">
              <span className={cn('font-mono text-sm font-bold tabular', BUCKET_TEXT[jam.bucketKey])}>
                {formatDecimal(jam.lengthKm)}
                <span className="ml-0.5 text-[10px] font-normal text-text-dim">km</span>
              </span>
              <span className="flex items-center gap-1.5 font-mono text-[10px] text-text-dim tabular">
                <Gauge size={10} />
                {formatDecimal(jam.speedKmh)} km/h
              </span>
            </div>
          </div>

          <div className="mt-2 flex items-center gap-2">
            <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-cordeep">
              <div
                className="h-full rounded-full transition-all duration-500"
                style={{ width: `${Math.max((jam.lengthKm / maxKm) * 100, 3)}%`, backgroundColor: jam.bucketColor }}
              />
            </div>
            <span
              className={cn(
                'shrink-0 font-mono text-[10px] font-semibold tabular',
                jam.delayS === -1 ? 'text-danger' : 'text-text-muted',
              )}
            >
              {jam.delayS === -1 && <Ban size={10} className="mr-1 inline" />}
              {jam.delayS === -1 ? 'Bloqueado' : `+${formatDelay(jam.delayS)}`}
            </span>
          </div>
        </div>
      ))}

      <p className="text-[11px] text-text-dim">
        Ranking por extensão do trecho entre os <span className="font-semibold">{formatNumber(items.length)}</span>{' '}
        maiores congestionamentos do feed.
      </p>
    </div>
  )
}
