import { memo, useEffect, useMemo, useState } from 'react'
import {
  CircleMarker,
  MapContainer,
  Popup,
  TileLayer,
  Tooltip,
  useMap,
  useMapEvents,
} from 'react-leaflet'
import { AlertTriangle, Power, RefreshCw, TrafficCone } from 'lucide-react'
import { CONTROLLER_GROUPS } from '../../services/antares'
import { cn } from '../../utils/cn'

// Centro aproximado do município do Rio de Janeiro.
const RIO_CENTER = [-22.9068, -43.1729]
const RIO_BOUNDS = [
  [-23.05, -43.75],
  [-22.74, -43.09],
]

const TILE_URL = 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png'
const TILE_ATTRIBUTION =
  '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions">CARTO</a>'

const SEVERITY_COLORS = {
  high: '#EF4444',
  medium: '#F59E0B',
  low: '#3B82F6',
}

const SIGNAL_COLORS = {
  normal: '#10B981',
  flashing: '#F59E0B',
  alarm: '#8B5CF6',
  offline: '#EF4444',
  maintenance: '#3B82F6',
  unknown: '#64748B',
}

const toLatLng = (latitude, longitude) => [Number(latitude), Number(longitude)]

// A partir deste zoom os marcadores individuais substituem os agregados.
const CLUSTER_MAX_ZOOM = 12
const CELL_DIVISOR = 26

// Grade em pixels na tela: agrupa apenas o que está visualmente sobreposto,
// mantendo a contagem correta em qualquer nível de zoom.
function clusterPoints(points, map, color) {
  const groups = new Map()

  for (const point of points) {
    const projected = map.project(toLatLng(point.latitude, point.longitude), map.getZoom())
    const key = `${Math.floor(projected.x / CELL_DIVISOR)}:${Math.floor(projected.y / CELL_DIVISOR)}`
    const bucket = groups.get(key)
    if (bucket) {
      bucket.points.push(point)
    } else {
      groups.set(key, { points: [point], x: projected.x, y: projected.y })
    }
  }

  return Array.from(groups.values()).map((group) => {
    const sums = group.points.reduce(
      (acc, point) => ({
        latitude: acc.latitude + Number(point.latitude),
        longitude: acc.longitude + Number(point.longitude),
      }),
      { latitude: 0, longitude: 0 },
    )

    return {
      key: `${color}:${group.points[0].id}`,
      x: group.x,
      y: group.y,
      latitude: sums.latitude / group.points.length,
      longitude: sums.longitude / group.points.length,
      count: group.points.length,
      points: group.points,
      color,
    }
  })
}

const ClusterMarkers = memo(function ClusterMarkers({ points, loading, onSelect }) {
  const map = useMap()
  const [zoom, setZoom] = useState(() => map.getZoom())

  useMapEvents({
    zoomend: () => setZoom(map.getZoom()),
  })

  if (loading || zoom >= CLUSTER_MAX_ZOOM) return null

  // Calculado no render: map.project depende do zoom, que é atualizado pelo
  // evento de zoom acima. O memo evita recomputar quando nada mudou.
  const clusters = clusterPoints(points, map, SIGNAL_COLORS.unknown)

  return clusters
    .filter((cluster) => cluster.count > 1)
    .map((cluster) => (
      <CircleMarker
        key={`c-${cluster.key}`}
        center={toLatLng(cluster.latitude, cluster.longitude)}
        radius={6 + Math.min(cluster.count, 60) / 6}
        pathOptions={{
          color: '#0b132b',
          fillColor: '#e2e8f0',
          fillOpacity: 0.92,
          weight: 2,
        }}
        eventHandlers={{ click: () => map.setView(toLatLng(cluster.latitude, cluster.longitude), Math.min(zoom + 2, 16)) }}
      >
        <Tooltip direction="center" permanent className="corio-cluster-tooltip">
          <span className="font-mono text-[10px] font-bold">{cluster.count}</span>
        </Tooltip>
        <Tooltip direction="top" offset={[0, -6]}>
          <span className="text-[11px]">
            <strong>{cluster.count} pontos</strong> nesta área • clique para aproximar
          </span>
        </Tooltip>
        <Popup>
          <div className="min-w-[220px]">
            <p className="text-[11px] font-bold uppercase tracking-wide text-text-muted">
              {cluster.count} pontos agrupados
            </p>
            <ul className="mt-1 flex flex-col gap-1">
              {cluster.points.slice(0, 6).map((point) => (
                <li key={point.id} className="text-[11px]">
                  {point.kind === 'occurrence' ? (
                    <button
                      type="button"
                      onClick={() => onSelect(point.id)}
                      className="text-left font-semibold hover:underline"
                      style={{ color: SEVERITY_COLORS[point.severity] }}
                    >
                      {point.type} • {point.location}
                    </button>
                  ) : (
                    <span className="text-text-muted">
                      Controlador {point.id} • {point.estado}
                    </span>
                  )}
                </li>
              ))}
            </ul>
            {cluster.points.length > 6 && (
              <p className="mt-1 text-[10px] text-text-dim">+{cluster.points.length - 6} outros pontos</p>
            )}
          </div>
        </Popup>
      </CircleMarker>
    ))
})

// Mantém o recorte do Rio mesmo em resize do container.
function FitToRio() {
  const map = useMap()

  useEffect(() => {
    map.fitBounds(RIO_BOUNDS, { padding: [12, 12] })
    const timer = setTimeout(() => map.invalidateSize(), 150)
    return () => clearTimeout(timer)
  }, [map])

  return null
}

function formatSince(timestamp) {
  if (!timestamp) return 'sem registro'
  const minutes = Math.floor((Date.now() - timestamp) / 60000)
  if (minutes < 1) return 'agora'
  if (minutes < 60) return `há ${minutes} min`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `há ${hours}h`
  return `há ${Math.floor(hours / 24)}d`
}

export function OccurrenceMap({
  events = [],
  controllers = [],
  loading = false,
  error = null,
  lastUpdated = null,
  onRefresh,
  className,
}) {
  const [showSignals, setShowSignals] = useState(true)
  const [showOccurrences, setShowOccurrences] = useState(true)
  const [signalFaultsOnly, setSignalFaultsOnly] = useState(false)
  const [severityFilter, setSeverityFilter] = useState(null)
  // `null` = todos; conjunto de chaves de grupo selecionadas.
  const [groupFilter, setGroupFilter] = useState(null)

  const allOccurrences = useMemo(
    () => (Array.isArray(events) ? events.filter((event) => event.coordinates) : []),
    [events],
  )

  const allSignals = useMemo(
    () =>
      Array.isArray(controllers)
        ? controllers.filter((c) => c.latitude !== null && c.longitude !== null)
        : [],
    [controllers],
  )

  const visibleOccurrences = useMemo(
    () =>
      allOccurrences.filter(
        (event) =>
          showOccurrences && (!severityFilter || severityFilter.has(event.severity)),
      ),
    [allOccurrences, showOccurrences, severityFilter],
  )

  const visibleSignals = useMemo(
    () =>
      allSignals.filter((controller) => {
        if (!showSignals) return false
        if (signalFaultsOnly && controller.groupKey === 'normal') return false
        if (groupFilter && !groupFilter.has(controller.groupKey)) return false
        return true
      }),
    [allSignals, showSignals, signalFaultsOnly, groupFilter],
  )

  const activeGroups = useMemo(() => {
    const present = new Set(allSignals.map((controller) => controller.groupKey))
    return CONTROLLER_GROUPS.filter((group) => present.has(group.key))
  }, [allSignals])

  const toggleSeverity = (severity) => {
    setSeverityFilter((current) => {
      const all = Object.keys(SEVERITY_COLORS)
      // Com todos ativos, o primeiro clique isola a gravidade escolhida.
      if (!current) return new Set([severity])

      const base = new Set(current)
      if (base.has(severity)) {
        base.delete(severity)
        return base.size === 0 ? null : base
      }

      base.add(severity)
      return base.size === all.length ? null : base
    })
  }

  const toggleGroup = (key) => {
    setGroupFilter((current) => {
      const all = activeGroups.map((group) => group.key)
      // Com todos ativos, o primeiro clique isola o grupo escolhido.
      if (!current) return new Set([key])

      const base = new Set(current)
      if (base.has(key)) {
        base.delete(key)
        return base.size === 0 ? null : base
      }

      base.add(key)
      return base.size === all.length ? null : base
    })
  }

  const allPoints = useMemo(
    () => [
      ...visibleSignals.map((controller) => ({ ...controller, kind: 'signal' })),
      ...visibleOccurrences.map((event) => ({
        ...event,
        latitude: event.coordinates.latitude,
        longitude: event.coordinates.longitude,
        kind: 'occurrence',
      })),
    ],
    [visibleSignals, visibleOccurrences],
  )

  if (loading) {
    return (
      <div className={cn('p-5', className)}>
        <div className="h-[520px] animate-pulse rounded-2xl border border-corborder bg-cordeep/60" />
      </div>
    )
  }

  if (error) {
    return (
      <div className={cn('flex flex-col', className)}>
        <div className="flex items-center justify-between gap-3 p-5">
          <div className="flex min-w-0 items-center gap-2 text-sm text-danger">
            <AlertTriangle size={16} className="shrink-0" />
            <span className="truncate">{error}</span>
          </div>
          {onRefresh && (
            <button
              type="button"
              onClick={() => onRefresh()}
              className="inline-flex shrink-0 items-center gap-2 rounded-lg border border-danger/30 bg-danger/10 px-2.5 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-danger transition-colors hover:bg-danger/20"
            >
              <RefreshCw size={12} />
              Recarregar
            </button>
          )}
        </div>
      </div>
    )
  }

  return (
    <div className={cn('flex flex-col', className)}>
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-corborder-soft px-5 py-2.5 text-[11px] text-text-dim">
        <span className="font-medium uppercase tracking-wide">
          Mapa operacional
          {lastUpdated && (
            <span className="ml-2 font-normal normal-case tracking-normal text-text-muted">
              • atualizado {formatSince(new Date(lastUpdated).getTime())}
            </span>
          )}
        </span>
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

      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-corborder-soft px-5 py-2.5 text-[11px]">
        <button
          type="button"
          aria-pressed={showSignals}
          onClick={() => setShowSignals((value) => !value)}
          className={cn(
            'inline-flex items-center gap-1.5 rounded-md border px-2 py-1 font-semibold uppercase tracking-wide transition-colors',
            showSignals
              ? 'border-primary/40 bg-primary/10 text-primary'
              : 'border-corborder-soft text-text-dim hover:text-text-muted',
          )}
        >
          <TrafficCone size={11} />
          Semáforos
        </button>

        <button
          type="button"
          aria-pressed={showOccurrences}
          onClick={() => setShowOccurrences((value) => !value)}
          className={cn(
            'inline-flex items-center gap-1.5 rounded-md border px-2 py-1 font-semibold uppercase tracking-wide transition-colors',
            showOccurrences
              ? 'border-danger/40 bg-danger/10 text-danger'
              : 'border-corborder-soft text-text-dim hover:text-text-muted',
          )}
        >
          <AlertTriangle size={11} />
          Ocorrências
        </button>

        <span className="h-4 w-px bg-corborder-soft" aria-hidden="true" />

        <button
          type="button"
          aria-pressed={signalFaultsOnly}
          onClick={() => setSignalFaultsOnly((value) => !value)}
          className={cn(
            'rounded-md border px-2 py-1 font-semibold uppercase tracking-wide transition-colors',
            signalFaultsOnly
              ? 'border-warn/40 bg-warn/10 text-warn'
              : 'border-corborder-soft text-text-dim hover:text-text-muted',
          )}
        >
          Só falhas
        </button>

        <span className="h-4 w-px bg-corborder-soft" aria-hidden="true" />

        {Object.entries(SEVERITY_COLORS).map(([severity, color]) => {
          const active = !severityFilter || severityFilter.has(severity)
          return (
            <button
              key={severity}
              type="button"
              aria-pressed={active}
              onClick={() => toggleSeverity(severity)}
              className={cn(
                'inline-flex items-center gap-1.5 rounded-md border px-2 py-1 font-semibold uppercase tracking-wide transition-all',
                active ? 'border-corborder text-text-main' : 'border-corborder-soft text-text-dim opacity-45',
              )}
            >
              <span className="size-2 rounded-full" style={{ backgroundColor: active ? color : '#64748b' }} />
              {severity === 'high' ? 'Alta' : severity === 'medium' ? 'Média' : 'Baixa'}
            </button>
          )
        })}

        {activeGroups.length > 0 && (
          <>
            <span className="h-4 w-px bg-corborder-soft" aria-hidden="true" />
            {activeGroups.map((group) => {
              const active = !groupFilter || groupFilter.has(group.key)
              const faults = allSignals.filter((c) => c.groupKey === group.key).length
              return (
                <button
                  key={group.key}
                  type="button"
                  aria-pressed={active}
                  title={group.label}
                  onClick={() => toggleGroup(group.key)}
                  className={cn(
                    'inline-flex items-center gap-1.5 rounded-md border px-2 py-1 font-semibold transition-all',
                    active ? 'border-corborder text-text-main' : 'border-corborder-soft text-text-dim opacity-45',
                  )}
                >
                  <span className="size-2 rounded-full" style={{ backgroundColor: active ? group.color : '#64748b' }} />
                  <span className="font-mono tabular">{faults}</span>
                </button>
              )
            })}
          </>
        )}
      </div>

      <div className="map-shell h-[520px] w-full overflow-hidden">
        <MapContainer
          center={RIO_CENTER}
          zoom={11}
          minZoom={9}
          maxZoom={18}
          bounds={RIO_BOUNDS}
          scrollWheelZoom
          className="h-full w-full"
        >
          <TileLayer url={TILE_URL} attribution={TILE_ATTRIBUTION} subdomains="abcd" maxZoom={18} />
          <FitToRio />

          <ClusterMarkers
            points={allPoints}
            loading={loading}
            onSelect={(id) => {
              const target = allOccurrences.find((event) => event.id === id)
              if (!target) return
              const url = `https://www.google.com/maps/search/?api=1&query=${target.coordinates.latitude},${target.coordinates.longitude}`
              window.open(url, '_blank', 'noopener,noreferrer')
            }}
          />

          {visibleSignals.map((controller) => {
            const color = SIGNAL_COLORS[controller.groupKey] || SIGNAL_COLORS.unknown
            const hasFault = controller.groupKey !== 'normal'
            return (
              <CircleMarker
                key={`s-${controller.id}`}
                center={toLatLng(controller.latitude, controller.longitude)}
                radius={hasFault ? 3.6 : 2.6}
                pathOptions={{
                  color,
                  fillColor: color,
                  fillOpacity: hasFault ? 0.72 : 0.4,
                  weight: 0.8,
                  className: hasFault ? 'corio-signal-blink' : undefined,
                }}
              >
                <Tooltip direction="top" offset={[0, -4]} opacity={1}>
                  <span className="text-[11px]">
                    <strong>{controller.estado}</strong> • Controlador {controller.id}
                  </span>
                </Tooltip>
                <Popup className="corio-popup--signal">
                  <div className="min-w-[190px]">
                    <p
                      className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wide"
                      style={{ color }}
                    >
                      <TrafficCone size={12} />
                      {controller.groupLabel}
                    </p>
                    <p className="mt-1 text-xs font-semibold">
                      Controlador {controller.id}
                      {controller.externalCode && (
                        <span className="font-normal text-text-dim"> • cód. {controller.externalCode}</span>
                      )}
                    </p>
                    <p className="mt-1 text-[11px] text-text-muted">Estado: {controller.estado}</p>
                    {controller.flags.length > 0 && (
                      <p className="mt-1 text-[11px] text-text-muted">
                        Falhas: {controller.flags.map((flag) => flag.label).join(', ')}
                      </p>
                    )}
                    <p className="mt-1 font-mono text-[10px] text-text-dim tabular">
                      {controller.latitude.toFixed(5)}, {controller.longitude.toFixed(5)} •{' '}
                      {formatSince(controller.lastCommunication)}
                    </p>
                  </div>
                </Popup>
              </CircleMarker>
            )
          })}

          {visibleOccurrences.map((event) => {
            const color = SEVERITY_COLORS[event.severity] || SEVERITY_COLORS.medium
            return (
              <CircleMarker
                key={`o-${event.id}`}
                center={toLatLng(event.coordinates.latitude, event.coordinates.longitude)}
                radius={7}
                pathOptions={{
                  color: '#0b132b',
                  fillColor: color,
                  fillOpacity: 0.95,
                  weight: 2,
                }}
              >
                <Tooltip direction="top" offset={[0, -6]} opacity={1}>
                  <span className="text-[11px]">
                    <strong>{event.severityLabel}</strong> • {event.type}
                  </span>
                </Tooltip>
                <Popup className="corio-popup--occurrence">
                  <div className="min-w-[210px]">
                    <p
                      className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wide"
                      style={{ color }}
                    >
                      <AlertTriangle size={12} />
                      Gravidade {event.severityLabel}
                    </p>
                    <p className="mt-1 text-xs font-semibold">{event.type}</p>
                    <p className="mt-1 text-[11px] text-text-muted">{event.location}</p>
                    <p className="mt-1 font-mono text-[10px] text-text-dim tabular">
                      {event.typeCode} • {event.code} • {formatSince(event.timestamp)}
                    </p>
                  </div>
                </Popup>
              </CircleMarker>
            )
          })}
        </MapContainer>
      </div>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 px-5 py-3 text-[11px] text-text-muted">
        <span className="flex items-center gap-1.5">
          <span className="size-2.5 rounded-full" style={{ backgroundColor: SEVERITY_COLORS.high }} />
          Ocorrência Alta
        </span>
        <span className="flex items-center gap-1.5">
          <span className="size-2.5 rounded-full" style={{ backgroundColor: SEVERITY_COLORS.medium }} />
          Média
        </span>
        <span className="flex items-center gap-1.5">
          <span className="size-2.5 rounded-full" style={{ backgroundColor: SEVERITY_COLORS.low }} />
          Baixa
        </span>
        <span className="flex items-center gap-1.5">
          <span className="size-2 rounded-full" style={{ backgroundColor: SIGNAL_COLORS.offline }} />
          Semáforo em falha
        </span>
        <span className="flex items-center gap-1.5">
          <span className="size-2 rounded-full" style={{ backgroundColor: SIGNAL_COLORS.normal }} />
          Semáforo normal
        </span>
        <span className="ml-auto flex items-center gap-1.5 font-mono tabular">
          <Power size={11} />
          {visibleOccurrences.length} de {allOccurrences.length} ocorrências • {visibleSignals.length} de{' '}
          {allSignals.length} semáforos
        </span>
      </div>
    </div>
  )
}
