import { useMemo, useState } from 'react'
import L from 'leaflet'
import { Circle, Marker, Popup, useMapEvents } from 'react-leaflet'
import { buildCameraIndex, camerasWithin } from '../../../shared/domain/cameras.js'

// Ícone "video" do lucide, em SVG puro para caber no divIcon do Leaflet.
const VIDEO_SVG =
  '<svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="m16 13 5.223 3.482a.5.5 0 0 0 .777-.416V7.87a.5.5 0 0 0-.752-.432L16 10.5"/><rect x="2" y="6" width="14" height="12" rx="2"/></svg>'

const iconCache = new Map()

function cameraIcon(color) {
  if (!iconCache.has(color)) {
    iconCache.set(
      color,
      L.divIcon({
        className: '',
        html: `<div style="display:flex;align-items:center;justify-content:center;width:24px;height:24px;border-radius:9999px;background:${color};border:2px solid #fff;box-shadow:0 1px 4px rgba(15,23,42,.35)">${VIDEO_SVG}</div>`,
        iconSize: [24, 24],
        iconAnchor: [12, 12],
        popupAnchor: [0, -12],
      }),
    )
  }
  return iconCache.get(color)
}

// Zoom a partir do qual a camada aparece: abaixo disso as câmeras de todas as
// ocorrências poluiriam o mapa.
export const NEARBY_CAMERAS_MIN_ZOOM = 15

function formatDistance(meters) {
  return `${Math.round(meters)} m`
}

// Desenha, para cada ocorrência na área visível, o raio de busca tracejado e
// as câmeras que ficam dentro dele — só com o mapa aproximado (zoom >=
// NEARBY_CAMERAS_MIN_ZOOM). Uma câmera perto de várias ocorrências aparece uma
// vez, associada à ocorrência mais próxima.
export function NearbyCamerasLayer({ events, cameras, radiusMeters }) {
  const map = useMapEvents({
    zoomend: () => setView(readView(map)),
    moveend: () => setView(readView(map)),
  })
  const [view, setView] = useState(() => readView(map))
  const index = useMemo(() => buildCameraIndex(cameras), [cameras])
  const zoomedIn = view.zoom >= NEARBY_CAMERAS_MIN_ZOOM

  const eventsInView = useMemo(() => {
    if (!zoomedIn) return []
    return events.filter((event) => view.bounds.contains([event.coordinates.latitude, event.coordinates.longitude]))
  }, [events, view, zoomedIn])

  const nearby = useMemo(() => {
    const byCode = new Map()
    for (const event of eventsInView) {
      const { latitude, longitude } = event.coordinates
      for (const { camera, distance } of camerasWithin(index, latitude, longitude, radiusMeters)) {
        const current = byCode.get(camera.code)
        if (!current || distance < current.distance) byCode.set(camera.code, { camera, distance, event })
      }
    }
    return Array.from(byCode.values())
  }, [eventsInView, index, radiusMeters])

  if (!zoomedIn) return null

  return (
    <>
      {eventsInView.map((event) => (
        <Circle
          key={`radius-${event.id}`}
          center={[event.coordinates.latitude, event.coordinates.longitude]}
          radius={radiusMeters}
          interactive={false}
          pathOptions={{ color: '#1e293b', weight: 1.2, dashArray: '5 6', fillColor: '#60a5fa', fillOpacity: 0.12 }}
        />
      ))}
      {nearby.map(({ camera, distance, event }) => (
        <Marker
          key={`camera-${camera.code}`}
          position={[Number(camera.latitude), Number(camera.longitude)]}
          icon={cameraIcon(camera.status?.color || '#64748B')}
          eventHandlers={{
            mouseover: (markerEvent) => markerEvent.target.openPopup(),
            mouseout: (markerEvent) => markerEvent.target.closePopup(),
          }}
        >
          <Popup>
            <div className="min-w-48 space-y-1 text-xs">
              <strong className="block text-sm">{camera.name || 'Câmera'}</strong>
              <div><span className="font-semibold">Código:</span> <span className="font-mono">{camera.code}</span></div>
              <div>
                <span className="font-semibold">Status:</span>{' '}
                <span style={{ color: camera.status?.color }}>{camera.status?.label}</span>
              </div>
              <div><span className="font-semibold">Ocorrência:</span> {event.type} ({formatDistance(distance)})</div>
            </div>
          </Popup>
        </Marker>
      ))}
    </>
  )
}

// Zoom e área visível (com folga, para o raio de quem está na borda aparecer).
function readView(map) {
  return { zoom: map.getZoom(), bounds: map.getBounds().pad(0.2) }
}
