// Integração com o Waze for Cities (Partner Hub).
//
// O token do parceiro fica no servidor: o navegador consome apenas o endpoint
// same-origin `/api/waze-feed` (ver shared/wazeFeed.js), que já devolve o
// payload enxuto com `jams`, `alerts` e `irregularities`.
//
// Sem `WAZE_FEED_URL` no servidor o endpoint responde 503 MISSING_CONFIG e a
// interface entra no estado "aguardando credenciais" — nenhum número é estimado.

const REQUEST_TIMEOUT_MS = 30000

export const MISSING_CONFIG = 'MISSING_CONFIG'

export const FEED_ENDPOINT = '/api/waze-feed'

// `level` do CCP vai de 0 (livre) a 5 (parado).
const LEVEL_BUCKETS = {
  light: { key: 'light', label: 'Leve', color: '#3B82F6', min: 0, max: 1 },
  moderate: { key: 'moderate', label: 'Moderado', color: '#F59E0B', min: 2, max: 2 },
  heavy: { key: 'heavy', label: 'Intenso / Parado', color: '#EF4444', min: 3, max: 5 },
}

// A partir deste nível consideramos "engarrafamento".
export const CONGESTION_MIN_LEVEL = 3

// Taxonomia dos alertas do Waze: agrupa os códigos `type`/`subtype` em
// categorias legíveis e atribui severidade para priorizar o painel.
const ALERT_TAXONOMY = {
  ROAD_CLOSED: { group: 'blocked', label: 'Via bloqueada', severity: 'high' },
  ACCIDENT: { group: 'accident', label: 'Acidente', severity: 'high' },
  JAM: { group: 'jam', label: 'Tráfego intenso', severity: 'medium' },
  HAZARD: { group: 'hazard', label: 'Perigo na via', severity: 'low' },
}

const SUBTYPES = {
  ROAD_CLOSED_CONSTRUCTION: { group: 'construction', label: 'Obra / interdição', severity: 'high' },
  HAZARD_ON_ROAD_CONSTRUCTION: { group: 'construction', label: 'Obra na via', severity: 'medium' },
  HAZARD_ON_ROAD_TRAFFIC_LIGHT_FAULT: { group: 'signal', label: 'Semáforo com falha', severity: 'high' },
  HAZARD_ON_ROAD_POT_HOLE: { group: 'pothole', label: 'Buraco na via', severity: 'medium' },
  HAZARD_ON_ROAD_LANE_CLOSED: { group: 'lane', label: 'Faixa interditada', severity: 'medium' },
  HAZARD_ON_SHOULDER_CAR_STOPPED: { group: 'shoulder', label: 'Veículo parado no acostamento', severity: 'low' },
}

// Ordem de exibição dos grupos (mais grave primeiro).
const GROUP_ORDER = [
  'blocked',
  'accident',
  'signal',
  'construction',
  'jam',
  'lane',
  'pothole',
  'hazard',
  'shoulder',
  'other',
]

const GROUP_LABELS = {
  blocked: 'Via bloqueada',
  accident: 'Acidente',
  signal: 'Semáforo com falha',
  construction: 'Obra',
  jam: 'Tráfego intenso',
  lane: 'Faixa interditada',
  pothole: 'Buraco na via',
  hazard: 'Outros perigos',
  shoulder: 'Veículo no acostamento',
  other: 'Outros',
}

const SEVERITY_RANK = { high: 0, medium: 1, low: 2 }

function configError(missing) {
  const error = new Error(
    `Waze for Cities: credenciais ausentes (${missing.join(', ')}). Configure o .env para habilitar o painel.`,
  )
  error.code = MISSING_CONFIG
  return error
}

// A configuração (URL/token) vive apenas no servidor: o cliente nunca a vê.

function bucketForLevel(level) {
  if (level >= LEVEL_BUCKETS.heavy.min) return LEVEL_BUCKETS.heavy
  if (level >= LEVEL_BUCKETS.moderate.min) return LEVEL_BUCKETS.moderate
  return LEVEL_BUCKETS.light
}

function toNumber(raw) {
  const value = Number(raw)
  return Number.isFinite(value) ? value : null
}

export function normalizeJam(raw = {}) {
  const level = toNumber(raw.level) ?? 0
  const lengthM = toNumber(raw.length) ?? 0
  const bucket = bucketForLevel(level)

  return {
    id: String(raw.uuid || raw.id || `${raw.street || 'via'}-${raw.pubMillis || Date.now()}`),
    street: raw.street ? String(raw.street) : 'Via não identificada',
    city: raw.city ? String(raw.city) : null,
    level,
    bucketKey: bucket.key,
    bucketLabel: bucket.label,
    bucketColor: bucket.color,
    lengthM,
    lengthKm: lengthM / 1000,
    speedKmh: toNumber(raw.speedKMH ?? raw.speed) ?? 0,
    delayS: toNumber(raw.delay) ?? 0,
    updatedAt: toNumber(raw.updateMillis ?? raw.pubMillis) ?? Date.now(),
    coordinates: Array.isArray(raw.line)
      ? raw.line
          .map((point) => [toNumber(point?.lat), toNumber(point?.lon)])
          .filter(([lat, lon]) => lat !== null && lon !== null)
      : [],
  }
}

export function classifyAlert(raw = {}) {
  const type = String(raw.type || '').toUpperCase()
  const subtype = String(raw.subtype || '').toUpperCase()

  if (subtype && SUBTYPES[subtype]) return SUBTYPES[subtype]
  if (type && ALERT_TAXONOMY[type]) return ALERT_TAXONOMY[type]
  return { group: 'other', label: 'Outro alerta', severity: 'low' }
}

export function normalizeAlert(raw = {}) {
  const { group, label, severity } = classifyAlert(raw)
  const reliability = toNumber(raw.reliability) ?? 0

  // Alertas de baixa confiabilidade são ruído: descartamos.
  if (reliability < 5) return null

  return {
    id: String(raw.uuid || raw.id || `${group}-${raw.pubMillis || Date.now()}`),
    type: String(raw.type || ''),
    subtype: String(raw.subtype || ''),
    groupKey: group,
    label,
    severity,
    street: raw.street ? String(raw.street) : null,
    city: raw.city ? String(raw.city) : null,
    lat: toNumber(raw.lat),
    lon: toNumber(raw.lon),
    reliability,
    description: raw.description ? String(raw.description) : '',
    updatedAt: toNumber(raw.pubMillis) ?? Date.now(),
  }
}

async function request(url, options = {}) {
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)

  try {
    return await fetch(url, { ...options, signal: controller.signal })
  } catch (err) {
    if (err?.name === 'AbortError') {
      throw new Error('Tempo limite excedido ao consultar o feed do Waze.')
    }
    throw err
  } finally {
    clearTimeout(timeoutId)
  }
}

export async function fetchWazeFeed() {
  const response = await request(FEED_ENDPOINT, { headers: { Accept: 'application/json' } })

  if (!response.ok) {
    const body = await response.json().catch(() => null)

    if (response.status === 503 && (body?.code === MISSING_CONFIG || !body)) {
      const error = configError(body?.missing || ['WAZE_FEED_URL'])
      if (body?.error) error.message = body.error
      throw error
    }
    throw new Error(body?.error || `Falha ao consultar o feed do Waze (${response.status}).`)
  }

  const payload = await response.json()
  const jams = Array.isArray(payload?.jams) ? payload.jams.map(normalizeJam) : []
  const alerts = Array.isArray(payload?.alerts)
    ? payload.alerts.map(normalizeAlert).filter(Boolean)
    : []

  return {
    jams,
    alerts,
    generatedAt: payload?.generatedAt || null,
    feedEndMillis: payload?.feedEndMillis ?? null,
    stale: Boolean(payload?.stale),
  }
}

export function aggregateTraffic(jams = []) {
  const list = Array.isArray(jams) ? jams : []

  const buckets = Object.values(LEVEL_BUCKETS).map((bucket) => ({
    key: bucket.key,
    label: bucket.label,
    color: bucket.color,
    count: 0,
    km: 0,
  }))
  const bucketByKey = new Map(buckets.map((bucket) => [bucket.key, bucket]))

  let totalKm = 0
  let congestionKm = 0
  let slowKm = 0
  let speedSum = 0
  let speedCount = 0

  for (const jam of list) {
    const km = jam.lengthKm || 0
    totalKm += km

    const bucket = bucketByKey.get(jam.bucketKey)
    if (bucket) {
      bucket.count += 1
      bucket.km += km
    }

    if (jam.level >= CONGESTION_MIN_LEVEL) {
      congestionKm += km
      if (jam.speedKmh > 0) {
        speedSum += jam.speedKmh
        speedCount += 1
      }
    }
    if (jam.level >= LEVEL_BUCKETS.moderate.min) slowKm += km
  }

  const byLevel = buckets
    .map((bucket) => ({
      ...bucket,
      km: Math.round(bucket.km * 10) / 10,
      pct: totalKm ? (bucket.km / totalKm) * 100 : 0,
    }))
    .filter((bucket) => bucket.count > 0)

  const topJams = [...list].sort((a, b) => b.lengthKm - a.lengthKm).slice(0, 8)

  return {
    jamCount: list.length,
    totalKm: Math.round(totalKm * 10) / 10,
    congestionKm: Math.round(congestionKm * 10) / 10,
    slowKm: Math.round(slowKm * 10) / 10,
    avgCongestedSpeedKmh: speedCount ? speedSum / speedCount : null,
    byLevel,
    topJams,
  }
}

export function aggregateAlerts(alerts = []) {
  const list = Array.isArray(alerts) ? alerts : []

  const counts = new Map()
  for (const alert of list) {
    counts.set(alert.groupKey, (counts.get(alert.groupKey) || 0) + 1)
  }

  const byGroup = GROUP_ORDER.filter((key) => counts.has(key)).map((key) => ({
    key,
    label: GROUP_LABELS[key],
    count: counts.get(key),
  }))

  const bySeverity = {
    high: list.filter((a) => a.severity === 'high').length,
    medium: list.filter((a) => a.severity === 'medium').length,
    low: list.filter((a) => a.severity === 'low').length,
  }

  const priorityAlerts = [...list]
    .sort(
      (a, b) =>
        (SEVERITY_RANK[a.severity] ?? 3) - (SEVERITY_RANK[b.severity] ?? 3) || b.updatedAt - a.updatedAt,
    )

  return {
    alertCount: list.length,
    byGroup,
    bySeverity,
    priorityAlerts,
  }
}
