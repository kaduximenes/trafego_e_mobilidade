import { aggregateEvents, normalizeEvents, severityKeyOf } from '../../shared/domain/eventos.js'

export { aggregateEvents, severityKeyOf }

const TOKEN_STORAGE_KEY = 'corio_events_token'
const TOKEN_EXPIRY_KEY = 'corio_events_token_expiry'

// A API oficial não envia cabeçalhos CORS, então em dev usamos o proxy do Vite
// (ver vite.config.js) e em produção o proxy do servidor (server/index.js).
// O cliente nunca é apontado diretamente para o host externo.
const EVENTS_API_BASE =
  import.meta.env.VITE_CORIO_EVENTS_BASE_URL || '/api/corio-events'

const OPEN_EVENTS_PATH = '/OpenedEvents'
const REQUEST_TIMEOUT_MS = 15000

// A normalização e a agregação puras (severidade, tipo, feed) vivem em
// shared/domain/eventos.js, compartilhadas com o coletor do histórico.

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

  return normalizeEvents(payload)
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
