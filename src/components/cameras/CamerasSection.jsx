import { useMemo, useState } from 'react'
import { AlertTriangle, Camera, LoaderCircle, RefreshCw, Search } from 'lucide-react'
import { getStatusInfo } from '../../services/tixxi'
import { CameraCard } from './CameraCard'
import { CameraSummary } from './CameraSummary'
import { cn } from '../../utils/cn'

const PAGE_SIZE = 12

export function CamerasSection({ cameras = [], loading = false, error = null, refresh }) {
  const [query, setQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [visible, setVisible] = useState(PAGE_SIZE)

  const counts = useMemo(() => {
    const c = { total: cameras.length }
    for (const cam of cameras) c[cam.statusRaw] = (c[cam.statusRaw] || 0) + 1
    return c
  }, [cameras])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return cameras.filter((cam) => {
      if (statusFilter !== 'all' && String(cam.statusRaw) !== statusFilter) return false
      if (q && !cam.name.toLowerCase().includes(q) && !String(cam.code).includes(q)) return false
      return true
    })
  }, [cameras, query, statusFilter])

  const shown = filtered.slice(0, visible)

  return (
    <div className="flex flex-col gap-3">
      {/* Barra de filtros */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative min-w-52 flex-1">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-dim" />
          <input
            type="text"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value)
              setVisible(PAGE_SIZE)
            }}
            placeholder="Buscar por nome ou código da câmera…"
            className="w-full rounded-xl border border-corborder bg-cordeep/60 py-2 pl-9 pr-3 text-xs text-text-main outline-none transition-colors placeholder:text-text-dim focus:border-primary/50"
          />
        </div>

        <div className="flex flex-wrap gap-1.5">
          <FilterChip
            active={statusFilter === 'all'}
            onClick={() => setStatusFilter('all')}
            label="Todas"
            color="#00A8FF"
          />
          {['0', '5', '1', '3', 'A'].map((raw) => {
            const info = getStatusInfo(raw)
            return (
              <FilterChip
                key={raw}
                active={statusFilter === raw}
                onClick={() => setStatusFilter(raw)}
                label={`${info.label} (${counts[raw] || 0})`}
                color={info.color}
              />
            )
          })}
        </div>

        {refresh && (
          <button
            type="button"
            onClick={refresh}
            disabled={loading}
            className="inline-flex items-center gap-1.5 rounded-xl border border-corborder bg-cordeep/60 px-3 py-2 text-xs font-medium text-text-muted transition-colors hover:border-primary/50 hover:text-primary disabled:opacity-50"
          >
            <RefreshCw size={13} className={cn(loading && 'animate-spin')} />
            Atualizar
          </button>
        )}
      </div>

      {/* Estados de carregamento / erro */}
      {loading && (
        <div className="flex items-center justify-center gap-3 rounded-2xl border border-corborder bg-corpanel/60 py-16 text-sm text-text-muted">
          <LoaderCircle size={20} className="animate-spin text-primary" />
          Autenticando e carregando câmeras…
        </div>
      )}

      {!loading && error && (
        <div className="flex items-center gap-3 rounded-2xl border border-danger/30 bg-danger/10 p-4">
          <AlertTriangle size={18} className="shrink-0 text-danger" />
          <div>
            <p className="text-sm font-semibold text-danger">Não foi possível carregar as câmeras</p>
            <p className="mt-0.5 text-xs text-text-muted">{error}</p>
          </div>
        </div>
      )}

      {!loading && !error && (
        <>
          <CameraSummary counts={counts} />

          {filtered.length === 0 ? (
            <div className="flex items-center justify-center gap-2 rounded-2xl border border-corborder bg-corpanel/60 py-12 text-sm text-text-muted">
              <Camera size={18} />
              Nenhuma câmera encontrada para o filtro aplicado.
            </div>
          ) : (
            <>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
                {shown.map((cam) => (
                  <CameraCard key={cam.id} camera={cam} />
                ))}
              </div>

              {visible < filtered.length && (
                <button
                  type="button"
                  onClick={() => setVisible((v) => v + PAGE_SIZE)}
                  className="mx-auto rounded-xl border border-corborder bg-cordeep/60 px-5 py-2.5 text-xs font-semibold text-text-muted transition-colors hover:border-primary/50 hover:text-primary"
                >
                  Carregar mais ({filtered.length - visible} restantes)
                </button>
              )}
            </>
          )}
        </>
      )}
    </div>
  )
}

function FilterChip({ active, onClick, label, color }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-[11px] font-medium transition-colors',
        active ? 'border-transparent text-cordeep' : 'border-corborder bg-cordeep/60 text-text-muted hover:text-text-main',
      )}
      style={active ? { backgroundColor: color } : undefined}
    >
      <span className="size-1.5 rounded-full" style={{ backgroundColor: active ? 'rgba(7,13,31,0.55)' : color }} />
      {label}
    </button>
  )
}
