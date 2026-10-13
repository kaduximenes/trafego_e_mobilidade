// Integração com a API Dataprom/Antares — estado dos controladores semafóricos.
//
// A normalização e a agregação puras vivem em shared/domain/semaforos.js, para
// que o coletor do histórico (servidor) produza exatamente os mesmos números da
// UI. Aqui fica só o transporte: a API não envia cabeçalhos CORS, então em dev
// usamos o proxy do Vite (ver vite.config.js). Em produção aponte
// VITE_ANTARES_BASE_URL para um proxy/gateway próprio caso o front seja servido
// de outra origem.

import {
  CONTROLLER_GROUPS,
  FAULT_FLAGS,
  aggregateControllers,
  normalizeControllers,
} from '../../shared/domain/semaforos.js'

export { CONTROLLER_GROUPS, FAULT_FLAGS, aggregateControllers }

const ESTADO_PATH = '/antares/restful/integracao/v1/controlador/estado'
const REQUEST_TIMEOUT_MS = 30000

function resolveBaseUrl() {
  const configured = import.meta.env.VITE_ANTARES_BASE_URL
  if (configured) return configured
  // Sempre via proxy same-origin: em dev o Vite (vite.config.js) e em produção
  // o servidor Express (server/index.js). Nunca chamar o host externo direto —
  // ele não envia CORS e o navegador bloqueia a requisição.
  return '/api/antares'
}

async function request(url, options = {}) {
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)

  try {
    return await fetch(url, { ...options, signal: controller.signal })
  } catch (err) {
    if (err?.name === 'AbortError') {
      throw new Error('Tempo limite excedido ao consultar a API Antares.')
    }
    throw err
  } finally {
    clearTimeout(timeoutId)
  }
}

export async function fetchControllerStatus() {
  const response = await request(`${resolveBaseUrl()}${ESTADO_PATH}`, {
    method: 'GET',
    headers: { Accept: 'application/json' },
  })

  if (!response.ok) {
    if (response.status === 401 || response.status === 403) {
      throw new Error('API-Key inválida ou sem permissão na API Antares.')
    }
    throw new Error(`Falha ao buscar controladores semafóricos (${response.status}).`)
  }

  const payload = await response.json()
  return normalizeControllers(payload)
}
