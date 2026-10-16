import { Fragment, useMemo, useState } from 'react'
import { ChevronDown, Search } from 'lucide-react'
import { CAMERA_STATUS } from '../../services/tixxi'
import { cn } from '../../utils/cn'
import { formatNumber } from '../../utils/format'

// Quantas câmeras renderizar por vez: "Operacional" passa de 5 mil itens.
const PAGE_SIZE = 50

function normalize(text) {
  return String(text || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
}

function CameraList({ cameras, color }) {
  const [query, setQuery] = useState('')
  const [limit, setLimit] = useState(PAGE_SIZE)

  const filtered = useMemo(() => {
    const term = normalize(query.trim())
    const sorted = [...cameras].sort((a, b) => String(a.code).localeCompare(String(b.code), 'pt-BR', { numeric: true }))
    if (!term) return sorted
    return sorted.filter((camera) => normalize(camera.name).includes(term) || normalize(camera.code).includes(term))
  }, [cameras, query])

  const visible = filtered.slice(0, limit)

  return (
    <div className="col-span-2 rounded-lg border bg-white/60 p-2" style={{ borderColor: `${color}55` }}>
      <label className="flex items-center gap-1.5 rounded-md border border-slate-200 bg-white px-2 py-1">
        <Search size={12} className="shrink-0 text-slate-400" />
        <input
          type="search"
          value={query}
          onChange={(event) => {
            setQuery(event.target.value)
            setLimit(PAGE_SIZE)
          }}
          placeholder="Buscar por nome ou código"
          className="min-w-0 flex-1 bg-transparent text-[11px] text-slate-700 outline-none placeholder:text-slate-400"
        />
      </label>

      {visible.length ? (
        <ul className="mt-2 max-h-72 space-y-1 overflow-y-auto pr-1">
          {visible.map((camera) => (
            <li key={camera.code} className="flex min-w-0 items-start gap-2 rounded-md bg-white/70 px-2 py-1.5">
              <span className="mt-px shrink-0 font-mono text-[10px] font-semibold text-slate-500">{camera.code}</span>
              <span className="min-w-0 text-[11px] leading-snug text-slate-700">{camera.name || 'Sem nome'}</span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="py-4 text-center text-[11px] text-slate-500">Nenhuma câmera encontrada.</p>
      )}

      {filtered.length > visible.length && (
        <button
          type="button"
          onClick={() => setLimit((current) => current + PAGE_SIZE)}
          className="mt-2 w-full rounded-md border border-slate-200 bg-white/70 py-1 text-[11px] font-semibold text-slate-600 hover:bg-white"
        >
          Mostrar mais ({formatNumber(visible.length)} de {formatNumber(filtered.length)})
        </button>
      )}
    </div>
  )
}

// Botões de status das câmeras: clicar abre, logo abaixo da linha do botão, a
// lista das câmeras naquele status.
export function CameraStatusList({ cameras = [], counts = {} }) {
  const [expanded, setExpanded] = useState(null)

  const byStatus = useMemo(() => {
    const groups = {}
    for (const camera of cameras) {
      ;(groups[camera.statusRaw] ||= []).push(camera)
    }
    return groups
  }, [cameras])

  const statuses = Object.entries(CAMERA_STATUS)
  const expandedIndex = statuses.findIndex(([raw]) => raw === expanded)
  // A grade tem 2 colunas: a lista entra depois do último item da linha aberta.
  const listAfter = expandedIndex < 0 ? -1 : Math.min(expandedIndex - (expandedIndex % 2) + 1, statuses.length - 1)

  return (
    <div className="grid grid-cols-2 gap-1.5 p-3">
      {statuses.map(([raw, status], index) => {
        const open = expanded === raw
        return (
          <Fragment key={raw}>
            <button
              type="button"
              onClick={() => setExpanded(open ? null : raw)}
              aria-expanded={open}
              className={cn(
                'flex min-w-0 items-center gap-1.5 rounded-lg border px-2 py-1.5 text-left transition-colors',
                open ? 'border-slate-300 bg-white/80 shadow-sm' : 'border-white/50 bg-white/35 hover:bg-white/60',
              )}
            >
              <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: status.color }} />
              <span className="truncate text-[10px] font-medium text-slate-600">{status.label}</span>
              <strong className="ml-auto text-xs text-slate-800">{formatNumber(counts[raw] || 0)}</strong>
              <ChevronDown size={12} className={cn('shrink-0 text-slate-400 transition-transform', open && 'rotate-180')} />
            </button>
            {index === listAfter && (
              <CameraList key={expanded} cameras={byStatus[expanded] || []} color={CAMERA_STATUS[expanded].color} />
            )}
          </Fragment>
        )
      })}
    </div>
  )
}
