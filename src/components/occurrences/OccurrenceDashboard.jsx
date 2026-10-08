import { AlertTriangle, RefreshCw, X } from 'lucide-react'
import { useState } from 'react'
import { useFetchEvents } from '../../hooks/useFetchEvents'
import { Panel } from '../ui/Panel'
import { SeverityCards } from './SeverityCards'
import { SeverityProportion } from './SeverityProportion'
import { OccurrenceTypeChart } from './OccurrenceTypeChart'
import { OccurrenceFeed } from './OccurrenceFeed'

export function OccurrenceDashboard() {
  const { loading, error, lastUpdated, refresh, severityCounts, typeCounts, feed } = useFetchEvents({
    pollingMs: 60000,
  })
  const [dismissedError, setDismissedError] = useState(null)

  // Exibe o toast enquanto o erro for novo; após dispensado, prevalece o alerta inline.
  const showToast = Boolean(error) && dismissedError !== error

  return (
    <>
      {error && showToast && (
        <div className="pointer-events-auto fixed right-5 top-5 z-50 max-w-sm rounded-2xl border border-danger/40 bg-[#0b1220]/90 p-4 text-sm text-text-main shadow-2xl shadow-danger/10 backdrop-blur-sm">
          <div className="flex items-start gap-3">
            <div className="mt-0.5 rounded-lg bg-danger/15 p-2 text-danger">
              <AlertTriangle size={16} />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-xs font-bold uppercase tracking-[0.18em] text-danger">Falha de conexão</p>
              <p className="mt-1 text-sm text-text-muted">{error}</p>
            </div>
            <button
              type="button"
              aria-label="Fechar aviso"
              onClick={() => setDismissedError(error)}
              className="rounded-md p-1 text-text-dim transition-colors hover:bg-white/5 hover:text-text-main"
            >
              <X size={14} />
            </button>
          </div>
          <button
            type="button"
            onClick={() => refresh({ silent: false })}
            className="mt-3 inline-flex items-center gap-2 rounded-lg border border-danger/30 bg-danger/10 px-2.5 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-danger transition-colors hover:bg-danger/20"
          >
            <RefreshCw size={12} className={loading ? 'animate-spin' : ''} />
            Recarregar
          </button>
        </div>
      )}

      {error && !showToast && (
        <div className="mb-4 flex items-center justify-between gap-3 rounded-2xl border border-danger/30 bg-danger/10 p-3 text-sm text-danger">
          <div className="flex items-center gap-2">
            <AlertTriangle size={16} />
            <span>{error}</span>
          </div>
          <button
            type="button"
            onClick={() => refresh({ silent: false })}
            className="inline-flex items-center gap-2 rounded-lg border border-danger/30 bg-danger/10 px-2.5 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-danger transition-colors hover:bg-danger/20"
          >
            <RefreshCw size={12} className={loading ? 'animate-spin' : ''} />
            Recarregar
          </button>
        </div>
      )}

      <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
        <div className="lg:col-span-3">
          <SeverityCards data={severityCounts} loading={loading} />
        </div>

        <Panel className="lg:col-span-2">
          <OccurrenceTypeChart data={typeCounts} loading={loading} />
        </Panel>

        <Panel>
          <SeverityProportion data={severityCounts} loading={loading} />
        </Panel>

        <Panel className="lg:col-span-3">
          <OccurrenceFeed data={feed} loading={loading} lastUpdated={lastUpdated} onRefresh={refresh} />
        </Panel>
      </div>
    </>
  )
}
