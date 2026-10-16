// Sessão única por upstream.
//
// A API do COR e o gateway do Tixxi permitem UMA sessão por vez: cada novo login
// invalida o token anterior. Se o navegador e o coletor logarem cada um por
// conta própria, um derruba a sessão do outro — o COR responde
// 400 "Invalid token" e o Tixxi, 429/403 "Maximum simultaneous connections
// reached".
//
// Por isso só o servidor faz login: ele guarda a sessão e a compartilha. O
// navegador pede /Login e recebe o token que já existe, sem falar com o
// upstream — assim os dois consomem a MESMA sessão em vez de competir por ela.

import { proxyRoutes, upstreamUrl } from './proxyRoutes.js'

const LOGIN_TIMEOUT_MS = 30000
const DEFAULT_SKEW_MS = 60000
const DEFAULT_TTL_SECONDS = 3600

function targetFor(prefix, env) {
  const route = proxyRoutes.find((item) => item.prefix === prefix)
  return route ? route.resolveTarget(env) : null
}

function fail(message, status) {
  const error = new Error(message)
  error.status = status
  return error
}

async function readPayload(response) {
  const text = await response.text()
  if (!text) return null
  try {
    return JSON.parse(text)
  } catch {
    return { message: text }
  }
}

// Mantém um token por upstream, renovado sob demanda e uma única vez por vez
// (login concorrente compartilha a mesma promise, em vez de abrir duas sessões).
export function createUpstreamSession({ login, skewMs = DEFAULT_SKEW_MS, now = () => Date.now() }) {
  let token = null
  let expiresIn = DEFAULT_TTL_SECONDS
  let expiresAt = 0
  let inFlight = null

  // Renova um pouco antes de vencer, para não entregar um token já expirado.
  const isFresh = () => Boolean(token) && now() < expiresAt - skewMs

  async function ensure(env) {
    if (isFresh()) return { token, expiresIn }
    if (inFlight) return inFlight

    inFlight = (async () => {
      const result = await login(env)
      token = result.token
      expiresIn = Number(result.expiresIn) > 0 ? Number(result.expiresIn) : DEFAULT_TTL_SECONDS
      expiresAt = now() + expiresIn * 1000
      return { token, expiresIn }
    })()

    try {
      return await inFlight
    } finally {
      inFlight = null
    }
  }

  return {
    getSession: (env) => ensure(env),
    async getToken(env) {
      return (await ensure(env)).token
    },
    // Descarta o token: o próximo uso faz um login novo. Chamado quando o
    // upstream responde "Invalid token" (alguém renovou a sessão por fora).
    invalidate() {
      token = null
      expiresIn = DEFAULT_TTL_SECONDS
      expiresAt = 0
    },
    // Diagnóstico (health): expõe se há sessão válida sem forçar login.
    status() {
      return { hasToken: Boolean(token), fresh: isFresh(), expiresAt }
    },
  }
}

// ------------------------------------------------------------------- COR --

async function loginCorio(env = {}) {
  const base = targetFor('/api/corio-events', env)
  if (!base) throw fail('Destino da API do COR não configurado.', 503)

  const response = await fetch(`${base}/Login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({
      UserName: env.CORIO_EVENTS_USERNAME || 'APIOpenedEvent',
      Password: env.CORIO_EVENTS_PASSWORD || '12345',
    }),
    signal: AbortSignal.timeout(LOGIN_TIMEOUT_MS),
  })

  const payload = await readPayload(response)
  if (!response.ok) {
    throw fail(payload?.Message || payload?.message || `Login do COR falhou (${response.status})`, response.status)
  }

  const token = payload?.AccessToken || payload?.accessToken || payload?.token
  if (!token) throw fail('Login da API do COR não retornou token.', 502)

  return { token, expiresIn: payload?.ExpiresIn ?? payload?.expiresIn }
}

// ---------------------------------------------------------------- Tixxi --

async function loginTixxi(env = {}) {
  const url = upstreamUrl('/api/tixxi', env, '/api/auth/login')
  if (!url) throw fail('Destino do Tixxi não configurado.', 503)

  const credentials = {
    api_key: env.TIXXI_API_KEY || env.VITE_TIXXI_API_KEY || '',
    email: env.TIXXI_EMAIL || env.VITE_TIXXI_EMAIL || '',
    password: env.TIXXI_PASSWORD || env.VITE_TIXXI_PASSWORD || '',
  }
  // Sem credencial o upstream só responde 422 "Validation failed"; falhar aqui
  // diz o que falta e não gasta uma tentativa de login.
  const missing = Object.keys(credentials).filter((key) => !credentials[key])
  if (missing.length) {
    throw fail(`Tixxi: credenciais não configuradas (${missing.join(', ')}). Defina TIXXI_API_KEY, TIXXI_EMAIL e TIXXI_PASSWORD no .env.`, 503)
  }

  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
    body: new URLSearchParams(credentials).toString(),
    signal: AbortSignal.timeout(LOGIN_TIMEOUT_MS),
  })

  const payload = await readPayload(response)
  if (!response.ok || !payload?.success) {
    // 422 traz os campos rejeitados em `errors` ({ campo: [mensagens] }).
    const fieldErrors = payload?.errors && typeof payload.errors === 'object'
      ? Object.values(payload.errors).flat().join('; ')
      : ''
    const message = payload?.message || payload?.Message || 'falha na autenticação'
    const detail = fieldErrors ? `${message}: ${fieldErrors}` : message
    throw fail(`Tixxi: ${detail} (HTTP ${response.status})`, response.ok ? 502 : response.status)
  }

  if (!payload.access_token) throw fail('Tixxi: login não retornou access_token.', 502)

  return { token: payload.access_token, expiresIn: payload.expires_in }
}

export const corioSession = createUpstreamSession({ login: loginCorio })
export const tixxiSession = createUpstreamSession({ login: loginTixxi })

// Resposta do login para o navegador: o mesmo formato do upstream, para que o
// cliente não precise saber que o token vem do cache do servidor.
export async function corioLoginResponse(env = {}, { force = false } = {}) {
  try {
    if (force) corioSession.invalidate()
    const { token, expiresIn } = await corioSession.getSession(env)
    return { status: 200, body: { AccessToken: token, ExpiresIn: expiresIn, Error: null } }
  } catch (error) {
    return { status: error.status || 502, body: { Message: error.message } }
  }
}

export async function tixxiLoginResponse(env = {}) {
  try {
    const { token, expiresIn } = await tixxiSession.getSession(env)
    return { status: 200, body: { success: true, expires_in: expiresIn, access_token: token } }
  } catch (error) {
    return { status: error.status || 502, body: { success: false, message: error.message } }
  }
}

// Usado pelos testes para começar de um estado sem token.
export function resetUpstreamSessions() {
  corioSession.invalidate()
  tixxiSession.invalidate()
}
