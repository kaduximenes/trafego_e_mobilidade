// Coletor do histórico: busca o estado atual de cada fonte e reduz a métricas
// compactas (uma linha por fonte por coleta).
//
// Por que roda no servidor: as APIs do COR/Antares/Tixxi não enviam CORS e as
// credenciais não podem ir para o bundle do navegador. Além disso o coletor
// precisa continuar funcionando sem ninguém com a página aberta.
//
// A normalização e a agregação usam shared/domain/*, exatamente as mesmas
// funções que a UI usa — não existe segunda implementação das regras.
//
// Cada fonte é coletada de forma isolada: uma falha não impede as outras e fica
// registrada como amostra com ok=false, para que a lacuna do histórico seja
// explícita em vez de silenciosa.

import {
  UNAVAILABLE_CAMERA_STATUSES,
  cameraAvailabilityPct,
  countCameraStatuses,
  normalizeCameras,
} from '../domain/cameras.js'
import { aggregateEvents, normalizeEvents } from '../domain/eventos.js'
import { aggregateControllers, normalizeControllers } from '../domain/semaforos.js'
import { aggregateAlerts, aggregateTraffic, normalizeAlerts, normalizeJams } from '../domain/waze.js'
import { proxyRoutes } from '../proxyRoutes.js'
import { getWazeFeed } from '../wazeFeed.js'

const REQUEST_TIMEOUT_MS = 30000
const ESTADO_PATH = '/antares/restful/integracao/v1/controlador/estado'

function targetFor(prefix, env) {
  const route = proxyRoutes.find((item) => item.prefix === prefix)
  return route ? route.resolveTarget(env) : null
}

async function requestJson(url, options = {}) {
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)

  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
      headers: { Accept: 'application/json', ...(options.headers || {}) },
    })

    const text = await response.text()
    let payload = null
    try {
      payload = text ? JSON.parse(text) : null
    } catch {
      payload = { message: text }
    }

    if (!response.ok) {
      const detail = payload?.Message || payload?.message || response.statusText
      const error = new Error(`${response.status} ${detail}`)
      error.status = response.status
      throw error
    }

    return payload
  } catch (err) {
    if (err?.name === 'AbortError') {
      throw new Error(`Tempo limite excedido ao consultar ${url}`)
    }
    throw err
  } finally {
    clearTimeout(timeoutId)
  }
}

function round(value, digits = 1) {
  if (!Number.isFinite(value)) return null
  const factor = 10 ** digits
  return Math.round(value * factor) / factor
}

// --------------------------------------------------------------- Ocorrências --

export async function collectOccurrences(env = {}) {
  const base = targetFor('/api/corio-events', env)
  if (!base) throw new Error('Destino da API do COR não configurado.')

  const login = await requestJson(`${base}/Login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      UserName: env.CORIO_EVENTS_USERNAME || 'APIOpenedEvent',
      Password: env.CORIO_EVENTS_PASSWORD || '12345',
    }),
  })

  const token = login?.AccessToken || login?.accessToken || login?.token || login?.data?.AccessToken
  if (!token) throw new Error('Login da API do COR não retornou token.')

  const payload = await requestJson(`${base}/OpenedEvents`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ token }).toString(),
  })

  const events = normalizeEvents(payload)
  const { severityCounts, typeCounts } = aggregateEvents(events)

  return {
    total: events.length,
    severity: {
      high: severityCounts.high.count,
      medium: severityCounts.medium.count,
      low: severityCounts.low.count,
    },
    geolocated: events.filter((event) => event.coordinates).length,
    topTypes: typeCounts.slice(0, 10).map((type) => ({ key: type.key, label: type.label, count: type.value })),
  }
}

// -------------------------------------------------------------------- Waze --

export async function collectWaze(env = {}) {
  const feed = await getWazeFeed(env.WAZE_FEED_URL)

  const jams = normalizeJams(feed.jams)
  const alerts = normalizeAlerts(feed.alerts)
  const traffic = aggregateTraffic(jams)
  const alertSummary = aggregateAlerts(alerts)

  return {
    jamCount: traffic.jamCount,
    congestionKm: traffic.congestionKm,
    slowKm: traffic.slowKm,
    totalKm: traffic.totalKm,
    avgCongestedSpeedKmh: round(traffic.avgCongestedSpeedKmh),
    alertCount: alertSummary.alertCount,
    alertsBySeverity: alertSummary.bySeverity,
    alertsByGroup: alertSummary.byGroup.map((group) => ({ key: group.key, count: group.count })),
    stale: Boolean(feed.stale),
  }
}

// --------------------------------------------------------------- Semáforos --

export async function collectTrafficLights(env = {}) {
  const base = targetFor('/api/antares', env)
  if (!base) throw new Error('Destino da API Antares não configurado.')

  const payload = await requestJson(`${base}${ESTADO_PATH}`, {
    method: 'GET',
    headers: env.ANTARES_API_KEY ? { 'API-Key': env.ANTARES_API_KEY } : {},
  })

  const controllers = normalizeControllers(payload)
  const summary = aggregateControllers(controllers)

  return {
    total: summary.total,
    online: summary.online,
    offline: summary.offline,
    normalCount: summary.normalCount,
    operationalPct: round(summary.operationalPct),
    status: summary.status,
    byGroup: summary.distribution.map((group) => ({ key: group.key, count: group.value })),
    topFailures: summary.topFailures.slice(0, 5).map((flag) => ({ key: flag.key, count: flag.value })),
  }
}

// ----------------------------------------------------------------- Câmeras --

export async function collectCameras(env = {}) {
  const base = env.TIXXI_TARGET || 'http://10.50.3.96:8000'

  // A Tixxi roda na rede interna do COR: fora dela a coleta falha e a amostra
  // fica registrada como indisponível, sem derrubar as outras fontes.
  const login = await requestJson(`${base}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      api_key: env.TIXXI_API_KEY || '',
      email: env.TIXXI_EMAIL || '',
      password: env.TIXXI_PASSWORD || '',
    }),
  })

  if (!login?.success || !login?.access_token) {
    throw new Error('Tixxi: falha na autenticação ao coletar câmeras.')
  }

  const payload = await requestJson(`${base}/api/cameras`, {
    method: 'GET',
    headers: { Authorization: `Bearer ${login.access_token}` },
  })

  const list = payload?.cameras ?? payload
  const cameras = normalizeCameras(Array.isArray(list) ? list : [])
  const counts = countCameraStatuses(cameras)

  return {
    total: counts.total,
    online: counts['0'] || 0,
    unavailable: UNAVAILABLE_CAMERA_STATUSES.reduce((sum, status) => sum + (counts[status] || 0), 0),
    availabilityPct: round(cameraAvailabilityPct(counts)),
    byStatus: Object.entries(counts)
      .filter(([key]) => key !== 'total')
      .map(([key, count]) => ({ key, count })),
  }
}

// ------------------------------------------------------------------ Orquestra --

const SOURCES = [
  { source: 'ocorrencias', collect: collectOccurrences },
  { source: 'waze', collect: collectWaze },
  { source: 'semaforos', collect: collectTrafficLights },
  { source: 'cameras', collect: collectCameras },
]

// Coleta todas as fontes em paralelo. Falhas viram amostras ok=false.
export async function collectAll(env = {}, { now = new Date() } = {}) {
  const results = await Promise.all(
    SOURCES.map(async ({ source, collect }) => {
      try {
        return { source, ok: true, error: null, metrics: await collect(env) }
      } catch (err) {
        return { source, ok: false, error: err?.message || 'Falha desconhecida na coleta.', metrics: {} }
      }
    }),
  )

  return {
    collectedAt: now.toISOString(),
    samples: results,
    ok: results.every((sample) => sample.ok),
    failed: results.filter((sample) => !sample.ok).map((sample) => sample.source),
  }
}
