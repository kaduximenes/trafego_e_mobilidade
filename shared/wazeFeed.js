// Feed do Waze for Cities (Partner Hub) — busca, enxugamento e cache.
//
// Por que isto roda no servidor e não no navegador:
//  1. A URL do feed é um token de parceiro (credencial). Expô-la no bundle
//     tornaria o feed público para qualquer visitante.
//  2. O feed não envia cabeçalhos CORS, então o navegador não conseguiria
//     consumi-lo direto de outra origem.
//
// O payload bruto passa de 1 MB; descartamos as geometrias e os campos não
// usados e servimos apenas o necessário para os painéis.
//
// Este módulo é consumido tanto pelo servidor de desenvolvimento (Vite)
// quanto pelo de produção (Express), garantindo comportamento idêntico.

const REQUEST_TIMEOUT_MS = 30000
const CACHE_TTL_MS = 60000

const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/115.0.0.0 Safari/537.36'

// Jams abaixo deste nível (0–5) são fluxo livre e não interessam ao painel.
const MIN_JAM_LEVEL = 1

// O feed cobre a região metropolitana; o painel usa somente o município do Rio.
// Itens sem cidade informada pelo Waze ficam de fora, por não ser possível confirmar o município.
const MUNICIPIO = 'Rio de Janeiro'
const noMunicipio = (item) => item?.city === MUNICIPIO

function toNumber(raw) {
  const value = Number(raw)
  return Number.isFinite(value) ? value : null
}

function toText(raw) {
  return typeof raw === 'string' ? raw : raw == null ? '' : String(raw)
}

function trimJamLine(raw, level) {
  if (level < 3 || !Array.isArray(raw)) return []

  const points = raw
    .map((point) => ({ lat: toNumber(point?.y), lon: toNumber(point?.x) }))
    .filter((point) => point.lat !== null && point.lon !== null
      && point.lat >= -90 && point.lat <= 90
      && point.lon >= -180 && point.lon <= 180)

  const maxPoints = 100
  if (points.length <= maxPoints) return points

  const stride = (points.length - 1) / (maxPoints - 1)
  return Array.from({ length: maxPoints }, (_, index) => points[Math.round(index * stride)])
}

function trimJam(raw = {}) {
  const level = toNumber(raw.level) ?? 0
  return {
    uuid: toText(raw.uuid ?? raw.id),
    street: toText(raw.street),
    city: toText(raw.city),
    level,
    speedKMH: toNumber(raw.speedKMH ?? raw.speed),
    length: toNumber(raw.length) ?? 0,
    delay: toNumber(raw.delay) ?? 0,
    pubMillis: toNumber(raw.pubMillis),
    line: trimJamLine(raw.line, level),
  }
}

function trimAlert(raw = {}) {
  const location = raw.location || {}
  return {
    uuid: toText(raw.uuid ?? raw.id),
    type: toText(raw.type),
    subtype: toText(raw.subtype),
    street: toText(raw.street),
    city: toText(raw.city),
    lat: toNumber(location.y),
    lon: toNumber(location.x),
    reliability: toNumber(raw.reliability) ?? 0,
    pubMillis: toNumber(raw.pubMillis),
    description: toText(raw.reportDescription),
  }
}

function trimIrregularity(raw = {}) {
  const line = Array.isArray(raw.line) ? raw.line : []
  const first = line[0] || {}
  return {
    id: toText(raw.id),
    street: toText(raw.street),
    city: toText(raw.city),
    severity: toNumber(raw.severity),
    jamLevel: toNumber(raw.jamLevel),
    delaySeconds: toNumber(raw.delaySeconds),
    length: toNumber(raw.length) ?? 0,
    trend: toNumber(raw.trend),
    lat: toNumber(first.y),
    lon: toNumber(first.x),
  }
}

export function parseWazeFeed(payload = {}) {
  const jams = (Array.isArray(payload.jams) ? payload.jams : [])
    .filter(noMunicipio)
    .map(trimJam)
    .filter((jam) => jam.level >= MIN_JAM_LEVEL)

  const alerts = (Array.isArray(payload.alerts) ? payload.alerts : [])
    .filter(noMunicipio)
    .map(trimAlert)

  const irregularities = (Array.isArray(payload.irregularities) ? payload.irregularities : [])
    .filter(noMunicipio)
    .map(trimIrregularity)

  return {
    generatedAt: new Date().toISOString(),
    feedStartMillis: toNumber(payload.startTimeMillis),
    feedEndMillis: toNumber(payload.endTimeMillis),
    jams,
    alerts,
    irregularities,
  }
}

export async function fetchWazeFeedRaw(url) {
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)

  try {
    const response = await fetch(url, {
      method: 'GET',
      headers: { Accept: 'application/json', 'User-Agent': USER_AGENT },
      signal: controller.signal,
    })

    if (!response.ok) {
      const error = new Error(
        response.status === 404
          ? 'Feed do Waze não encontrado — verifique a URL/token do parceiro.'
          : `Falha ao consultar o feed do Waze (${response.status}).`,
      )
      error.status = response.status
      throw error
    }

    return await response.json()
  } catch (err) {
    if (err?.name === 'AbortError') {
      const error = new Error('Tempo limite excedido ao consultar o feed do Waze.')
      error.status = 504
      throw error
    }
    throw err
  } finally {
    clearTimeout(timeoutId)
  }
}

// Cache em memória compartilhado pelas requisições dos clientes: o dashboard
// consulta a cada 2 min, mas o feed do Waze é atualizado ~1x/min. O TTL evita
// baixar ~1 MB por visitante e poupa o parceiro. Em caso de falha, serve o
// último resultado válido (stale) por até 5 min para não zerar o painel.
const cache = { at: 0, data: null }
const STALE_MAX_MS = 5 * 60 * 1000
function sendJson(res, statusCode, payload) {
  res.statusCode = statusCode
  res.setHeader('Content-Type', 'application/json')
  res.end(JSON.stringify(payload))
}

export async function getWazeFeed(feedUrl) {
  if (!feedUrl) {
    const error = new Error('WAZE_FEED_URL não configurada no servidor.')
    error.code = 'MISSING_CONFIG'
    throw error
  }

  const age = Date.now() - cache.at
  if (cache.data && age < CACHE_TTL_MS) return cache.data

  try {
    const data = parseWazeFeed(await fetchWazeFeedRaw(feedUrl))
    cache.at = Date.now()
    cache.data = data
    return data
  } catch (err) {
    if (cache.data && age < STALE_MAX_MS) return { ...cache.data, stale: true }
    throw err
  }
}

export function createWazeFeedHandler(env = process.env) {
  return async (_req, res) => {
    try {
      const data = await getWazeFeed(env.WAZE_FEED_URL)
      res.setHeader('Cache-Control', 'no-store')
      sendJson(res, 200, data)
    } catch (err) {
      if (err?.code === 'MISSING_CONFIG') {
        sendJson(res, 503, { error: err.message, code: err.code })
        return
      }
      sendJson(res, err?.status && err.status >= 400 ? err.status : 502, {
        error: err?.message || 'Falha ao consultar o feed do Waze.',
      })
    }
  }
}
