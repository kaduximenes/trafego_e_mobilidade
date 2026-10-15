// Cliente da API Tixxi
// As chamadas passam pelo proxy do Vite (/api/tixxi) para contornar o CORS.

import { CAMERA_STATUS, getStatusInfo, normalizeCameras } from '../../shared/domain/cameras.js'

const BASE = '/api/tixxi'

// O catálogo de status, a contagem e a normalização puras ficam em
// shared/domain/cameras.js, compartilhados com o coletor do histórico.
export { CAMERA_STATUS, getStatusInfo }

// Lê o corpo JSON de uma resposta de erro para extrair a mensagem da API.
async function readErrorDetail(res) {
  try {
    const data = await res.json()
    if (data?.message) return data.message
  } catch {
    /* corpo não-JSON */
  }
  return null
}

// Mensagem amigável para os códigos de erro mais comuns da Tixxi.
function friendlyError(res, path, detail) {
  // O backend Tixxi devolve "Maximum simultaneous connections reached"
  // com status 429 (e, por vezes, 403 via proxy). Detecta pelo texto.
  if (/simultaneous connections|conexões simultâneas/i.test(detail || '')) {
    return 'Tixxi: limite de conexões simultâneas atingido no servidor (aguarde e tente novamente)'
  }
  if (res.status === 429) {
    return 'Tixxi: limite de requisições atingido no servidor'
  }
  if (res.status === 403) {
    return detail ? `Tixxi: acesso negado (${detail})` : 'Tixxi: acesso negado (verifique as credenciais ou a rede)'
  }
  if (res.status === 401) {
    return 'Tixxi: falha de autenticação'
  }
  const suffix = detail ? ` (${detail})` : ''
  return `Tixxi ${path} falhou (${res.status})${suffix}`
}

function apiError(res, path, detail) {
  const error = new Error(friendlyError(res, path, detail))
  error.status = res.status
  return error
}

async function post(path, body) {
  // URLSearchParams serializa `undefined` como o texto "undefined"; o filtro
  // mantém o comportamento antigo do JSON.stringify, que omitia a chave ausente.
  const form = new URLSearchParams(
    Object.entries(body).filter(([, value]) => value != null),
  )
  const res = await fetch(`${BASE}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: form.toString(),
  })
  if (!res.ok) {
    throw apiError(res, path, await readErrorDetail(res))
  }
  return res.json()
}

async function get(path, token) {
  const res = await fetch(`${BASE}${path}`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  if (!res.ok) {
    throw apiError(res, path, await readErrorDetail(res))
  }
  return res.json()
}

// Espera 'ms' milissegundos (backoff exponencial para retry).
function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

// Re-executa 'fn' com retry exponencial quando o erro for 429/403
// (limite de conexões simultâneas do backend Tixxi).
async function withRetry(fn, { retries = 3, baseDelay = 1500 } = {}) {
  let lastErr
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await fn()
    } catch (err) {
      lastErr = err
      const isTransient = /conexões simultâneas|429|403/i.test(err.message || '')
      if (!isTransient || attempt === retries) break
      await sleep(baseDelay * 2 ** attempt)
    }
  }
  throw lastErr
}

let authPromise = null
let cachedToken = null
let tokenExpiresAt = 0

export async function login() {
  if (cachedToken && Date.now() < tokenExpiresAt) {
    return cachedToken
  }
  if (authPromise) return authPromise

  authPromise = withRetry(async () => {
    // O cliente NÃO envia credenciais: o servidor (dev e produção) responde o
    // login a partir da sessão única dele. Isso mantém o segredo fora do bundle
    // e, principalmente, evita uma segunda sessão no upstream — o gateway do
    // Tixxi admite uma só e responde 429/403 quando ela é excedida.
    const data = await post('/api/auth/login', {})
    if (!data?.success || !data?.access_token) {
      throw new Error('Tixxi: falha na autenticação (credenciais inválidas)')
    }
    cachedToken = data.access_token
    // expira em 'expires_in' segundos; renova com 60s de folga
    tokenExpiresAt = Date.now() + ((data.expires_in || 3600) - 60) * 1000
    return cachedToken
  })

  try {
    return await authPromise
  } finally {
    authPromise = null
  }
}

function forgetToken() {
  cachedToken = null
  tokenExpiresAt = 0
}

async function loadCameras() {
  const token = await login()
  const data = await withRetry(() => get('/api/cameras', token))
  const list = data?.cameras ?? data
  return normalizeCameras(Array.isArray(list) ? list : [])
}

// Busca a lista de câmeras e normaliza (deduplicação por código e mapeamento
// de status). Cada câmera pode ter múltiplos streams (html/raw); mantemos o
// stream 'html' preferencial.
export async function getCameras() {
  try {
    return await loadCameras()
  } catch (err) {
    // A sessão pertence ao servidor: quando ele renova o token, o nosso fica
    // para trás e o upstream responde 401. Descarta o cache e tenta de novo.
    if (err?.status !== 401) throw err
    forgetToken()
    return loadCameras()
  }
}
