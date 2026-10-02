// Integração com o Waze for Cities (CCP — Connected Citizens Program).
// O feed de congestionamento é privado: exige credenciais de parceiro aprovado.
// Sem as credenciais, o serviço sinaliza MISSING_CONFIG para a interface exibir
// o estado "aguardando API key" em vez de inventar números.
//
// Endpoint do feed (formato padrão CCP):
//   GET {base}/partners/{partnerId}/feeds/waze/jams
//   Authorization: Bearer {apiKey}

const REQUEST_TIMEOUT_MS = 30000

export const MISSING_CONFIG = 'MISSING_CONFIG'

// `level` do CCP vai de 0 (livre) a 5 (parado).
const LEVEL_BUCKETS = {
  light: { key: 'light', label: 'Leve', color: '#3B82F6', min: 0, max: 1 },
  moderate: { key: 'moderate', label: 'Moderado', color: '#F59E0B', min: 2, max: 2 },
  heavy: { key: 'heavy', label: 'Intenso / Parado', color: '#EF4444', min: 3, max: 5 },
}

// A partir deste nível consideramos "engarrafamento".
export const CONGESTION_MIN_LEVEL = 3

function resolveBaseUrl() {
  const configured = import.meta.env.VITE_WAZE_BASE_URL
  if (configured) return configured
  // Sempre via proxy same-origin (dev: Vite, produção: server/index.js).
  return '/api/waze'
}

// Lê a configuração das credenciais. `ready=false` quando falta o essencial.
export function getWazeConfig() {
  const apiKey = import.meta.env.VITE_WAZE_API_KEY || ''
  const partnerId = import.meta.env.VITE_WAZE_PARTNER_ID || ''
  const feedUrl = import.meta.env.VITE_WAZE_FEED_URL || ''

  const missing = []
  if (!feedUrl) {
    if (!apiKey) missing.push('VITE_WAZE_API_KEY')
    if (!partnerId) missing.push('VITE_WAZE_PARTNER_ID')
  }

  return {
    ready: missing.length === 0,
    missing,
    apiKey,
    partnerId,
    url: feedUrl || `${resolveBaseUrl()}/partners/${partnerId}/feeds/waze/jams`,
  }
}

function configError(missing) {
  const error = new Error(
    `Waze for Cities: credenciais ausentes (${missing.join(', ')}). Configure o .env para habilitar o KPI.`,
  )
  error.code = MISSING_CONFIG
  return error
}

function bucketForLevel(level) {
  if (level >= LEVEL_BUCKETS.heavy.min) return LEVEL_BUCKETS.heavy
  if (level >= LEVEL_BUCKETS.moderate.min) return LEVEL_BUCKETS.moderate
  return LEVEL_BUCKETS.light
}

function toNumber(raw) {
  const value = Number(raw)
  return Number.isFinite(value) ? value : null
}

function asJamArray(payload) {
  if (!payload || typeof payload !== 'object') return []
  const candidates = [payload.jams, payload.data?.jams, payload.result?.jams, payload.data, payload.result]
  for (const candidate of candidates) {
    if (Array.isArray(candidate)) return candidate
  }
  return []
}

export function normalizeJam(raw = {}) {
  const level = toNumber(raw.level) ?? 0
  const lengthM = toNumber(raw.length) ?? 0
  const bucket = bucketForLevel(level)

  return {
    id: String(raw.uuid || raw.id || `${raw.street || 'via'}-${raw.pubMillis || Date.now()}`),
    street: String(raw.street || raw.roadName || 'Via não identificada'),
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

export async function fetchTrafficJams() {
  const config = getWazeConfig()
  if (!config.ready) throw configError(config.missing)

  const response = await request(config.url, {
    method: 'GET',
    headers: {
      Accept: 'application/json',
      Authorization: `Bearer ${config.apiKey}`,
    },
  })

  if (!response.ok) {
    if (response.status === 401 || response.status === 403) {
      throw new Error('Credenciais do Waze for Cities inválidas ou sem permissão para este parceiro.')
    }
    if (response.status === 404) {
      throw new Error('Feed do Waze for Cities não encontrado — verifique o Partner ID.')
    }
    throw new Error(`Falha ao consultar o feed do Waze (${response.status}).`)
  }

  const payload = await response.json()
  return asJamArray(payload).map(normalizeJam)
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
