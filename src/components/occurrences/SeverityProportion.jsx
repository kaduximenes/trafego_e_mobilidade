import { formatNumber } from '../../utils/format'

const severityLabelMap = {
  high: 'Alta',
  medium: 'Média',
  low: 'Baixa',
}

const severityColorMap = {
  high: '#EF4444',
  medium: '#F59E0B',
  low: '#3B82F6',
}

export function SeverityProportion({ data = {}, loading = false }) {
  const values = Object.entries(data || {}).map(([key, value]) => {
    if (typeof value === 'object' && value && 'count' in value) {
      return { ...value, key }
    }

    return {
      key,
      label: key === 'high' ? 'Alta' : key === 'low' ? 'Baixa' : 'Média',
      count: Number(value || 0),
      color: severityColorMap[key] || '#3B82F6',
    }
  })

  const total = values.reduce((acc, s) => acc + Number(s.count || 0), 0)

  if (loading) {
    return (
      <div className="flex flex-col gap-3 p-4">
        <div className="h-5 animate-pulse rounded-full bg-cordeep/60" />
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, index) => (
            <div key={index} className="h-4 animate-pulse rounded bg-cordeep/60" />
          ))}
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-5 p-4">
      <div className="flex h-5 w-full overflow-hidden rounded-full bg-cordeep">
        {values.map((s) => (
          <div
            key={s.key}
            className="h-full transition-all duration-500"
            style={{
              width: total ? `${(Number(s.count || 0) / total) * 100}%` : '0%',
              backgroundColor: s.color || severityColorMap[s.key] || '#3B82F6',
              boxShadow: `0 0 14px ${(s.color || severityColorMap[s.key] || '#3B82F6')}55`,
            }}
          />
        ))}
      </div>

      <div className="flex flex-col gap-3">
        {values.map((s) => {
          const pct = total ? (Number(s.count || 0) / total) * 100 : 0
          return (
            <div key={s.key} className="flex items-center justify-between gap-3">
              <span className="flex items-center gap-2 text-xs text-text-muted">
                <span
                  className="size-2.5 rounded-full"
                  style={{ backgroundColor: s.color || severityColorMap[s.key] || '#3B82F6' }}
                />
                Gravidade {s.label || severityLabelMap[s.key] || 'Média'}
              </span>
              <span className="font-mono text-xs tabular">
                <span className="font-bold text-text-main">{formatNumber(Number(s.count || 0))}</span>{' '}
                <span className="text-text-dim">• {pct.toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%</span>
              </span>
            </div>
          )
        })}
      </div>
    </div>
  )
}
