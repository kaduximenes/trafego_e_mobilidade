import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { chartTooltipStyle } from '../charts/chartTheme'

const MAX_LABEL_LENGTH = 28

function truncate(label) {
  const value = String(label ?? '')
  return value.length > MAX_LABEL_LENGTH ? `${value.slice(0, MAX_LABEL_LENGTH - 1)}…` : value
}

function CustomTooltip({ active, payload }) {
  if (!active || !payload?.length) return null
  const item = payload[0].payload
  return (
    <div style={chartTooltipStyle()}>
      <p style={{ margin: 0, color: 'var(--color-text-muted)', fontWeight: 600 }}>{item.label}</p>
      <p style={{ margin: '4px 0 0', color: item.color, fontWeight: 700 }}>
        {payload[0].value} ocorrências
      </p>
    </div>
  )
}

export function OccurrenceTypeChart({ data = [], loading = false }) {
  const chartData = Array.isArray(data) ? data : []

  if (loading) {
    return <div className="h-64 w-full animate-pulse rounded-2xl bg-cordeep/60 p-4" />
  }

  if (!chartData.length) {
    return (
      <p className="grid h-64 w-full place-items-center text-sm text-text-muted">
        Sem ocorrências para exibir no período.
      </p>
    )
  }

  return (
    <div className="h-64 w-full px-2 pb-2 pt-4">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={chartData} margin={{ top: 10, right: 10, left: -16, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" vertical={false} />
          <XAxis
            dataKey="label"
            tickLine={false}
            axisLine={false}
            interval={0}
            tick={{ fontSize: 10 }}
            tickFormatter={truncate}
            angle={-14}
            textAnchor="end"
            height={56}
          />
          <YAxis tickLine={false} axisLine={false} width={40} allowDecimals={false} />
          <Tooltip content={<CustomTooltip />} cursor={{ fill: 'rgba(66,185,235,0.1)' }} />
          <Bar dataKey="value" radius={[5, 5, 0, 0]} maxBarSize={34}>
            {chartData.map((entry) => (
              <Cell key={entry.key} fill={entry.color} fillOpacity={0.85} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}
