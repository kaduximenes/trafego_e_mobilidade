import { percentiles } from '../../data/mockData'
import { formatDecimal } from '../../utils/format'

export function Percentiles() {
  return (
    <div className="grid grid-cols-5 gap-2 p-5">
      {percentiles.map((p) => (
        <div
          key={p.label}
          className="group flex flex-col items-center justify-center rounded-xl border border-corborder bg-cordeep/50 py-4 transition-all duration-300 hover:-translate-y-0.5"
          style={{ boxShadow: 'none' }}
          onMouseEnter={(e) => {
            e.currentTarget.style.borderColor = p.color
            e.currentTarget.style.boxShadow = `0 0 18px ${p.color}33`
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.borderColor = ''
            e.currentTarget.style.boxShadow = 'none'
          }}
        >
          <span className="text-[11px] font-semibold uppercase tracking-wider text-text-muted">
            {p.label}
          </span>
          <span className="mt-1.5 font-mono text-lg font-bold tabular" style={{ color: p.color }}>
            {formatDecimal(p.value)}
          </span>
        </div>
      ))}
    </div>
  )
}
