import { Car, Gauge, ListOrdered } from 'lucide-react'
import { kpis, speedingBadges } from '../../data/mockData'
import { formatDecimal, formatNumber } from '../../utils/format'
import { cn } from '../../utils/cn'
import { KpiCard } from './KpiCard'

const badgeColors = {
  warn: 'border-warn/40 bg-warn/10 text-warn',
  danger: 'border-danger/40 bg-danger/10 text-danger',
  magenta: 'border-magenta/40 bg-magenta/10 text-magenta',
}

function SpeedingBadges() {
  return (
    <div className="flex flex-wrap items-center gap-3">
      <span className="text-[11px] font-medium text-text-muted">Alertas de excesso:</span>
      <div className="flex items-center gap-3">
        {speedingBadges.map((b) => (
          <div key={b.threshold} className="flex flex-col items-center gap-1">
            <div
              className={cn(
                'flex size-14 flex-col items-center justify-center rounded-full border-2',
                badgeColors[b.color],
              )}
            >
              <span className="font-mono text-xs font-bold leading-none tabular">{b.threshold}</span>
              <span className="mt-0.5 font-mono text-[10px] font-semibold leading-none tabular">
                {formatDecimal(b.pct, 2)}%
              </span>
            </div>
            <span className="font-mono text-[10px] text-text-dim tabular">
              {formatNumber(b.count)} veíc.
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}

export function KpiSection() {
  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
      <KpiCard
        icon={ListOrdered}
        label="Registros totais"
        value={formatNumber(kpis.totalRecords)}
        hint="Veículos detectados por IA no período"
        iconClass="bg-primary/15 text-primary"
      />

      <KpiCard
        icon={Gauge}
        label="Velocidade média geral"
        value={formatDecimal(kpis.avgSpeed)}
        suffix="km/h"
        iconClass="bg-warn/15 text-warn"
        footer={
          <div className="flex items-center justify-between font-mono text-[11px] tabular">
            <span className="text-text-muted">
              Mediana <span className="font-bold text-text-main">{formatDecimal(kpis.medianSpeed)}</span>
            </span>
            <span className="text-text-muted">
              P95 <span className="font-bold text-danger">{formatDecimal(kpis.p95Speed)}</span>
            </span>
          </div>
        }
      />

      <KpiCard
        icon={Car}
        label="Alertas de excesso de velocidade"
        value="2,6%"
        hint="Veículos acima de 40 km/h"
        iconClass="bg-danger/15 text-danger"
        footer={<SpeedingBadges />}
      />
    </div>
  )
}
