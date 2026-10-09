import { useEffect, useState } from 'react'
import { Activity, AlertTriangle, BarChart3, Camera, ChartColumn, ChevronDown, Gauge, Layers, Map as MapIcon, Navigation, PieChart, Radar, RefreshCw, Route, Siren, TrafficCone, Trophy } from 'lucide-react'
import { CircleMarker, MapContainer, Polyline, Popup, TileLayer, useMap } from 'react-leaflet'
import { useSemaforos } from './hooks/useSemaforos'
import { useWazeTraffic } from './hooks/useWazeTraffic'
import { useOpenEvents } from './hooks/useOpenEvents'
import { useCameras } from './hooks/useCameras'
import { Header } from './components/layout/Header'
import { Panel, PanelHeader, SectionTitle } from './components/ui/Panel'
import { TrafficChart } from './components/charts/TrafficChart'
import { TopHours } from './components/sections/TopHours'
import { TrafficLightKpi } from './components/trafficLights/TrafficLightKpi'
import { TrafficLightDonut } from './components/trafficLights/TrafficLightDonut'
import { FaultBreakdown } from './components/trafficLights/FaultBreakdown'
import { TrafficLightOccurrences } from './components/trafficLights/TrafficLightOccurrences'
import { CamerasSection } from './components/cameras/CamerasSection'
import { OccurrenceDashboard } from './components/occurrences/OccurrenceDashboard'
import { WazeLiveMap } from './components/waze/WazeLiveMap'
import { CongestionKpi } from './components/waze/CongestionKpi'
import { WazeTopJams } from './components/waze/WazeTopJams'
import { WazeAlertsPanel } from './components/waze/WazeAlertsPanel'
import { formatDecimal, formatNumber } from './utils/format'

function Footer() {
  return (
    <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-corborder px-2 pt-3 text-xs text-text-dim">
      <p>© 2026 Centro de Operações e Resiliência — Monitoramento de Mobilidade Urbana</p>
      <p className="flex items-center gap-1.5">
        <span className="relative flex size-2">
          <span className="absolute inline-flex size-full animate-ping rounded-full bg-ok opacity-60" />
          <span className="relative inline-flex size-2 rounded-full bg-ok" />
        </span>
        Sistema operacional • Última atualização: 15/09/2026 23:56
      </p>
    </footer>
  )
}

function MapFocus({ occurrence }) {
  const map = useMap()

  useEffect(() => {
    if (occurrence?.coordinates) {
      map.flyTo([occurrence.coordinates.latitude, occurrence.coordinates.longitude], Math.max(map.getZoom(), 14), {
        duration: 0.6,
      })
    }
  }, [map, occurrence])

  return null
}

function MonitoringPrototype({ occurrences, waze, semaforos }) {
  const feed = occurrences.feed || []
  const mapEvents = feed.filter((event) => event.coordinates)
  const [expandedEventId, setExpandedEventId] = useState(null)
  const [selectedEventId, setSelectedEventId] = useState(null)
  const [activeTab, setActiveTab] = useState('occurrences')
  const [mapLayer, setMapLayer] = useState('street')
  const [showWazeCongestion, setShowWazeCongestion] = useState(true)
  const [visibleSeverities, setVisibleSeverities] = useState(['high', 'medium', 'low'])
  const [filtersOpen, setFiltersOpen] = useState(true)
  const incidentCount = feed.length
  const criticalCount = occurrences.severityCounts?.high?.count || 0
  const selectedEvent = mapEvents.find((event) => event.id === selectedEventId) || null
  const visibleEvents = mapEvents.filter((event) => visibleSeverities.includes(event.severity))
  const congestedJams = (waze.jams || []).filter((jam) => jam.level >= 3 && jam.coordinates?.length >= 2)
  const sortedFeed = [...feed].sort((a, b) => {
    const rank = { high: 0, medium: 1, low: 2 }
    return (rank[a.severity] ?? 1) - (rank[b.severity] ?? 1) || b.timestamp - a.timestamp
  })
  const sortedJams = [...(waze.topJams || [])].sort((a, b) => b.lengthKm - a.lengthKm).slice(0, 8)
  const tileLayer = mapLayer === 'dark'
    ? {
        url: 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png',
        attribution: '&copy; OpenStreetMap contributors &copy; CARTO',
      }
    : {
        url: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
      }

  return (
    <div className="overflow-hidden rounded-[28px] border border-slate-200 bg-slate-100 shadow-[0_30px_80px_rgba(15,23,42,0.12)]">
      <div className="relative h-[calc(75vh+24px)] min-h-[674px] max-h-[804px] p-3">
        <aside className="absolute left-7 top-7 z-[1000] flex h-[calc(75vh-2rem)] min-h-[610px] max-h-[740px] w-[270px] flex-col overflow-hidden rounded-[22px] border border-white/70 bg-white/55 shadow-[0_20px_48px_rgba(15,23,42,0.14)] backdrop-blur-[3px] max-sm:left-5 max-sm:w-[calc(50%-1.5rem)] max-sm:min-h-[500px] max-sm:h-[calc(70vh-1rem)]">
          <div className="flex items-center justify-between gap-2 border-b border-slate-200 px-4 py-3">
            <div>
              <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-500">Camadas e filtros</div>
              <div className="mt-1 text-base font-black text-slate-900">Filtros do mapa</div>
            </div>
            <button type="button" aria-expanded={filtersOpen} onClick={() => setFiltersOpen((open) => !open)} className="rounded-lg border border-slate-300/70 bg-white/35 px-2.5 py-1.5 text-[10px] font-semibold text-slate-600 hover:bg-white/60">
              {filtersOpen ? 'Ocultar' : 'Mostrar'}
            </button>
          </div>

          {filtersOpen && (
            <div className="space-y-4 border-b border-slate-200 p-3">
              <div>
                <div className="mb-2 flex items-center gap-1.5 text-[11px] font-bold text-slate-700"><Layers size={13} /> Tipo de mapa</div>
                <div className="space-y-1.5">
                  {[['street', 'Rua'], ['dark', 'Escuro']].map(([value, label]) => (
                    <button key={value} type="button" aria-pressed={mapLayer === value} onClick={() => setMapLayer(value)} className={`w-full rounded-lg px-3 py-2 text-left text-xs font-semibold ${mapLayer === value ? 'bg-amber-400/90 text-slate-900' : 'bg-white/30 text-slate-600 hover:bg-white/55'}`}>
                      {label}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <div className="mb-2 flex items-center gap-1.5 text-[11px] font-bold text-slate-700"><Gauge size={13} /> Prioridade das ocorrências</div>
                <div className="space-y-1.5">
                  {[
                    ['high', 'Alta', '#ef4444'],
                    ['medium', 'Média', '#f59e0b'],
                    ['low', 'Baixa', '#3b82f6'],
                  ].map(([severity, label, color]) => (
                    <label key={severity} className="flex cursor-pointer items-center gap-2 rounded-lg bg-white/30 px-3 py-2 text-xs text-slate-700 hover:bg-white/55">
                      <input type="checkbox" checked={visibleSeverities.includes(severity)} onChange={() => setVisibleSeverities((current) => current.includes(severity) ? current.filter((item) => item !== severity) : [...current, severity])} className="accent-amber-500" />
                      <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: color }} />
                      {label}
                    </label>
                  ))}
                </div>
              </div>
              <div>
                <div className="mb-2 flex items-center gap-1.5 text-[11px] font-bold text-slate-700"><Route size={13} /> Trânsito do Waze</div>
                <label className="flex cursor-pointer items-center gap-2 rounded-lg bg-white/30 px-3 py-2 text-xs text-slate-700 hover:bg-white/55">
                  <input type="checkbox" checked={showWazeCongestion} onChange={(event) => setShowWazeCongestion(event.target.checked)} className="accent-rose-500" />
                  <span className="h-2.5 w-2.5 rounded-full bg-rose-600" />
                  Engarrafamentos intensos
                  <span className="ml-auto text-[10px] text-slate-500">{formatNumber(congestedJams.length)}</span>
                </label>
                <p className="mt-1 px-1 text-[10px] leading-relaxed text-slate-500">Trechos com nível de congestionamento 3 a 5.</p>
              </div>
              <p className="rounded-lg bg-white/30 p-2 text-[10px] leading-relaxed text-slate-600">
                Mostrando {visibleEvents.length} de {mapEvents.length} ocorrências Hexagon. O trânsito do Waze é exibido como linhas separadas.
              </p>
            </div>
          )}
          {occurrences.error && (
            <div className="m-3 rounded-xl border border-rose-200/80 bg-rose-50/75 p-2.5 text-xs text-rose-700">
              <div className="flex items-start gap-2"><AlertTriangle size={14} className="mt-0.5 shrink-0" />{occurrences.error}</div>
              <button type="button" onClick={() => occurrences.refresh({ silent: false })} className="mt-2 font-semibold underline">Tentar novamente</button>
            </div>
          )}
          <div className="mt-auto border-t border-slate-300/60 bg-white/20 px-3 py-3 text-[10px] text-slate-600">
            <div className="font-semibold uppercase tracking-wider text-slate-600">Hexagon • COR</div>
            <div className="mt-1">{incidentCount} ocorrências abertas • {criticalCount} prioridade alta</div>
          </div>
        </aside>

        <main className="absolute inset-3 z-0 overflow-hidden rounded-[22px] border border-slate-200 bg-slate-200">
          <MapContainer
            center={[-22.9068, -43.1729]}
            zoom={11}
            scrollWheelZoom
            className="h-full min-h-[650px] w-full"
          >
            <TileLayer
              attribution={tileLayer.attribution}
              url={tileLayer.url}
            />
            <MapFocus occurrence={selectedEvent} />
            {showWazeCongestion && congestedJams.map((jam) => (
              <Polyline
                key={`waze-jam-${jam.id}`}
                positions={jam.coordinates}
                pathOptions={{
                  color: jam.bucketColor,
                  weight: jam.level >= 4 ? 6 : 4,
                  opacity: 0.9,
                  lineCap: 'round',
                  lineJoin: 'round',
                }}
              >
                <Popup>
                  <div className="min-w-44 space-y-1 text-xs">
                    <strong className="block text-sm">{jam.street}</strong>
                    <div>{jam.city || 'Rio de Janeiro'}</div>
                    <div><strong>Trânsito:</strong> <span style={{ color: jam.bucketColor }}>{jam.bucketLabel}</span> (nível {jam.level}/5)</div>
                    <div><strong>Extensão:</strong> {formatDecimal(jam.lengthKm)} km</div>
                    <div><strong>Velocidade:</strong> {formatDecimal(jam.speedKmh)} km/h</div>
                    <div><strong>Atraso:</strong> {Math.round(jam.delayS / 60)} min</div>
                  </div>
                </Popup>
              </Polyline>
            ))}
            {visibleEvents.map((event) => (
              <CircleMarker
                key={`hexagon-${event.id}`}
                center={[event.coordinates.latitude, event.coordinates.longitude]}
                radius={event.severity === 'high' ? 9 : 7}
                pathOptions={{ color: '#ffffff', weight: 2, fillColor: event.severityColor || '#f59e0b', fillOpacity: 0.95 }}
                eventHandlers={{
                  mouseover: (markerEvent) => markerEvent.target.openPopup(),
                  mouseout: (markerEvent) => markerEvent.target.closePopup(),
                  click: () => {
                    setSelectedEventId(event.id)
                    setExpandedEventId(event.id)
                    setActiveTab('occurrences')
                  },
                }}
              >
                <Popup>
                  <div className="min-w-52 space-y-1.5 text-xs">
                    <strong className="block text-sm">{event.type}</strong>
                    <div><span className="font-semibold">Local:</span> {event.location}</div>
                    <div>
                      <span className="font-semibold">Classificação:</span>{' '}
                      <span style={{ color: event.severityColor || '#f59e0b' }}>{event.severityLabel}</span>
                    </div>
                    <div><span className="font-semibold">Situação:</span> {event.status || 'Ativa'}</div>
                    <div><span className="font-semibold">Código:</span> {event.code || event.id}</div>
                    {event.timestamp && (
                      <div>
                        <span className="font-semibold">Registro:</span>{' '}
                        {new Date(event.timestamp).toLocaleString('pt-BR')}
                      </div>
                    )}
                  </div>
                </Popup>
              </CircleMarker>
            ))}
          </MapContainer>

          <div className="pointer-events-none absolute left-4 top-4 z-[1000] flex flex-wrap gap-2">
            <span className="rounded-full border border-slate-200 bg-white/75 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-700 shadow-sm backdrop-blur-sm">
              <Navigation size={12} className="mr-1 inline" />
              Rio de Janeiro
            </span>
            <span className="rounded-full border border-emerald-200 bg-emerald-50/75 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-emerald-700 shadow-sm backdrop-blur-sm">
              {visibleEvents.length} ocorrências geolocalizadas
            </span>
          </div>

          <div className="pointer-events-none absolute bottom-4 left-4 z-[500] rounded-xl border border-slate-200 bg-white/75 px-3 py-2 text-[11px] text-slate-600 shadow-sm backdrop-blur-sm">
            <span className="mr-3"><span className="mr-1 inline-block h-2.5 w-2.5 rounded-full bg-rose-500" />Alta</span>
            <span className="mr-3"><span className="mr-1 inline-block h-2.5 w-2.5 rounded-full bg-amber-500" />Média</span>
            <span><span className="mr-1 inline-block h-2.5 w-2.5 rounded-full bg-blue-500" />Baixa</span>
          </div>
        </main>

        <aside className="absolute right-7 top-7 z-[1000] flex h-[calc(75vh-2rem)] min-h-[610px] max-h-[740px] w-[340px] flex-col overflow-hidden rounded-[22px] border border-white/70 bg-white/55 shadow-[0_20px_48px_rgba(15,23,42,0.14)] backdrop-blur-[3px] max-sm:right-5 max-sm:w-[calc(50%-1.5rem)] max-sm:min-h-[500px] max-sm:h-[calc(70vh-1rem)]">
          <div className="flex items-center justify-between gap-2 border-b border-slate-200 px-3 py-2.5">
            <div className="flex min-w-0 rounded-xl bg-white/30 p-1" role="tablist" aria-label="Painel lateral do mapa">
              {[
                ['occurrences', 'Ocorrências'],
                ['traffic', 'Trânsito'],
                ['signals', 'Semáforos'],
              ].map(([tab, label]) => (
                <button key={tab} type="button" role="tab" aria-selected={activeTab === tab} onClick={() => setActiveTab(tab)} className={`rounded-lg px-2 py-1.5 text-[10px] font-semibold ${activeTab === tab ? 'bg-blue-600/90 text-white shadow-sm' : 'text-slate-600 hover:bg-white/55'}`}>
                  {label}
                </button>
              ))}
            </div>
            <button
              type="button"
              onClick={() => activeTab === 'occurrences' ? occurrences.refresh({ silent: false }) : activeTab === 'traffic' ? waze.refresh({ silent: false }) : semaforos.refresh({ silent: false })}
              aria-label="Atualizar dados do painel"
              className="rounded-lg border border-slate-300/70 bg-white/35 p-2 text-slate-600 hover:bg-white/60"
            >
              <RefreshCw size={14} className={(activeTab === 'occurrences' ? occurrences.loading : activeTab === 'traffic' ? waze.loading : semaforos.loading) ? 'animate-spin' : ''} />
            </button>
          </div>

          {activeTab === 'occurrences' && (
            <>
              <div className="border-b border-slate-200 px-4 py-4">
                <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">Hexagon • COR</div>
                <div className="mt-1 flex items-center justify-between gap-2">
                  <h3 className="text-lg font-bold text-slate-800">Ocorrências abertas</h3>
                  <span className="shrink-0 rounded-full bg-slate-800/10 px-2.5 py-1 text-xs font-bold text-slate-700">Total: {incidentCount}</span>
                </div>
                <p className="mt-1 text-[11px] text-slate-500">{mapEvents.length} com coordenadas · {criticalCount} prioridade alta</p>
                <div className="mt-3 grid grid-cols-3 gap-1.5" aria-label="Ocorrências por classificação">
                  {[
                    { key: 'low', label: 'Baixa', color: '#3B82F6' },
                    { key: 'medium', label: 'Média', color: '#F59E0B' },
                    { key: 'high', label: 'Alta', color: '#EF4444' },
                  ].map(({ key, label, color }) => (
                    <div key={key} className="flex min-w-0 items-center gap-1.5 rounded-lg border border-white/50 bg-white/35 px-2 py-1.5">
                      <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: color }} />
                      <span className="truncate text-[10px] font-medium text-slate-600">{label}</span>
                      <strong className="ml-auto text-xs text-slate-800">{occurrences.severityCounts?.[key]?.count || 0}</strong>
                    </div>
                  ))}
                </div>
              </div>
              {occurrences.error && <div className="m-3 rounded-lg border border-rose-200 bg-rose-50 p-2 text-xs text-rose-700">{occurrences.error}</div>}
              <div className="min-h-0 flex-1 overflow-y-auto p-2">
                {sortedFeed.length ? sortedFeed.map((event) => {
                  const expanded = expandedEventId === event.id
                  return (
                    <div key={event.id} className={`mb-1.5 overflow-hidden border-b border-slate-300/60 ${selectedEventId === event.id ? 'bg-blue-100/45' : 'bg-white/15'}`}>
                      <button type="button" aria-expanded={expanded} onClick={() => {
                        setExpandedEventId(expanded ? null : event.id)
                        if (event.coordinates) setSelectedEventId(event.id)
                      }} className="flex w-full items-center gap-2.5 px-3 py-3 text-left hover:bg-white/35">
                        <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: event.severityColor || '#f59e0b' }} />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-xs font-bold text-slate-800">{event.type}</span>
                          <span className="mt-1 block truncate text-[11px] text-slate-500">{event.location}</span>
                        </span>
                        <ChevronDown size={15} className={`shrink-0 text-slate-400 transition-transform ${expanded ? 'rotate-180' : ''}`} />
                      </button>
                      {expanded && (
                        <div className="space-y-2 border-t border-slate-200/70 bg-white/30 px-3 py-2.5 text-[11px]">
                          <div className="flex justify-between gap-2"><span className="text-slate-500">Prioridade</span><strong>{event.severityLabel}</strong></div>
                          <div className="flex justify-between gap-2"><span className="text-slate-500">Situação</span><strong>{event.status || 'Ativa'}</strong></div>
                          <div className="flex justify-between gap-2"><span className="text-slate-500">Código</span><strong className="font-mono">{event.code || event.id}</strong></div>
                          <div className="flex justify-between gap-2"><span className="text-slate-500">Registro</span><strong>{event.timestamp ? new Date(event.timestamp).toLocaleString('pt-BR') : '—'}</strong></div>
                          {!event.coordinates && <p className="rounded-lg bg-amber-50 p-2 text-amber-800">Sem coordenadas — não aparece no mapa.</p>}
                        </div>
                      )}
                    </div>
                  )
                }) : <p className="px-3 py-8 text-center text-xs text-slate-500">{occurrences.loading ? 'Carregando ocorrências…' : 'Nenhuma ocorrência ativa.'}</p>}
              </div>
            </>
          )}

          {activeTab === 'signals' && (
            <>
              <div className="border-b border-slate-200 px-4 py-4">
                <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">Dataprom / Antares</div>
                <h3 className="mt-1 text-lg font-bold text-slate-800">Saúde semafórica</h3>
              </div>
              <div className="grid grid-cols-2 gap-2 border-b border-slate-200 p-3">
                <div className="rounded-xl bg-emerald-50/65 p-3"><div className="text-[10px] uppercase text-slate-500">Online</div><div className="mt-1 text-2xl font-black text-emerald-700">{formatNumber(semaforos.online || 0)}</div></div>
                <div className="rounded-xl bg-rose-50/65 p-3"><div className="text-[10px] uppercase text-slate-500">Com falha</div><div className="mt-1 text-2xl font-black text-rose-700">{formatNumber(Math.max(0, (semaforos.total || 0) - (semaforos.online || 0)))}</div></div>
              </div>
              {semaforos.error && <div className="m-3 rounded-lg border border-rose-200 bg-rose-50 p-2 text-xs text-rose-700">{semaforos.error}</div>}
              <div className="space-y-3 p-4 text-xs text-slate-600">
                <div className="flex justify-between"><span>Total de controladores</span><strong className="text-slate-800">{formatNumber(semaforos.total || 0)}</strong></div>
                <div className="flex justify-between"><span>Disponibilidade</span><strong className="text-slate-800">{formatDecimal(semaforos.operationalPct || 0)}%</strong></div>
              </div>
            </>
          )}

          {activeTab === 'traffic' && (
          <>
          {!waze.configured ? (
            <div className="m-3 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs leading-relaxed text-amber-900">
              {waze.error || 'Feed Waze não configurado. Configure as credenciais no servidor para exibir os dados.'}
            </div>
          ) : (
            <>
              {waze.error && <div className="mx-3 mt-3 rounded-lg border border-amber-200 bg-amber-50 p-2 text-xs text-amber-800">{waze.error}</div>}
              <div className="grid grid-cols-2 gap-2 border-b border-slate-200 p-3">
                <div className="rounded-xl bg-rose-50/65 p-2.5">
                  <div className="text-[10px] uppercase tracking-wide text-slate-500">Congestionado</div>
                  <div className="mt-1 text-xl font-black text-rose-700">{formatDecimal(waze.congestionKm)} <span className="text-xs">km</span></div>
                </div>
                <div className="rounded-xl bg-amber-50/65 p-2.5">
                  <div className="text-[10px] uppercase tracking-wide text-slate-500">Trechos</div>
                  <div className="mt-1 text-xl font-black text-amber-700">{formatNumber(waze.jamCount)}</div>
                </div>
                <div className="rounded-xl bg-white/30 p-2.5">
                  <div className="text-[10px] uppercase tracking-wide text-slate-500">Extensão monitorada</div>
                  <div className="mt-1 text-lg font-black text-slate-800">{formatDecimal(waze.totalKm)} km</div>
                </div>
                <div className="rounded-xl bg-white/30 p-2.5">
                  <div className="text-[10px] uppercase tracking-wide text-slate-500">Velocidade média</div>
                  <div className="mt-1 text-lg font-black text-slate-800">{waze.avgCongestedSpeedKmh === null ? '—' : `${formatDecimal(waze.avgCongestedSpeedKmh)} km/h`}</div>
                </div>
              </div>

              <div className="flex items-center gap-2 px-3 pt-3 text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-500">
                <Route size={13} />
                Vias com maior retenção
              </div>
              <div className="min-h-0 flex-1 overflow-y-auto p-3">
                {sortedJams.length ? sortedJams.map((jam, index) => (
                  <div key={jam.id} className="mb-2 rounded-xl border border-slate-300/60 bg-white/25 p-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex min-w-0 gap-2">
                        <span className="grid h-6 w-6 shrink-0 place-items-center rounded-lg bg-white/40 text-[10px] font-bold text-slate-600">{index + 1}</span>
                        <div className="min-w-0">
                          <div className="truncate text-xs font-bold text-slate-800">{jam.street}</div>
                          <div className="mt-1 truncate text-[10px] text-slate-500">{jam.city || 'Rio de Janeiro'}</div>
                        </div>
                      </div>
                      <span className="shrink-0 rounded-full px-2 py-1 text-[9px] font-bold uppercase" style={{ backgroundColor: `${jam.bucketColor}20`, color: jam.bucketColor }}>{jam.bucketLabel}</span>
                    </div>
                    <div className="mt-2 flex items-center justify-between border-t border-slate-100 pt-2 text-[10px] text-slate-500">
                      <span>{formatDecimal(jam.lengthKm)} km</span>
                      <span className="inline-flex items-center gap-1"><Activity size={11} /> {formatDecimal(jam.speedKmh)} km/h</span>
                      <span>{Math.round(jam.delayS / 60)} min atraso</span>
                    </div>
                  </div>
                )) : (
                  <p className="py-8 text-center text-xs text-slate-500">{waze.loading ? 'Carregando dados do Waze…' : 'Nenhum trecho congestionado no feed.'}</p>
                )}
              </div>
              <div className="border-t border-slate-200 px-3 py-2 text-[10px] text-slate-500">
                {waze.lastUpdated ? `Atualizado ${new Date(waze.lastUpdated).toLocaleTimeString('pt-BR')}` : 'Aguardando primeira atualização'}
              </div>
            </>
          )}
          </>
          )}
        </aside>
      </div>
    </div>
  )
}

export default function App() {
  const semaforos = useSemaforos({ pollingMs: 60000 })
  const waze = useWazeTraffic({ pollingMs: 120000 })
  const occurrences = useOpenEvents({ pollingMs: 60000 })
  const cameras = useCameras()
  const [summaryOpen, setSummaryOpen] = useState(false)

  return (
    <div className="flex min-h-full w-full shrink-0 flex-col gap-3 overflow-x-hidden">
      <Header
        summaryOpen={summaryOpen}
        onToggleSummary={() => {
          setSummaryOpen((open) => !open)
          document.getElementById('root')?.scrollTo({ top: 0, behavior: 'smooth' })
        }}
      />

      {!summaryOpen && (
        <section>
          <SectionTitle
            icon={MapIcon}
            title="Mapa operacional"
            subtitle="Ocorrências geolocalizadas da API Hexagon no mapa e dados de congestionamento do Waze na lateral"
          />
          <MonitoringPrototype occurrences={occurrences} waze={waze} semaforos={semaforos} />
        </section>
      )}

      <div className={summaryOpen ? 'flex flex-col gap-3' : 'hidden'}>
        {summaryOpen && (
          <>
          <section>
            <SectionTitle
              icon={Siren}
              title="Monitoramento de Ocorrências"
              subtitle="Eventos ativos categorizados por gravidade e tipo"
            />
            <OccurrenceDashboard {...occurrences} />
          </section>

          <section>
            <SectionTitle
              icon={MapIcon}
              title="Waze • Tráfego ao Vivo"
              subtitle="Engarrafamento e alertas reportados em tempo real"
            />
            <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
              <Panel className="lg:col-span-2">
                <PanelHeader
                  icon={MapIcon}
                  title="Waze Live Map • Tráfego ao Vivo"
                  subtitle="Engarrafamento ao vivo — cruze com os controladores em falha em Saúde dos Semáforos"
                />
                <WazeLiveMap />
              </Panel>

              <div className="flex flex-col gap-3">
                <CongestionKpi
                  configured={waze.configured}
                  missing={waze.missing}
                  loading={waze.loading}
                  error={waze.error}
                  congestionKm={waze.congestionKm}
                  totalKm={waze.totalKm}
                  slowKm={waze.slowKm}
                  jamCount={waze.jamCount}
                  avgCongestedSpeedKmh={waze.avgCongestedSpeedKmh}
                  byLevel={waze.byLevel}
                  lastUpdated={waze.lastUpdated}
                  stale={waze.stale}
                  onRefresh={waze.refresh}
                />

                <Panel>
                  <PanelHeader
                    icon={Radar}
                    title="Leitura Correlacionada"
                    subtitle="Falha semafórica e engarrafamento no mesmo período"
                  />
                  <div className="flex flex-col gap-3 p-4 text-xs">
                    <div className="flex items-baseline justify-between gap-3">
                      <span className="text-text-muted">Controladores com falha</span>
                      <span className="font-mono font-bold text-warn tabular">
                        {formatNumber(semaforos.total - semaforos.online)}
                        <span className="ml-1 font-normal text-text-dim">
                          ({formatDecimal(semaforos.offline ? ((semaforos.total - semaforos.online) / semaforos.total) * 100 : 0)}%)
                        </span>
                      </span>
                    </div>
                    <div className="flex items-baseline justify-between gap-3">
                      <span className="text-text-muted">Trechos com engarrafamento</span>
                      <span className="font-mono font-bold text-danger tabular">
                        {waze.configured ? formatNumber(waze.jamCount) : '—'}
                      </span>
                    </div>
                    <div className="flex items-baseline justify-between gap-3">
                      <span className="text-text-muted">Km engarrafados</span>
                      <span className="font-mono font-bold text-danger tabular">
                        {waze.configured ? `${formatDecimal(waze.congestionKm)} km` : '—'}
                      </span>
                    </div>
                    <p className="mt-1 border-t border-corborder-soft pt-3 text-[11px] leading-relaxed text-text-dim">
                      {waze.configured
                        ? 'Compare os pontos vermelhos do mapa do Waze com os controladores em falha na seção Saúde e Operação dos Semáforos: corredores com semáforo fora de operação tendem a concentrar retenção.'
                        : 'O KPI de engarrafamento depende do feed do Waze for Cities. Enquanto as credenciais não estiverem configuradas, use o mapa apenas como leitura visual; nenhum km é estimado.'}
                    </p>
                  </div>
                </Panel>
              </div>
            </div>

            <div className="mt-3 grid grid-cols-1 gap-3 lg:grid-cols-2">
              <Panel>
                <PanelHeader
                  icon={MapIcon}
                  title="Congestionamento por Via"
                  subtitle="Trechos com maior extensão de retenção reportados pelo Waze"
                />
                <WazeTopJams
                  data={waze.topJams}
                  loading={waze.loading}
                  configured={waze.configured}
                />
              </Panel>

              <Panel>
                <PanelHeader
                  icon={Siren}
                  title="Alertas do Waze"
                  subtitle="Vias bloqueadas, acidentes, obras e perigos ativos na via"
                />
                <WazeAlertsPanel
                  alerts={waze.priorityAlerts}
                  byGroup={waze.byGroup}
                  loading={waze.loading}
                  configured={waze.configured}
                  lastUpdated={waze.lastUpdated}
                  onRefresh={waze.refresh}
                />
              </Panel>
            </div>
          </section>

          <section>
            <SectionTitle
              icon={BarChart3}
              title="Volume de Tráfego"
              subtitle="Comportamento horário do fluxo veicular e horários de pico"
            />
            <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
              <Panel className="lg:col-span-2">
                <PanelHeader
                  icon={ChartColumn}
                  title="Volume de Tráfego por Hora"
                  subtitle="Veículos detectados ao longo das 24 horas — picos destacados"
                />
                <TrafficChart />
              </Panel>

              <Panel>
                <PanelHeader icon={Trophy} title="Principais Horários" subtitle="Ranking de pico (1º ao 5º)" />
                <TopHours />
              </Panel>
            </div>
          </section>

          <section>
            <SectionTitle
              icon={Camera}
              title="Câmeras ao Vivo"
              subtitle="Monitoramento em tempo real da rede de câmeras Tixxi"
            />
            <CamerasSection {...cameras} />
          </section>

          <section>
            <SectionTitle
              icon={TrafficCone}
              title="Saúde e Operação dos Semáforos"
              subtitle="Monitoramento em tempo real da rede semafórica"
            />

            {semaforos.error && (
              <div className="mb-4 flex items-center justify-between gap-3 rounded-2xl border border-danger/30 bg-danger/10 p-3 text-sm text-danger">
                <div className="flex min-w-0 items-center gap-2">
                  <AlertTriangle size={16} className="shrink-0" />
                  <span className="truncate">{semaforos.error}</span>
                </div>
                <button
                  type="button"
                  onClick={() => semaforos.refresh({ silent: false })}
                  className="inline-flex shrink-0 items-center gap-2 rounded-lg border border-danger/30 bg-danger/10 px-2.5 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-danger transition-colors hover:bg-danger/20"
                >
                  <RefreshCw size={12} className={semaforos.loading ? 'animate-spin' : ''} />
                  Recarregar
                </button>
              </div>
            )}

            <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
              <TrafficLightKpi
                loading={semaforos.loading}
                total={semaforos.total}
                online={semaforos.online}
                offline={semaforos.offline}
                operationalPct={semaforos.operationalPct}
                status={semaforos.status}
                lastUpdated={semaforos.lastUpdated}
                onRefresh={semaforos.refresh}
              />

              <Panel className="lg:col-span-2">
                <PanelHeader
                  icon={PieChart}
                  title="Distribuição por Estado"
                  subtitle="Em operação, intermitente, com alarmes e sem comunicação"
                />
                <TrafficLightDonut
                  data={semaforos.distribution}
                  loading={semaforos.loading}
                  total={semaforos.total}
                  normalCount={semaforos.normalCount}
                />
              </Panel>

              <Panel className="lg:col-span-2">
                <PanelHeader
                  icon={Gauge}
                  title="Principais Falhas Detectadas"
                  subtitle="Ranking por flag de falha reportada pelos controladores"
                />
                <FaultBreakdown
                  data={semaforos.topFailures}
                  loading={semaforos.loading}
                  total={semaforos.total}
                />
              </Panel>

              <Panel>
                <PanelHeader
                  icon={AlertTriangle}
                  title="Semáforos com Falha"
                  subtitle="Sem comunicação, alarmes, piscantes e modo operador"
                />
                <TrafficLightOccurrences data={semaforos.failures} loading={semaforos.loading} />
              </Panel>
            </div>
          </section>
          </>
        )}
        {summaryOpen && <Footer />}
      </div>
    </div>
  )
}
