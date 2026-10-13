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
