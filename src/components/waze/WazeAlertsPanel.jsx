import { useMemo, useState } from 'react'
import { Ban, Car, CircleAlert, Clock, Construction, Droplets, Info, MapPin, OctagonAlert, RefreshCw, TriangleAlert, Wrench } from 'lucide-react'
import { cn } from '../../utils/cn'
import { formatNumber } from '../../utils/format'

const GROUP_ICONS = {
  blocked: Ban,
  accident: Car,
  signal: TriangleAlert,
  construction: Construction,
  jam: Clock,
  lane: OctagonAlert,
  pothole: CircleAlert,
  hazard: Wrench,
  shoulder: Droplets,
  other: Info,
}

const SEVERITY_STYLES = {
  high: 'border-danger/40 bg-danger/15 text-danger',
  medium: 'border-warn/40 bg-warn/15 text-warn',
  low: 'border-primary-soft/40 bg-primary-soft/15 text-primary-soft',
}

const SEVERITY_LABELS = { high: 'Alta', medium: 'Média', low: 'Baixa' }
const SEVERITY_ORDER = ['high', 'medium', 'low']
const EMPTY_ALERTS = []
const EMPTY_GROUPS = []

const formatTimeAgo = (timestamp) => {
  if (!timestamp) return 'agora'
  const minutes = Math.max(0, Math.round((Date.now() - Number(timestamp)) / 60000))
  if (minutes < 1) return 'agora'
  if (minutes < 60) return `há ${minutes} min`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `há ${hours}h`
  return `há ${Math.floor(hours / 24)}d`
}

function GroupChips({ groups = [], alerts = [], selectedGroup, selectedSeverity, onSelect }) {
  if (!groups.length) return null

  const severityFilteredAlerts = selectedSeverity
    ? alerts.filter((alert) => alert.severity === selectedSeverity)
    : alerts
  const counts = new Map()
  for (const alert of severityFilteredAlerts) {
    counts.set(alert.groupKey, (counts.get(alert.groupKey) || 0) + 1)
  }
  const buttonClass = (active) =>
    cn(
      'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[10px] font-medium transition-colors',
      active
        ? 'border-primary/60 bg-primary/15 text-text-main'
        : 'border-corborder-soft bg-cordeep/50 text-text-muted hover:border-corborder hover:text-text-main',
    )

  return (
    <div className="flex flex-wrap gap-1.5 border-b border-corborder-soft px-5 py-3">
      <button
        type="button"
        aria-pressed={!selectedGroup}
        onClick={() => onSelect(null)}
        className={buttonClass(!selectedGroup)}
      >
        Todos
        <span className="font-mono font-bold tabular">{formatNumber(severityFilteredAlerts.length)}</span>
      </button>
      {groups.map((group) => {
        const Icon = GROUP_ICONS[group.key] || Info
        const count = counts.get(group.key) || 0
        if (!count) return null

        return (
          <button
            type="button"
            key={group.key}
            aria-pressed={selectedGroup === group.key}
            onClick={() => onSelect(selectedGroup === group.key ? null : group.key)}
            className={buttonClass(selectedGroup === group.key)}
          >
            <Icon size={11} className="text-text-dim" />
            {group.label}
            <span className="font-mono font-bold tabular">{formatNumber(count)}</span>
          </button>
        )
      })}
    </div>
  )
}

export function WazeAlertsPanel({
  alerts = EMPTY_ALERTS,
  byGroup = EMPTY_GROUPS,
  loading = false,
  configured = true,
  lastUpdated = null,
  onRefresh,
}) {
  const [selectedGroup, setSelectedGroup] = useState(null)
  const [selectedSeverity, setSelectedSeverity] = useState(null)
  const items = useMemo(() => (Array.isArray(alerts) ? alerts : EMPTY_ALERTS), [alerts])
  const filteredItems = useMemo(
    () =>
      items.filter(
        (alert) =>
          (!selectedGroup || alert.groupKey === selectedGroup) &&
          (!selectedSeverity || alert.severity === selectedSeverity),
      ),
    [items, selectedGroup, selectedSeverity],
  )
  const groups = useMemo(() => {
    const severityFilteredItems = selectedSeverity
      ? items.filter((alert) => alert.severity === selectedSeverity)
      : items
    const counts = new Map()
    for (const alert of severityFilteredItems) {
      counts.set(alert.groupKey, (counts.get(alert.groupKey) || 0) + 1)
    }
    return byGroup.map((group) => ({ ...group, count: counts.get(group.key) || 0 }))
  }, [byGroup, items, selectedSeverity])
  const severityCounts = useMemo(() => {
    const groupFilteredItems = selectedGroup
      ? items.filter((alert) => alert.groupKey === selectedGroup)
      : items
    return Object.fromEntries(
      SEVERITY_ORDER.map((severity) => [
        severity,
        groupFilteredItems.filter((alert) => alert.severity === severity).length,
      ]),
    )
  }, [items, selectedGroup])
  const hasFilters = selectedGroup !== null || selectedSeverity !== null

  if (!configured) {
    return (
      <p className="grid h-32 place-items-center px-5 text-center text-sm text-text-muted">
        Aguardando o feed do Waze for Cities.
      </p>
    )
  }

  if (loading) {
    return (
      <div className="flex flex-col gap-2.5 p-4">
        {Array.from({ length: 6 }).map((_, index) => (
          <div key={index} className="h-16 animate-pulse rounded-xl border border-corborder bg-cordeep/60" />
        ))}
      </div>
    )
  }

  return (
    <div className="flex flex-col">
      <GroupChips
        groups={groups}
        alerts={items}
        selectedGroup={selectedGroup}
        selectedSeverity={selectedSeverity}
        onSelect={setSelectedGroup}
      />

      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-corborder-soft px-5 py-2.5 text-[11px] text-text-dim">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-medium uppercase tracking-wide">
            {formatNumber(filteredItems.length)} alertas ativos
          </span>
          <div className="flex flex-wrap items-center gap-1.5">
            {SEVERITY_ORDER.map((severity) => (
              <button
                key={severity}
                type="button"
                aria-pressed={selectedSeverity === severity}
                onClick={() => setSelectedSeverity(selectedSeverity === severity ? null : severity)}
                className={cn(
                  'rounded-full border px-2 py-0.5 font-medium transition-colors',
                  selectedSeverity === severity
                    ? SEVERITY_STYLES[severity]
                    : 'border-corborder-soft text-text-muted hover:border-corborder hover:text-text-main',
                )}
              >
                {SEVERITY_LABELS[severity]} {formatNumber(severityCounts[severity])}
              </button>
            ))}
            {hasFilters && (
              <button
                type="button"
                onClick={() => {
                  setSelectedGroup(null)
                  setSelectedSeverity(null)
                }}
                className="px-1.5 py-0.5 font-semibold text-primary-soft transition-colors hover:text-text-main"
              >
                Limpar filtros
              </button>
            )}
          </div>
        </div>
        {onRefresh && (
          <button
            type="button"
            onClick={() => onRefresh()}
            className="inline-flex items-center gap-1.5 rounded-md border border-corborder-soft px-2 py-1 font-semibold uppercase tracking-wide transition-colors hover:border-corborder hover:text-text-main"
          >
            <RefreshCw size={11} />
            Atualizar
          </button>
        )}
      </div>

      {filteredItems.length === 0 ? (
        <p className="px-5 py-10 text-center text-sm text-text-muted">
          {hasFilters ? 'Nenhum alerta corresponde aos filtros selecionados.' : 'Nenhum alerta relevante no momento.'}
        </p>
      ) : (
        <div className="flex max-h-[340px] flex-col gap-2.5 overflow-y-auto p-4">
          {filteredItems.map((alert) => {
            const Icon = GROUP_ICONS[alert.groupKey] || Info
            const severityClass = SEVERITY_STYLES[alert.severity] || SEVERITY_STYLES.medium
            return (
              <div
                key={alert.id}
                className="flex items-start gap-3 rounded-xl border border-corborder-soft bg-cordeep/40 p-3 transition-all duration-300 hover:border-corborder hover:bg-cordeep/70"
              >
                <span className={cn('grid size-9 shrink-0 place-items-center rounded-lg border', severityClass)}>
                  <Icon size={17} />
                </span>

                <div className="min-w-0 flex-1">
                  <p className="truncate text-xs font-semibold text-text-main">{alert.label}</p>
                  <p className="mt-0.5 flex items-center gap-1.5 truncate text-[11px] text-text-muted">
                    <MapPin size={10} className="shrink-0" />
                    {alert.street || 'Local não informado'}
                    {alert.city && <span className="text-text-dim">• {alert.city}</span>}
                  </p>
                  {alert.description && (
                    <p className="mt-1 line-clamp-2 text-[10px] leading-relaxed text-text-dim">{alert.description}</p>
                  )}
                  <div className="mt-1.5 flex flex-wrap items-center gap-2">
                    <span
                      className={cn(
                        'rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide',
                        severityClass,
                      )}
                    >
                      {SEVERITY_LABELS[alert.severity] || 'Média'}
                    </span>
                    <span className="font-mono text-[10px] text-text-dim tabular">
                      confiabilidade {alert.reliability}/10
                    </span>
                    <span className="ml-auto flex items-center gap-1 font-mono text-[10px] text-text-muted tabular">
                      <Clock size={10} />
                      {formatTimeAgo(alert.updatedAt)}
                    </span>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {lastUpdated && (
        <p className="border-t border-corborder-soft px-5 py-2 text-[10px] text-text-dim">
          Última leitura: {new Date(lastUpdated).toLocaleTimeString('pt-BR')} • fonte: Waze for Cities
        </p>
      )}
    </div>
  )
}
