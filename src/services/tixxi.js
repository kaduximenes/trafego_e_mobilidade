// Cliente da API Tixxi
// As chamadas passam pelo proxy do Vite (/api/tixxi) para contornar o CORS.

const BASE = '/api/tixxi'

// Mapeamento do campo CameraStatus da Tixxi para estados visuais do painel.
// '0'  → Operacional
// '1'  → Desligada
// '3'  → Sem Comunicação / Offline
// 'A'  → Manutenção (FIXA / sem stream)
// '5'  → Intermitente / Instável
export const CAMERA_STATUS = {
  0: { key: 'online', label: 'Operacional', color: '#10B981', badge: 'ok' },
  1: { key: 'off', label: 'Desligada', color: '#EF4444', badge: 'danger' },
  3: { key: 'offline', label: 'Sem Comunicação', color: '#EF4444', badge: 'danger' },
  A: { key: 'maintenance', label: 'Manutenção', color: '#8B5CF6', badge: 'maintenance' },
  5: { key: 'intermittent', label: 'Intermitente', color: '#F59E0B', badge: 'warn' },
}

export function getStatusInfo(status) {
  return CAMERA_STATUS[status] || { key: 'unknown', label: `Status ${status}`, color: '#64748B', badge: 'unknown' }
}

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

async function post(path, body) {
  const res = await fetch(`${BASE}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!res.ok) {
    throw new Error(friendlyError(res, path, await readErrorDetail(res)))
  }
  return res.json()
}

async function get(path, token) {
  const res = await fetch(`${BASE}${path}`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  if (!res.ok) {
    throw new Error(friendlyError(res, path, await readErrorDetail(res)))
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
    // O corpo só é preenchido no cliente em desenvolvimento. Em produção o
    // proxy do servidor injeta as credenciais (server/index.js), evitando que
    // VITE_* embuta segredos no bundle.
    const payload = import.meta.env.DEV
      ? {
          api_key: import.meta.env.VITE_TIXXI_API_KEY,
          email: import.meta.env.VITE_TIXXI_EMAIL,
          password: import.meta.env.VITE_TIXXI_PASSWORD,
        }
      : {}
    const data = await post('/api/auth/login', payload)
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

export async function getCameras() {
  const token = await login()
  const data = await withRetry(() => get('/api/cameras', token))
  const list = data?.cameras ?? data
  return normalizeCameras(Array.isArray(list) ? list : [])
}
