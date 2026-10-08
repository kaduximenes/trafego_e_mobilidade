import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts'
import { chartTooltipStyle } from '../charts/chartTheme'
import { formatNumber } from '../../utils/format'

function CustomTooltip({ active, payload }) {
  if (!active || !payload?.length) return null
  const d = payload[0].payload
  return (
    <div style={chartTooltipStyle()}>
      <p style={{ margin: 0, color: 'var(--color-text-muted)', fontWeight: 600 }}>{d.label}</p>
      <p style={{ margin: '4px 0 0', color: d.color, fontWeight: 700 }}>
        {formatNumber(d.value)} controladores
      </p>
      <p style={{ margin: '2px 0 0', color: 'var(--color-text-dim)', fontSize: 11 }}>
        {d.pct.toLocaleString('pt-BR', { maximumFractionDigits: 1 })}% do total
      </p>
    </div>
  )
}

export function TrafficLightDonut({ data = [], loading = false, total = 0, normalCount = 0 }) {
  if (loading) {
    return (
      <div className="flex h-full flex-col gap-3 p-4">
        <div className="mx-auto h-40 w-40 animate-pulse rounded-full bg-cordeep/60" />
        <div className="space-y-2">
          {Array.from({ length: 4 }).map((_, index) => (
            <div key={index} className="h-4 animate-pulse rounded bg-cordeep/60" />
          ))}
        </div>
      </div>
    )
  }

  const distribution = Array.isArray(data) ? data : []

  if (!distribution.length) {
    return (
      <p className="grid h-52 place-items-center text-sm text-text-muted">
        Sem dados de controladores para exibir.
      </p>
    )
  }

  return (
    <div className="flex h-full flex-col">
      <div className="relative h-40 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Tooltip content={<CustomTooltip />} />
            <Pie
              data={distribution}
              dataKey="value"
              nameKey="label"
              innerRadius={58}
              outerRadius={82}
              paddingAngle={3}
              cornerRadius={5}
              stroke="none"
            >
              {distribution.map((entry) => (
                <Cell key={entry.key} fill={entry.color} />
              ))}
            </Pie>
          </PieChart>
        </ResponsiveContainer>
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
          <span className="font-mono text-2xl font-bold text-ok tabular">{formatNumber(normalCount)}</span>
          <span className="text-[10px] uppercase tracking-wider text-text-muted">em operação normal</span>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-2 px-5 pb-5 pt-1 sm:grid-cols-2">
        {distribution.map((d) => (
          <div key={d.key} className="flex items-center justify-between gap-2">
            <span className="flex items-center gap-2 text-[11px] text-text-muted">
              <span className="size-2.5 shrink-0 rounded-full" style={{ backgroundColor: d.color }} />
              {d.label}
            </span>
            <span className="font-mono text-[11px] tabular">
              <span className="font-bold text-text-main">{formatNumber(d.value)}</span>{' '}
              <span className="text-text-dim">
                • {d.pct.toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%
              </span>
            </span>
          </div>
        ))}
      </div>

      <p className="px-5 pb-4 pt-0 text-[11px] text-text-dim">
        Total monitorado: <span className="font-mono font-semibold text-text-muted">{formatNumber(total)}</span>{' '}
        controladores
      </p>
    </div>
  )
}
