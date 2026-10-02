// Integração com a API Dataprom/Antares — estado dos controladores semafóricos.
// A API não envia cabeçalhos CORS, então em dev usamos o proxy do Vite
// (ver vite.config.js). Em produção aponte VITE_ANTARES_BASE_URL para um
// proxy/gateway próprio caso o front seja servido de outra origem.

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

// Grupos exibidos no dashboard, na ordem de exibição.
export const CONTROLLER_GROUPS = [
  { key: 'normal', label: 'Em Operação / Normal', color: '#10B981' },
  { key: 'flashing', label: 'Amarelo Intermitente', color: '#F59E0B' },
  { key: 'alarm', label: 'Com Alarmes', color: '#8B5CF6' },
  { key: 'offline', label: 'Desligado / Sem Comunicação', color: '#EF4444' },
  { key: 'maintenance', label: 'Manutenção / Modo Operador', color: '#3B82F6' },
  { key: 'unknown', label: 'Estado não identificado', color: '#64748B' },
]

const GROUP_BY_ESTADO = {
  OK: 'normal',
  Piscante: 'flashing',
  'Piscante por Alarme': 'flashing',
  'Sem comunicação': 'offline',
  Apagado: 'offline',
  'Modo Operador': 'maintenance',
  'Com alarmes': 'alarm',
}

// Ordem de criticidade para o feed de falhas (menor = mais grave).
const GROUP_SEVERITY = { offline: 0, alarm: 1, unknown: 1, flashing: 2, maintenance: 3, normal: 9 }

// Flags de falha relevantes para o painel "Principais Falhas Detectadas".
// Flags puramente informativas (login, reset, gravação local) ficam de fora.
export const FAULT_FLAGS = [
  { key: 'semComunicacao', label: 'Sem comunicação', severity: 'danger' },
  { key: 'apagado', label: 'Apagado', severity: 'danger' },
  { key: 'queimaTotalVermelho', label: 'Queima total do vermelho', severity: 'danger' },
  { key: 'contactorAbertoHardware', label: 'Contator aberto (hardware)', severity: 'danger' },
  { key: 'contactorAbertoCh2', label: 'Contator aberto (canal 2)', severity: 'danger' },
  { key: 'erroComunicacao', label: 'Erro de comunicação', severity: 'danger' },
  { key: 'erroTabela', label: 'Erro de tabela', severity: 'danger' },
  { key: 'erroMemoriaRam', label: 'Erro de memória RAM', severity: 'danger' },
  { key: 'erroMemoriaXicor', label: 'Erro de memória Xicor', severity: 'danger' },
  { key: 'acessoIncorreto', label: 'Acesso incorreto', severity: 'danger' },
  { key: 'detectorAvariado', label: 'Detector avariado', severity: 'warn' },
  { key: 'detectorSuspeito', label: 'Detector suspeito', severity: 'warn' },
  { key: 'lampadaQueimada', label: 'Lâmpada queimada', severity: 'warn' },
  { key: 'grupoAvariado', label: 'Grupo avariado', severity: 'warn' },
  { key: 'portaAberta', label: 'Porta aberta', severity: 'warn' },
  { key: 'temAlarme', label: 'Alarme ativo', severity: 'warn' },
  { key: 'piscante', label: 'Piscante', severity: 'warn' },
]

function asArray(value) {
  if (Array.isArray(value)) return value
  if (value && typeof value === 'object') {
    for (const candidate of [value.data, value.content, value.items, value.controladores, value.result]) {
      if (Array.isArray(candidate)) return candidate
    }
  }
  return []
}

function toNumber(raw) {
  const value = Number(raw)
  return Number.isFinite(value) ? value : null
}

function normalizeLastCommunication(raw) {
  if (!raw) return null
  const parsed = new Date(raw)
  return Number.isNaN(parsed.getTime()) ? null : parsed.getTime()
}

export function normalizeController(raw = {}) {
  const estado = String(raw.estado ?? '').trim() || 'Estado não identificado'
  const id = String(raw.controlador ?? raw.codigoExterno ?? '').trim()

  // O estado textual é a fonte primária; as flags cobrem valores novos/desconhecidos.
  let groupKey = GROUP_BY_ESTADO[estado]
  if (!groupKey) {
    if (raw.semComunicacao === true || raw.apagado === true) groupKey = 'offline'
    else if (raw.piscante === true) groupKey = 'flashing'
    else if (raw.temAlarme === true) groupKey = 'alarm'
    else groupKey = 'unknown'
  }

  const group = CONTROLLER_GROUPS.find((item) => item.key === groupKey) || CONTROLLER_GROUPS.at(-1)

  return {
    id: id || `controlador-${Math.random().toString(36).slice(2, 8)}`,
    externalCode: raw.codigoExterno ? String(raw.codigoExterno) : null,
    estado,
    groupKey,
    groupLabel: group.label,
    groupColor: group.color,
    latitude: toNumber(raw.latitude),
    longitude: toNumber(raw.longitude),
    lastCommunication: normalizeLastCommunication(raw.ultimaComunicacao),
    flags: FAULT_FLAGS.filter((flag) => raw[flag.key] === true).map((flag) => ({
      key: flag.key,
      label: flag.label,
      severity: flag.severity,
    })),
  }
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
  // Em desenvolvimento o proxy do Vite exige a API-Key vinda do cliente.
  // Em produção a chave é injetada pelo servidor (server/index.js), portanto
  // o cliente não a referencia e ela não entra no bundle.
  const apiKey = import.meta.env.DEV ? import.meta.env.VITE_ANTARES_API_KEY : ''

  const response = await request(`${resolveBaseUrl()}${ESTADO_PATH}`, {
    method: 'GET',
    headers: {
      Accept: 'application/json',
      ...(apiKey ? { 'API-Key': apiKey } : {}),
    },
  })

  if (!response.ok) {
    if (response.status === 401 || response.status === 403) {
      throw new Error('API-Key inválida ou sem permissão na API Antares.')
    }
    throw new Error(`Falha ao buscar controladores semafóricos (${response.status}).`)
  }

  const payload = await response.json()
  return asArray(payload).map(normalizeController)
}

const FEED_LIMIT = 80
const FEED_QUOTA_PER_GROUP = 20

// O grupo "sem comunicação" concentra centenas de controladores e, sem cota,
// dominaria todo o feed — escondendo alarmes, piscantes e modo operador.
// Garante representação dos grupos mais leves antes das vagas restantes.
function selectFailureFeed(controllers) {
  const failures = controllers.filter((controller) => controller.groupKey !== 'normal')

  const bySeverity = (a, b) =>
    (GROUP_SEVERITY[a.groupKey] ?? 5) - (GROUP_SEVERITY[b.groupKey] ?? 5) ||
    (b.lastCommunication ?? 0) - (a.lastCommunication ?? 0)

  const perGroup = new Map()
  const selected = []
  const overflow = []

  for (const controller of [...failures].sort(bySeverity)) {
    const used = perGroup.get(controller.groupKey) || 0
    if (used < FEED_QUOTA_PER_GROUP) {
      perGroup.set(controller.groupKey, used + 1)
      selected.push(controller)
    } else {
      overflow.push(controller)
    }
  }

  if (selected.length >= FEED_LIMIT) return selected.slice(0, FEED_LIMIT)

  return [...selected, ...overflow.sort(bySeverity)].slice(0, FEED_LIMIT)
}

export function aggregateControllers(controllers = []) {
  const normalized = Array.isArray(controllers) ? controllers : []
  const total = normalized.length

  const counts = new Map(CONTROLLER_GROUPS.map((group) => [group.key, 0]))
  const flagCounts = new Map(FAULT_FLAGS.map((flag) => [flag.key, 0]))

  for (const controller of normalized) {
    counts.set(controller.groupKey, (counts.get(controller.groupKey) || 0) + 1)
    for (const flag of controller.flags) {
      flagCounts.set(flag.key, (flagCounts.get(flag.key) || 0) + 1)
    }
  }

  const distribution = CONTROLLER_GROUPS.filter((group) => (counts.get(group.key) || 0) > 0).map(
    (group) => {
      const value = counts.get(group.key) || 0
      return {
        key: group.key,
        label: group.label,
        value,
        pct: total ? (value / total) * 100 : 0,
        color: group.color,
      }
    },
  )

  const offline = counts.get('offline') || 0
  const online = total - offline
  const operationalPct = total ? (online / total) * 100 : 0

  const status = operationalPct >= 95 ? 'ok' : operationalPct >= 80 ? 'warn' : 'danger'

  const topFailures = FAULT_FLAGS.map((flag) => ({
    key: flag.key,
    label: flag.label,
    severity: flag.severity,
    value: flagCounts.get(flag.key) || 0,
    pct: total ? ((flagCounts.get(flag.key) || 0) / total) * 100 : 0,
  }))
    .filter((flag) => flag.value > 0)
    .sort((a, b) => b.value - a.value)

  const failures = selectFailureFeed(normalized)

  return {
    total,
    online,
    offline,
    normalCount: counts.get('normal') || 0,
    operationalPct,
    status,
    distribution,
    topFailures,
    failures,
  }
}
