import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { hourlyVolume, peakPeriods } from '../../data/mockData'
import { chartTooltipStyle } from './chartTheme'

function CustomTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null
  return (
    <div style={chartTooltipStyle()}>
      <p style={{ margin: 0, color: 'var(--color-text-muted)', fontWeight: 600 }}>{label}</p>
      <p style={{ margin: '4px 0 0', color: '#42b9eb', fontWeight: 700 }}>
        {payload[0].value.toLocaleString('pt-BR')} veículos
      </p>
    </div>
  )
}

export function TrafficChart() {
  return (
    <div className="h-72 w-full px-2 pb-2 pt-4">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={hourlyVolume} margin={{ top: 10, right: 10, left: -12, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" vertical={false} />
          <XAxis dataKey="hour" tickLine={false} axisLine={false} interval={2} />
          <YAxis tickLine={false} axisLine={false} width={46} />
          <Tooltip content={<CustomTooltip />} cursor={{ fill: 'rgba(66,185,235,0.1)' }} />
          <Bar dataKey="volume" radius={[5, 5, 0, 0]} maxBarSize={26}>
            {hourlyVolume.map((entry, i) => {
              const isMorning = i >= 7 && i <= 9
              const isEvening = i >= 17 && i <= 19
              return (
                <Cell
                  key={entry.hour}
                  fill={isMorning ? peakPeriods.morning.color : isEvening ? peakPeriods.evening.color : '#42b9eb'}
                  fillOpacity={isMorning || isEvening ? 1 : 0.55}
                />
              )
            })}
          </Bar>
          <ReferenceLine x="08h" stroke="#FF9100" strokeDasharray="4 4" label={{ value: 'Pico manhã', position: 'top', fill: '#FF9100' }} />
          <ReferenceLine x="18h" stroke="#42b9eb" strokeDasharray="4 4" label={{ value: 'Pico noite', position: 'top', fill: '#42b9eb' }} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}
