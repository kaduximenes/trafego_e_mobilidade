// Domínio das câmeras da rede Tixxi: catálogo de status, normalização e
// contagem. Vive em shared/ para que a UI e o coletor do histórico classifiquem
// cada câmera da mesma forma.

// Códigos de status usados pela API (campo CameraStatus):
// '0'  → Operacional
// '1'  → Desligada
// '3'  → Sem comunicação
// 'A'  → Manutenção (FIXA / sem stream)
// '5'  → Intermitente / Instável
export const CAMERA_STATUS = {
  0: { key: 'online', label: 'Operacional', color: '#10B981', badge: 'ok' },
  1: { key: 'off', label: 'Desligada', color: '#EF4444', badge: 'danger' },
  3: { key: 'offline', label: 'Sem Comunicação', color: '#EF4444', badge: 'danger' },
  A: { key: 'maintenance', label: 'Manutenção', color: '#8B5CF6', badge: 'maintenance' },
  5: { key: 'intermittent', label: 'Intermitente', color: '#F59E0B', badge: 'warn' },
}

// Status que representam indisponibilidade (para índices de disponibilidade).
export const UNAVAILABLE_CAMERA_STATUSES = ['1', '3', '5', 'A']

export function getStatusInfo(status) {
  return CAMERA_STATUS[status] || { key: 'unknown', label: `Status ${status}`, color: '#64748B', badge: 'unknown' }
}

// Normaliza a resposta de câmeras: deduplica por código e mapeia o status.
// Cada câmera pode ter múltiplos streams (html/raw); mantemos o stream 'html' preferencial.
export function normalizeCameras(cameras) {
  const byCode = new Map()
  for (const c of cameras || []) {
    const existing = byCode.get(c.code)
    const isHtml = c.stream_type === 'html'
    if (!existing || (isHtml && existing.stream_type !== 'html')) {
      byCode.set(c.code, c)
    }
  }
  return Array.from(byCode.values()).map((c) => ({
    id: c.id,
    code: c.code,
    name: c.name,
    latitude: c.latitude,
    longitude: c.longitude,
    statusRaw: c.CameraStatus,
    status: getStatusInfo(c.CameraStatus),
    streamUrl: c.stream_url,
    streamType: c.stream_type,
  }))
}

// Conta câmeras por status bruto. O total inclui as já normalizadas.
export function countCameraStatuses(cameras = []) {
  const counts = { total: cameras.length }
  for (const camera of cameras) {
    counts[camera.statusRaw] = (counts[camera.statusRaw] || 0) + 1
  }
  return counts
}

export function cameraAvailabilityPct(counts = {}) {
  const total = counts.total || 0
  if (!total) return null
  return ((counts['0'] || 0) / total) * 100
}

// Distância em metros entre dois pontos (fórmula de haversine).
export function distanceMeters(lat1, lon1, lat2, lon2) {
  const toRad = (deg) => (deg * Math.PI) / 180
  const dLat = toRad(lat2 - lat1)
  const dLon = toRad(lon2 - lon1)
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2
  return 6371000 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

// Câmera mais próxima de um ponto, ignorando as sem coordenada válida.
// Devolve { camera, distance } (distância em metros) ou null.
export function nearestCamera(cameras, latitude, longitude) {
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null
  let best = null
  for (const camera of cameras || []) {
    const lat = Number(camera.latitude)
    const lon = Number(camera.longitude)
    if (!Number.isFinite(lat) || !Number.isFinite(lon) || (lat === 0 && lon === 0)) continue
    const distance = distanceMeters(latitude, longitude, lat, lon)
    if (!best || distance < best.distance) best = { camera, distance }
  }
  return best
}

// Índice espacial em grade (~1,1 km por célula) para achar câmeras perto de
// um ponto sem percorrer a rede inteira a cada consulta.
const GRID_CELL_DEG = 0.01

function cellKey(latCell, lonCell) {
  return `${latCell}:${lonCell}`
}

export function buildCameraIndex(cameras) {
  const cells = new Map()
  for (const camera of cameras || []) {
    const lat = Number(camera.latitude)
    const lon = Number(camera.longitude)
    if (!Number.isFinite(lat) || !Number.isFinite(lon) || (lat === 0 && lon === 0)) continue
    const key = cellKey(Math.floor(lat / GRID_CELL_DEG), Math.floor(lon / GRID_CELL_DEG))
    if (!cells.has(key)) cells.set(key, [])
    cells.get(key).push(camera)
  }
  return cells
}

// Câmeras a até `radiusMeters` do ponto, da mais próxima para a mais distante.
// O raio deve ficar abaixo do tamanho da célula (~1,1 km), que é o alcance da
// varredura das 3x3 células vizinhas.
export function camerasWithin(index, latitude, longitude, radiusMeters) {
  if (!index || !Number.isFinite(latitude) || !Number.isFinite(longitude)) return []
  const latCell = Math.floor(latitude / GRID_CELL_DEG)
  const lonCell = Math.floor(longitude / GRID_CELL_DEG)
  const found = []
  for (let dLat = -1; dLat <= 1; dLat++) {
    for (let dLon = -1; dLon <= 1; dLon++) {
      for (const camera of index.get(cellKey(latCell + dLat, lonCell + dLon)) || []) {
        const distance = distanceMeters(latitude, longitude, Number(camera.latitude), Number(camera.longitude))
        if (distance <= radiusMeters) found.push({ camera, distance })
      }
    }
  }
  return found.sort((a, b) => a.distance - b.distance)
}
