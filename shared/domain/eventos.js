// Domínio das ocorrências do COR (API Hexagon): normalização e agregação puras.
//
// Vive em shared/ para que o navegador e o coletor do histórico produzam
// exatamente os mesmos números — não há segunda implementação das regras.
// Autenticação e transporte (localStorage, fetch, proxy) ficam no cliente.

import { resolveEventType } from './eventTypeMap.js'

const severityPalette = {
  high: { key: 'high', label: 'Alta', color: '#EF4444' },
  medium: { key: 'medium', label: 'Média', color: '#F59E0B' },
  low: { key: 'low', label: 'Baixa', color: '#3B82F6' },
}

// Regra única de severidade: a API pode enviar valores fora do trio conhecido,
// que passam a contar como 'medium'. Exportada para que filtros da UI usem
// exatamente a mesma classificação dos contadores.
export function severityKeyOf(event) {
  return severityPalette[event?.severity] ? event.severity : 'medium'
}

function getNestedValue(data, keys) {
  for (const key of keys) {
    const value = data?.[key]
    if (value !== undefined && value !== null && value !== '') return value
  }
  return undefined
}

export function asArray(value) {
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
export function normalizeEvent(raw = {}) {
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

export function normalizeEvents(payload) {
  return asArray(payload)
    .map(normalizeEvent)
    .sort((a, b) => b.timestamp - a.timestamp)
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
    const severityKey = severityKeyOf(event)
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
