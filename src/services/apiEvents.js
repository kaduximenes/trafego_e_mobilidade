import { resolveEventType } from '../data/eventTypeMap'

const TOKEN_STORAGE_KEY = 'corio_events_token'
const TOKEN_EXPIRY_KEY = 'corio_events_token_expiry'

// A API oficial não envia cabeçalhos CORS, então em dev usamos o proxy do Vite
// (ver vite.config.js) e em produção o proxy do servidor (server/index.js).
// O cliente nunca é apontado diretamente para o host externo.
const EVENTS_API_BASE =
  import.meta.env.VITE_CORIO_EVENTS_BASE_URL || '/api/corio-events'

const OPEN_EVENTS_PATH = '/OpenedEvents'
const REQUEST_TIMEOUT_MS = 15000

const severityPalette = {
  high: { key: 'high', label: 'Alta', color: '#EF4444' },
  medium: { key: 'medium', label: 'Média', color: '#F59E0B' },
  low: { key: 'low', label: 'Baixa', color: '#3B82F6' },
}

function getTokenFromStorage() {
  const token = localStorage.getItem(TOKEN_STORAGE_KEY)
  const expiresAt = Number(localStorage.getItem(TOKEN_EXPIRY_KEY) || 0)

  if (!token || !expiresAt || Date.now() > expiresAt) {
    localStorage.removeItem(TOKEN_STORAGE_KEY)
    localStorage.removeItem(TOKEN_EXPIRY_KEY)
    return null
  }

  return token
}

function setTokenInStorage(token, expiresInSeconds) {
  const ttlMs = Number(expiresInSeconds) > 0 ? Number(expiresInSeconds) * 1000 : 60 * 60 * 1000
  // Renova 60s antes do vencimento para evitar corrida com o polling.
  const expiresAt = Date.now() + Math.max(ttlMs - 60000, 30000)
  localStorage.setItem(TOKEN_STORAGE_KEY, token)
  localStorage.setItem(TOKEN_EXPIRY_KEY, String(expiresAt))
}

function clearTokenStorage() {
  localStorage.removeItem(TOKEN_STORAGE_KEY)
  localStorage.removeItem(TOKEN_EXPIRY_KEY)
}

async function request(url, options = {}) {
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)

  try {
    return await fetch(url, { ...options, signal: controller.signal })
  } catch (err) {
    if (err?.name === 'AbortError') {
      throw new Error('Tempo limite excedido ao consultar a API do COR.')
    }
    throw err
  } finally {
    clearTimeout(timeoutId)
  }
}

async function parseJson(response) {
  const text = await response.text()
  if (!text) return {}
  try {
    return JSON.parse(text)
  } catch {
    return { message: text }
  }
}

function readServerMessage(payload, fallback) {
  if (!payload || typeof payload !== 'object') return fallback
  return payload.Message || payload.message || payload.error || payload.detail || fallback
}

function getNestedValue(data, keys) {
  for (const key of keys) {
    const value = data?.[key]
    if (value !== undefined && value !== null && value !== '') return value
  }
  return undefined
}

function asArray(value) {
  if (Array.isArray(value)) return value
  if (value && typeof value === 'object') {
    for (const candidate of [value.data, value.result, value.items, value.events, value.openedEvents]) {
      if (Array.isArray(candidate)) return candidate
    }
  }
  return []
}

function normalizeTimestamp(raw) {
  const parsed = new Date(raw ?? Date.now())
  return Number.isNaN(parsed.getTime()) ? Date.now() : parsed.getTime()
}

function toNumber(raw) {
  const value = Number(raw)
  return Number.isFinite(value) ? value : null
}

// A API devolve: EventId, AgencyEventTypeCode, CreatedDate, Latitude,
// Longitude, Location e Priority.
function normalizeEvent(raw = {}) {
  const type = resolveEventType(
    getNestedValue(raw, ['AgencyEventTypeCode', 'agencyEventTypeCode', 'eventType', 'type']),
  )

  const createdRaw = getNestedValue(raw, ['CreatedDate', 'createdDate', 'createdAt', 'date', 'timestamp'])
  const location = String(getNestedValue(raw, ['Location', 'location', 'address']) || 'Local não informado')
  const latitude = toNumber(getNestedValue(raw, ['Latitude', 'latitude']))
  const longitude = toNumber(getNestedValue(raw, ['Longitude', 'longitude']))
  const priority = toNumber(getNestedValue(raw, ['Priority', 'priority']))

  const id =
    getNestedValue(raw, ['EventId', 'eventId', 'id']) ||
    `${type.code}-${normalizeTimestamp(createdRaw)}-${Math.random().toString(36).slice(2, 8)}`

  return {
    id: String(id),
    code: String(id),
    type: type.label,
    typeCode: type.code,
    typeKey: type.code.toLowerCase(),
    icon: type.icon,
    severity: type.severity,
    severityLabel: severityPalette[type.severity].label,
    severityColor: severityPalette[type.severity].color,
    priority,
    description: location,
    location,
    coordinates: latitude !== null && longitude !== null ? { latitude, longitude } : null,
    // O endpoint retorna apenas ocorrências abertas.
    status: 'Ativo',
    createdAt: createdRaw || new Date().toISOString(),
    timestamp: normalizeTimestamp(createdRaw),
  }
}

// A API invalida o token anterior a cada novo Login. Requisições concorrentes
// (ex.: efeito duplicado pelo StrictMode) precisam compartilhar a mesma
// autenticação para o token não ser invalidado no meio da chamada.
let loginInFlight = null

async function performLogin() {
  const response = await request(`${EVENTS_API_BASE}/Login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
  })

  const payload = await parseJson(response)

  if (!response.ok) {
    throw new Error(readServerMessage(payload, `Login falhou (${response.status})`))
  }

  const token =
    payload.AccessToken ||
    payload.accessToken ||
    payload.token ||
    payload.data?.AccessToken ||
    payload.data?.accessToken

  if (!token) {
    throw new Error('Login da API retornou resposta sem token de autenticação.')
  }

  setTokenInStorage(token, payload.ExpiresIn ?? payload.expiresIn)
  return token
}

export function loginToEventsApi({ force = false } = {}) {
  if (force) {
    clearTokenStorage()
  } else {
    const cachedToken = getTokenFromStorage()
    if (cachedToken) return Promise.resolve(cachedToken)
  }

  if (!loginInFlight) {
    loginInFlight = performLogin().finally(() => {
      loginInFlight = null
    })
  }

  return loginInFlight
}

// O token é exigido como campo de formulário ("token"), e não no header Authorization.
async function requestOpenedEvents(token) {
  const response = await request(`${EVENTS_API_BASE}${OPEN_EVENTS_PATH}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ token }).toString(),
  })

  const payload = await parseJson(response)
  return { response, payload }
}

function isInvalidToken(response, payload) {
  return response.status === 400 && /invalid token/i.test(String(payload?.Message || payload?.message || ''))
}

async function loadActiveEvents() {
  let token = await loginToEventsApi()
  let { response, payload } = await requestOpenedEvents(token)

  // O token pode expirar entre o cache e a chamada: renova uma única vez.
  if (isInvalidToken(response, payload)) {
    token = await loginToEventsApi({ force: true })
    ;({ response, payload } = await requestOpenedEvents(token))
  }

  if (!response.ok) {
    const message = readServerMessage(payload, `Falha ao buscar ocorrências (${response.status})`)
    if (response.status === 401 || response.status === 403) {
      clearTokenStorage()
      throw new Error(`Token inválido ou expirado na API COR (${message})`)
    }
    throw new Error(message)
  }

  if (payload?.Message || payload?.message) {
    throw new Error(readServerMessage(payload, 'A API COR retornou uma mensagem inesperada.'))
  }

  return asArray(payload)
    .map(normalizeEvent)
    .sort((a, b) => b.timestamp - a.timestamp)
}

// Requisições concorrentes (StrictMode, polling e clique manual) compartilham o
// mesmo ciclo; como cada Login invalida o token anterior, ciclos simultâneos
// derrubariam uns aos outros com "Invalid token".
let activeEventsInFlight = null

export function fetchActiveEvents() {
  if (!activeEventsInFlight) {
    activeEventsInFlight = loadActiveEvents().finally(() => {
      activeEventsInFlight = null
    })
  }

  return activeEventsInFlight
}

export function aggregateEvents(events = []) {
  const normalized = Array.isArray(events) ? events : []

  const severityCounts = {
    high: {
      key: 'high',
      label: 'Alta',
      count: 0,
      color: severityPalette.high.color,
      description: 'Risco à vida • Vias interditadas',
    },
    medium: {
      key: 'medium',
      label: 'Média',
      count: 0,
      color: severityPalette.medium.color,
      description: 'Bloqueios parciais • Tráfego comprometido',
    },
    low: {
      key: 'low',
      label: 'Baixa',
      count: 0,
      color: severityPalette.low.color,
      description: 'Manutenção • Impacto operacional leve',
    },
  }

  const typeMap = new Map()

  for (const event of normalized) {
    const severityKey = severityPalette[event.severity] ? event.severity : 'medium'
    severityCounts[severityKey].count += 1

    const key = event.typeKey || 'ocorrencia_geral'
    if (!typeMap.has(key)) {
      typeMap.set(key, {
        key,
        label: event.type || 'Ocorrência geral',
        value: 0,
        color: event.severityColor,
      })
    }

    typeMap.get(key).value += 1
  }

  const palette = ['#00A8FF', '#EF4444', '#F59E0B', '#8B5CF6', '#10B981', '#38BDF8']
  const typeCounts = Array.from(typeMap.values())
    .sort((a, b) => b.value - a.value)
    .map((item, index) => ({ ...item, color: palette[index % palette.length] }))

  const feed = [...normalized].sort((a, b) => b.timestamp - a.timestamp)

  return { severityCounts, typeCounts, feed }
}
