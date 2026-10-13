// Coletor do histórico: busca o estado atual de cada fonte, grava métricas
// compactas (série temporal) e um frame compacto (para o replay do mapa).
//
// Por que roda no servidor: as APIs do COR/Antares/Tixxi não enviam CORS e as
// credenciais não podem ir para o bundle do navegador. Além disso o coletor
// precisa continuar funcionando sem ninguém com a página aberta.
//
// A normalização e a agregação usam shared/domain/*, exatamente as mesmas
// funções que a UI usa — não existe segunda implementação das regras.
//
// O ciclo é separado em duas fases por fonte:
//   fetch*  → dados normalizados (a chamada de rede acontece uma única vez)
//   derive* → métricas e payload do frame a partir dos mesmos dados
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

// Limites do payload do frame: o suficiente para redesenhar o mapa sem inflar o
// banco. O feed de ocorrências cobre a cidade inteira; os alertas do Waze já são
// centenas, então guardamos os mais relevantes.
const FRAME_OCCURRENCE_LIMIT = 400
const FRAME_ALERT_LIMIT = 120
const FRAME_JAM_LIMIT = 150
// Os controladores plotáveis são centenas (o grupo "sem comunicação" domina);
// 120 já cobrem o mapa sem repetir o feed inteiro.
const FRAME_CONTROLLER_LIMIT = 120
// Câmeras indisponíveis: 245 em manutenção + 141 desligadas + 113 sem
// comunicação + 101 intermitentes. 300 cobre o conjunto com folga.
const FRAME_CAMERA_LIMIT = 300
// As geometrias do Waze são o que mais pesa no frame. 30 pontos por trecho já
// desenham a via com fidelidade suficiente em zoom de cidade, e 5 casas decimais
// (~1 m) não têm perda visível.
const FRAME_JAM_MAX_POINTS = 30
const COORD_DECIMALS = 5

function roundCoord(value, digits = COORD_DECIMALS) {
  if (!Number.isFinite(value)) return null
  const factor = 10 ** digits
  return Math.round(value * factor) / factor
}

function thinCoordinates(coordinates, maxPoints = FRAME_JAM_MAX_POINTS) {
  if (!Array.isArray(coordinates) || coordinates.length <= maxPoints) {
    return (coordinates || []).map(([lat, lon]) => [roundCoord(lat), roundCoord(lon)])
  }

  const stride = (coordinates.length - 1) / (maxPoints - 1)
  return Array.from({ length: maxPoints }, (_, index) => {
    const [lat, lon] = coordinates[Math.round(index * stride)]
    return [roundCoord(lat), roundCoord(lon)]
  })
}

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

export async function fetchOccurrences(env = {}) {
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

  return normalizeEvents(payload)
}

export function occurrencesMetrics(events) {
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

// O frame guarda só o necessário para redesenhar os marcadores.
export function occurrencesFrame(events) {
  return events.slice(0, FRAME_OCCURRENCE_LIMIT).map((event) => ({
    id: event.id,
    type: event.type,
    typeKey: event.typeKey,
    severity: event.severity,
    severityColor: event.severityColor,
    severityLabel: event.severityLabel,
    status: event.status,
    location: event.location,
    timestamp: event.timestamp,
    ...(event.coordinates
      ? {
          coordinates: [
            roundCoord(event.coordinates.latitude),
            roundCoord(event.coordinates.longitude),
          ],
        }
      : {}),
  }))
}

export async function collectOccurrences(env = {}) {
  return occurrencesMetrics(await fetchOccurrences(env))
}

// -------------------------------------------------------------------- Waze --

export async function fetchWaze(env = {}) {
  const feed = await getWazeFeed(env.WAZE_FEED_URL)
  return {
    jams: normalizeJams(feed.jams),
    alerts: normalizeAlerts(feed.alerts),
    stale: Boolean(feed.stale),
  }
}

export function wazeMetrics({ jams, alerts, stale }) {
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
    stale,
  }
}

// Só os trechos com retenção vão para o frame; o resto é fluxo livre e não é
// desenhado no mapa.
export function wazeFrame({ jams, alerts }) {
  const congested = jams
    .filter((jam) => jam.level >= 3 && jam.coordinates.length >= 2)
    .sort((a, b) => b.lengthKm - a.lengthKm)
    .slice(0, FRAME_JAM_LIMIT)

  return {
    jams: congested.map((jam) => ({
      id: jam.id,
      street: jam.street,
      level: jam.level,
      bucketColor: jam.bucketColor,
      bucketLabel: jam.bucketLabel,
      lengthKm: round(jam.lengthKm, 2),
      speedKmh: jam.speedKmh,
      delayS: jam.delayS,
      coordinates: thinCoordinates(jam.coordinates),
    })),
    alerts: alerts.slice(0, FRAME_ALERT_LIMIT).map((alert) => ({
      id: alert.id,
      groupKey: alert.groupKey,
      label: alert.label,
      severity: alert.severity,
      street: alert.street,
      lat: roundCoord(alert.lat),
      lon: roundCoord(alert.lon),
      updatedAt: alert.updatedAt,
    })),
  }
}

export async function collectWaze(env = {}) {
  return wazeMetrics(await fetchWaze(env))
}

// --------------------------------------------------------------- Semáforos --

export async function fetchTrafficLights(env = {}) {
  const base = targetFor('/api/antares', env)
  if (!base) throw new Error('Destino da API Antares não configurado.')

  const payload = await requestJson(`${base}${ESTADO_PATH}`, {
    method: 'GET',
    headers: env.ANTARES_API_KEY ? { 'API-Key': env.ANTARES_API_KEY } : {},
  })

  return normalizeControllers(payload)
}

export function trafficLightsMetrics(controllers) {
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

// O frame guarda os controladores com falha, que são os plotáveis no mapa.
export function trafficLightsFrame(controllers) {
  return controllers
    .filter(
      (controller) =>
        controller.groupKey !== 'normal' &&
        controller.latitude !== null &&
        controller.longitude !== null,
    )
    .slice(0, FRAME_CONTROLLER_LIMIT)
    .map((controller) => ({
      id: controller.id,
      estado: controller.estado,
      groupKey: controller.groupKey,
      groupLabel: controller.groupLabel,
      groupColor: controller.groupColor,
      latitude: roundCoord(controller.latitude),
      longitude: roundCoord(controller.longitude),
      lastCommunication: controller.lastCommunication,
      flags: controller.flags.map((flag) => flag.label),
    }))
}

export async function collectTrafficLights(env = {}) {
  return trafficLightsMetrics(await fetchTrafficLights(env))
}

// ----------------------------------------------------------------- Câmeras --

// Credenciais da Tixxi para o coletor. O `.env` de desenvolvimento define as
// variáveis com prefixo VITE_ (consumidas pelo bundle ao chamar a API pelo
// navegador); aqui aceitamos as duas formas para não obrigar a duplicar o mesmo
// segredo só porque o consumidor mudou. Em produção prevalecem as sem prefixo.
function tixxiCredentials(env = {}) {
  return {
    apiKey: env.TIXXI_API_KEY || env.VITE_TIXXI_API_KEY || '',
    email: env.TIXXI_EMAIL || env.VITE_TIXXI_EMAIL || '',
    password: env.TIXXI_PASSWORD || env.VITE_TIXXI_PASSWORD || '',
  }
}

export async function fetchCameras(env = {}) {
  const base = env.TIXXI_TARGET || 'http://10.50.3.96:8000'
  const { apiKey, email, password } = tixxiCredentials(env)

  // A Tixxi roda na rede interna do COR: fora dela a coleta falha e a amostra
  // fica registrada como indisponível, sem derrubar as outras fontes.
  const login = await requestJson(`${base}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ api_key: apiKey, email, password }),
  })

  if (!login?.success || !login?.access_token) {
    throw new Error('Tixxi: falha na autenticação ao coletar câmeras.')
  }

  const payload = await requestJson(`${base}/api/cameras`, {
    method: 'GET',
    headers: { Authorization: `Bearer ${login.access_token}` },
  })

  const list = payload?.cameras ?? payload
  return normalizeCameras(Array.isArray(list) ? list : [])
}

export function camerasMetrics(cameras) {
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

// Só as câmeras indisponíveis entram no frame: as operacionais são 6 mil e o
// mapa não as desenha, então guardá-las multiplicaria o frame por 10 sem uso.
// O total e a disponibilidade ficam nas métricas.
export function camerasFrame(cameras) {
  return cameras
    .filter(
      (camera) =>
        camera.statusRaw !== '0' && camera.latitude !== null && camera.longitude !== null,
    )
    .slice(0, FRAME_CAMERA_LIMIT)
    .map((camera) => ({
      id: camera.id,
      code: camera.code,
      name: camera.name,
      statusRaw: camera.statusRaw,
      statusKey: camera.status?.key,
      statusLabel: camera.status?.label,
      statusColor: camera.status?.color,
      latitude: roundCoord(camera.latitude),
      longitude: roundCoord(camera.longitude),
    }))
}

export async function collectCameras(env = {}) {
  return camerasMetrics(await fetchCameras(env))
}

// ------------------------------------------------------------------ Orquestra --

// Cada fonte declara como buscar, como virar métrica e como virar frame.
// `endpoint` é o nome usado no filtro de /api/metrics.
const SOURCES = [
  { source: 'ocorrencias', endpoint: 'occurrences', fetch: fetchOccurrences, metrics: occurrencesMetrics, frame: occurrencesFrame },
  { source: 'waze', endpoint: 'waze', fetch: fetchWaze, metrics: wazeMetrics, frame: wazeFrame },
  { source: 'semaforos', endpoint: 'trafficLights', fetch: fetchTrafficLights, metrics: trafficLightsMetrics, frame: trafficLightsFrame },
  { source: 'cameras', endpoint: 'cameras', fetch: fetchCameras, metrics: camerasMetrics, frame: camerasFrame },
]

// Coleta todas as fontes em paralelo. Falhas viram amostras ok=false e ficam
// ausentes do frame (melhor não desenhar do que desenhar dado errado).
export async function collectAll(env = {}, { now = new Date() } = {}) {
  const results = await Promise.all(
    SOURCES.map(async ({ source, fetch: fetchSource, metrics, frame }) => {
      try {
        const data = await fetchSource(env)
        return {
          source,
          ok: true,
          error: null,
          metrics: metrics(data),
          frame: frame(data),
          // Os dados normalizados ficam disponíveis para as tabelas derivadas
          // (ciclo de vida das ocorrências e transições de estado).
          data,
          count: Array.isArray(data) ? data.length : null,
        }
      } catch (err) {
        return {
          source,
          ok: false,
          error: err?.message || 'Falha desconhecida na coleta.',
          metrics: {},
          frame: null,
          data: null,
          count: null,
        }
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

// Monta o payload do frame: um objeto por fonte, no formato que o mapa consome.
export function buildFramePayload(samples) {
  const bySource = Object.fromEntries(samples.map((sample) => [sample.source, sample]))

  return {
    occurredAt: null,
    occurrences: bySource.ocorrencias?.frame || [],
    waze: bySource.waze?.frame || { jams: [], alerts: [] },
    trafficLights: bySource.semaforos?.frame || [],
    cameras: bySource.cameras?.frame || [],
  }
}

// ------------------------------------------------------- Ciclo de vida (fatia 3)

// Lista de entidades no formato aceito pelo diff do store. O estado observado é
// o groupKey (semáforos) ou o status normalizado (câmeras): são os valores cuja
// mudança interessa operacionalmente.
export function entityStatesOf(source, data) {
  if (source === 'semaforos') {
    return data.map((controller) => ({ entityId: controller.id, state: controller.groupKey }))
  }
  if (source === 'cameras') {
    return data.map((camera) => ({ entityId: String(camera.id ?? camera.code), state: camera.status?.key }))
  }
  return []
}

// Normaliza uma ocorrência para o registro persistido, reaproveitando o formato
// do frame (coordenadas como par).
export function occurrenceRecords(events) {
  return occurrencesFrame(events).map((event) => ({
    id: event.id,
    severity: event.severity,
    typeKey: event.typeKey,
    type: event.type,
    location: event.location,
    coordinates: event.coordinates,
  }))
}
