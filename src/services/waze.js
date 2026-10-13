// Integração com o Waze for Cities (Partner Hub).
//
// O token do parceiro fica no servidor: o navegador consome apenas o endpoint
// same-origin `/api/waze-feed` (ver shared/wazeFeed.js), que já devolve o
// payload enxuto com `jams`, `alerts` e `irregularities`.
//
// Sem `WAZE_FEED_URL` no servidor o endpoint responde 503 MISSING_CONFIG e a
// interface entra no estado "aguardando credenciais" — nenhum número é estimado.

import {
  CONGESTION_MIN_LEVEL,
  LEVEL_BUCKETS,
  aggregateAlerts,
  aggregateTraffic,
  normalizeAlerts,
  normalizeJams,
} from '../../shared/domain/waze.js'

export { CONGESTION_MIN_LEVEL, LEVEL_BUCKETS, aggregateAlerts, aggregateTraffic }

const REQUEST_TIMEOUT_MS = 30000

export const MISSING_CONFIG = 'MISSING_CONFIG'

export const FEED_ENDPOINT = '/api/waze-feed'

// Os buckets de nível, a taxonomia de alertas, a normalização e as agregações
// puras vivem em shared/domain/waze.js, compartilhados com o coletor do
// histórico. Aqui ficam apenas o transporte e o tratamento de configuração.

function configError(missing) {
  const error = new Error(
    `Waze for Cities: credenciais ausentes (${missing.join(', ')}). Configure o .env para habilitar o painel.`,
  )
  error.code = MISSING_CONFIG
  return error
}

// A configuração (URL/token) vive apenas no servidor: o cliente nunca a vê.

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

  return {
    jams: normalizeJams(payload?.jams),
    alerts: normalizeAlerts(payload?.alerts),
    generatedAt: payload?.generatedAt || null,
    feedEndMillis: payload?.feedEndMillis ?? null,
    stale: Boolean(payload?.stale),
  }
}
