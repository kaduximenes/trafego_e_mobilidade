import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { speedHistogram } from '../../data/mockData'
import { chartTooltipStyle } from './chartTheme'

function CustomTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null
  return (
    <div style={chartTooltipStyle()}>
      <p style={{ margin: 0, color: 'var(--color-text-muted)', fontWeight: 600 }}>Faixa {label} km/h</p>
      <p style={{ margin: '4px 0 0', color: '#2a688f', fontWeight: 700 }}>
        {payload[0].value.toLocaleString('pt-BR')} registros
      </p>
    </div>
  )
}

export function SpeedHistogram() {
  return (
    <div className="h-64 w-full px-2 pb-2 pt-4">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={speedHistogram} margin={{ top: 10, right: 10, left: -14, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" vertical={false} />
          <XAxis dataKey="range" tickLine={false} axisLine={false} interval={1} />
          <YAxis tickLine={false} axisLine={false} width={46} />
          <Tooltip content={<CustomTooltip />} cursor={{ fill: 'rgba(66,185,235,0.1)' }} />
          <Bar dataKey="freq" radius={[4, 4, 0, 0]} maxBarSize={30}>
            {speedHistogram.map((entry) => {
              const kmh = parseInt(entry.range, 10)
              const fill = kmh >= 40 ? '#c93643' : kmh >= 35 ? '#a85d00' : '#2a688f'
              return <Cell key={entry.range} fill={fill} fillOpacity={kmh >= 40 ? 1 : 0.72} />
            })}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}
