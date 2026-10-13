// Testes da fatia 1 do histórico: domínio puro, coletor, store e rotas.
//
// Roda com o test runner do Node (sem dependências extras):
//   npm test
//
// O coletor é exercitado com `fetch` substituído por respostas fixas, o que
// permite validar normalização + agregação de ponta a ponta sem tocar as APIs.

import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { after, before, beforeEach, describe, it } from 'node:test'

import { aggregateEvents, normalizeEvents, severityKeyOf } from '../domain/eventos.js'
import { aggregateControllers, normalizeControllers } from '../domain/semaforos.js'
import {
  CAMERA_STATUS,
  UNAVAILABLE_CAMERA_STATUSES,
  cameraAvailabilityPct,
  countCameraStatuses,
  normalizeCameras,
} from '../domain/cameras.js'
import { aggregateTraffic, normalizeAlerts, normalizeJams } from '../domain/waze.js'
import { resolveEventType } from '../domain/eventTypeMap.js'
import { collectAll, collectOccurrences, collectTrafficLights } from './collector.js'
import { createFileStore } from './metricStore.js'
import { createHistoryHandlers, isCollectAuthorized } from './routes.js'

// ------------------------------------------------------------------ domínio --

describe('domínio: ocorrências', () => {
  it('classifica severidade desconhecida como medium', () => {
    assert.equal(severityKeyOf({ severity: 'high' }), 'high')
    assert.equal(severityKeyOf({ severity: 'inexistente' }), 'medium')
    assert.equal(severityKeyOf({}), 'medium')
  })

  it('normaliza e agrega ocorrências da API', () => {
    const events = normalizeEvents({
      openedEvents: [
        {
          EventId: 'A1',
          AgencyEventTypeCode: 'POP27',
          CreatedDate: '2026-08-01T10:00:00Z',
          Latitude: -22.9,
          Longitude: -43.2,
          Location: 'Av. Brasil',
        },
        { EventId: 'A2', AgencyEventTypeCode: 'POP23', CreatedDate: '2026-08-01T11:00:00Z' },
        { EventId: 'A3', AgencyEventTypeCode: 'POP33', CreatedDate: '2026-08-01T12:00:00Z' },
      ],
    })

    assert.equal(events.length, 3)
    // Ordenado do mais recente para o mais antigo.
    assert.equal(events[0].id, 'A3')

    const aggregated = aggregateEvents(events)
    // POP27 (Alagamento) e POP33 são high; POP23 (Obra) é low.
    assert.equal(aggregated.severityCounts.high.count, 2)
    assert.equal(aggregated.severityCounts.low.count, 1)
    assert.equal(aggregated.feed.length, 3)
  })

  it('trata código de tipo desconhecido sem quebrar', () => {
    const unknown = resolveEventType('POP52')
    assert.equal(unknown.severity, 'medium')
    assert.equal(unknown.code, 'POP52')
  })
})

describe('domínio: semáforos', () => {
  it('calcula disponibilidade, status e grupos', () => {
    const controllers = normalizeControllers([
      { controlador: 'C1', estado: 'OK' },
      { controlador: 'C2', estado: 'OK' },
      { controlador: 'C3', estado: 'Sem comunicação' },
      { controlador: 'C4', estado: 'Piscante', piscante: true, lampadaQueimada: true },
    ])

    const summary = aggregateControllers(controllers)
    assert.equal(summary.total, 4)
    assert.equal(summary.offline, 1)
    assert.equal(summary.online, 3)
    assert.equal(summary.normalCount, 2)
    assert.equal(summary.operationalPct, 75)
    // Faixas: >=95 ok, >=80 warn, abaixo disso danger.
    assert.equal(summary.status, 'danger')
    assert.equal(summary.topFailures.find((f) => f.key === 'lampadaQueimada').value, 1)
    // O controlador saudável nunca entra no feed de falhas.
    assert.ok(summary.failures.every((controller) => controller.groupKey !== 'normal'))
  })

  it('classifica as faixas de disponibilidade', () => {
    const almost = normalizeControllers(
      Array.from({ length: 10 }, (_, index) => ({
        controlador: `C${index}`,
        estado: index === 0 ? 'Sem comunicação' : 'OK',
      })),
    )
    assert.equal(aggregateControllers(almost).operationalPct, 90)
    assert.equal(aggregateControllers(almost).status, 'warn')

    const perfect = normalizeControllers([{ controlador: 'C1', estado: 'OK' }])
    assert.equal(aggregateControllers(perfect).status, 'ok')
  })

  it('trata lista vazia sem divisão por zero', () => {
    const summary = aggregateControllers([])
    assert.equal(summary.total, 0)
    assert.equal(summary.operationalPct, 0)
    assert.equal(summary.status, 'danger')
    assert.deepEqual(summary.distribution, [])
  })
})

describe('domínio: câmeras', () => {
  it('deduplica por código preferindo o stream html', () => {
    const cameras = normalizeCameras([
      { code: 'C1', name: 'A', CameraStatus: '0', stream_type: 'raw' },
      { code: 'C1', name: 'A', CameraStatus: '0', stream_type: 'html' },
      { code: 'C2', name: 'B', CameraStatus: 'A' },
      { code: 'C3', name: 'C', CameraStatus: '3' },
    ])

    assert.equal(cameras.length, 3)
    assert.equal(cameras[0].streamType, 'html')

    const counts = countCameraStatuses(cameras)
    assert.equal(counts.total, 3)
    assert.equal(counts['0'], 1)
    assert.equal(counts.A, 1)
    assert.ok(Math.abs(cameraAvailabilityPct(counts) - 33.333) < 0.01)
    assert.deepEqual(UNAVAILABLE_CAMERA_STATUSES, ['1', '3', '5', 'A'])
    assert.equal(CAMERA_STATUS['5'].key, 'intermittent')
  })

  it('devolve null quando não há câmeras', () => {
    assert.equal(cameraAvailabilityPct({ total: 0 }), null)
  })
})

describe('domínio: waze', () => {
  it('soma km congestionados apenas do nível 3 para cima', () => {
    const jams = normalizeJams([
      { uuid: 'j1', level: 4, length: 4000, speedKMH: 10, delay: 60, street: 'A', line: [{ lat: -22.9, lon: -43.2 }] },
      { uuid: 'j2', level: 3, length: 1000, speedKMH: 20, delay: 30, street: 'B' },
      { uuid: 'j3', level: 1, length: 5000, speedKMH: 60, delay: 0, street: 'C' },
    ])

    const traffic = aggregateTraffic(jams)
    assert.equal(traffic.jamCount, 3)
    assert.equal(traffic.totalKm, 10)
    assert.equal(traffic.congestionKm, 5)
    assert.equal(traffic.avgCongestedSpeedKmh, 15)
    // Coordenadas ausentes viram lista vazia, não erro.
    assert.deepEqual(jams[1].coordinates, [])
  })

  it('descarta alertas de baixa confiabilidade', () => {
    const alerts = normalizeAlerts([
      { uuid: 'a1', type: 'ACCIDENT', reliability: 8 },
      { uuid: 'a2', type: 'ACCIDENT', reliability: 2 },
    ])
    assert.equal(alerts.length, 1)
    assert.equal(alerts[0].groupKey, 'accident')
    assert.equal(alerts[0].severity, 'high')
  })
})

// ------------------------------------------------------------------ coletor --

function stubFetch(routes) {
  return async (url, options = {}) => {
    const target = String(url)
    const entry = Object.entries(routes).find(([fragment]) => target.includes(fragment))
    if (!entry) throw new Error(`fetch não previsto no teste: ${target}`)
    const handler = entry[1]
    const result = typeof handler === 'function' ? handler(options) : handler
    const status = result.status || 200
    return {
      ok: status < 400,
      status,
      statusText: status === 401 ? 'Unauthorized' : 'OK',
      text: async () => JSON.stringify(result.body ?? {}),
      json: async () => result.body ?? {},
    }
  }
}

const COLLECT_ENV = {
  CORIO_EVENTS_USERNAME: 'u',
  CORIO_EVENTS_PASSWORD: 'p',
  WAZE_FEED_URL: 'https://waze.test/feed',
  ANTARES_API_KEY: 'k',
  TIXXI_TARGET: 'http://tixxi.test',
  TIXXI_API_KEY: 'k',
  TIXXI_EMAIL: 'e',
  TIXXI_PASSWORD: 'p',
}

const FULL_ROUTES = {
  '/Login': { body: { AccessToken: 'token-1' } },
  '/OpenedEvents': {
    body: {
      openedEvents: [
        { EventId: 'A1', AgencyEventTypeCode: 'POP27', CreatedDate: '2026-08-01T10:00:00Z' },
        { EventId: 'A2', AgencyEventTypeCode: 'POP23', CreatedDate: '2026-08-01T11:00:00Z' },
      ],
    },
  },
  'controlador/estado': {
    body: [
      { controlador: 'C1', estado: 'OK' },
      { controlador: 'C2', estado: 'Sem comunicação' },
    ],
  },
  '/api/auth/login': { body: { success: true, access_token: 'tt' } },
  '/api/cameras': {
    body: { cameras: [{ code: 'C1', CameraStatus: '0' }, { code: 'C2', CameraStatus: 'A' }] },
  },
  'waze.test/feed': {
    body: {
      jams: [{ uuid: 'j1', level: 4, length: 3000, speedKMH: 12, delay: 40, street: 'Av. Brasil', city: 'Rio de Janeiro' }],
      alerts: [{ uuid: 'a1', type: 'ACCIDENT', reliability: 9, city: 'Rio de Janeiro' }],
    },
  },
}

describe('coletor', () => {
  let originalFetch

  beforeEach(() => {
    originalFetch = globalThis.fetch
  })

  after(() => {
    globalThis.fetch = originalFetch
  })

  it('coleta as quatro fontes e reduz a métricas compactas', async () => {
    globalThis.fetch = stubFetch(FULL_ROUTES)

    const result = await collectAll(COLLECT_ENV, { now: new Date('2026-08-01T12:00:00Z') })

    assert.equal(result.ok, true)
    assert.deepEqual(result.failed, [])
    assert.equal(result.collectedAt, '2026-08-01T12:00:00.000Z')
    assert.equal(result.samples.length, 4)

    const bySource = Object.fromEntries(result.samples.map((s) => [s.source, s]))

    assert.equal(bySource.ocorrencias.metrics.total, 2)
    assert.equal(bySource.ocorrencias.metrics.severity.high, 1)
    assert.equal(bySource.ocorrencias.metrics.severity.low, 1)

    assert.equal(bySource.waze.metrics.jamCount, 1)
    assert.equal(bySource.waze.metrics.congestionKm, 3)
    assert.equal(bySource.waze.metrics.alertCount, 1)

    assert.equal(bySource.semaforos.metrics.total, 2)
    assert.equal(bySource.semaforos.metrics.online, 1)
    assert.equal(bySource.semaforos.metrics.operationalPct, 50)

    assert.equal(bySource.cameras.metrics.total, 2)
    assert.equal(bySource.cameras.metrics.unavailable, 1)
    assert.equal(bySource.cameras.metrics.availabilityPct, 50)
  })

  it('isola falha de uma fonte sem derrubar as demais', async () => {
    // A Tixxi vive em rede interna: fora dela a coleta deve falhar sozinha.
    globalThis.fetch = stubFetch({ ...FULL_ROUTES, '/api/cameras': { status: 500, body: {} } })

    const result = await collectAll(COLLECT_ENV)

    assert.equal(result.ok, false)
    assert.deepEqual(result.failed, ['cameras'])

    const cameras = result.samples.find((s) => s.source === 'cameras')
    assert.equal(cameras.ok, false)
    assert.match(cameras.error, /500/)

    // As outras três continuam com métricas válidas.
    assert.equal(result.samples.filter((s) => s.ok).length, 3)
    assert.equal(result.samples.find((s) => s.source === 'ocorrencias').metrics.total, 2)
  })

  it('propaga erro de credencial da Tixxi', async () => {
    globalThis.fetch = stubFetch({
      ...FULL_ROUTES,
      '/api/auth/login': { body: { success: false } },
    })
    await assert.rejects(() => collectAll({
      ...COLLECT_ENV,
      CORIO_EVENTS_USERNAME: 'u',
    }).then((r) => {
      const cameras = r.samples.find((s) => s.source === 'cameras')
      if (!cameras.ok) throw new Error(cameras.error)
    }), /autenticação/)
  })

  it('erro HTTP do COR vira falha isolada', async () => {
    globalThis.fetch = stubFetch({ ...FULL_ROUTES, '/OpenedEvents': { status: 401, body: { Message: 'Invalid token' } } })
    const result = await collectAll(COLLECT_ENV)
    const ocorrencias = result.samples.find((s) => s.source === 'ocorrencias')
    assert.equal(ocorrencias.ok, false)
    assert.match(ocorrencias.error, /Invalid token/)
  })

  it('expõe os coletores individuais', async () => {
    globalThis.fetch = stubFetch(FULL_ROUTES)
    const occurrences = await collectOccurrences(COLLECT_ENV)
    assert.equal(occurrences.geolocated, 0)

    const trafficLights = await collectTrafficLights(COLLECT_ENV)
    assert.equal(trafficLights.normalCount, 1)
  })
})

// -------------------------------------------------------------------- store --

describe('store de arquivo (desenvolvimento)', () => {
  let dir

  before(async () => {
    dir = await fs.mkdtemp(path.join(os.tmpdir(), 'cor-history-'))
  })

  after(async () => {
    await fs.rm(dir, { recursive: true, force: true })
  })

  it('grava e lê de volta filtrando por fonte e intervalo', async () => {
    const store = createFileStore(dir)
    await store.ensureSchema()

    await store.insertSamples('2026-08-01T10:00:00.000Z', [
      { source: 'ocorrencias', ok: true, error: null, metrics: { total: 10 } },
      { source: 'waze', ok: true, error: null, metrics: { jamCount: 2 } },
    ])
    await store.insertSamples('2026-08-01T11:00:00.000Z', [
      { source: 'ocorrencias', ok: false, error: 'falha', metrics: {} },
    ])

    const all = await store.queryRange({
      from: '2026-08-01T00:00:00.000Z',
      to: '2026-08-01T23:59:59.000Z',
    })
    assert.equal(all.length, 3)

    const onlyOccurrences = await store.queryRange({
      from: '2026-08-01T00:00:00.000Z',
      to: '2026-08-01T23:59:59.000Z',
      source: 'ocorrencias',
    })
    assert.equal(onlyOccurrences.length, 2)
    assert.equal(onlyOccurrences[1].ok, false)
    assert.deepEqual(onlyOccurrences[0].metrics, { total: 10 })

    const narrow = await store.queryRange({
      from: '2026-08-01T09:00:00.000Z',
      to: '2026-08-01T10:30:00.000Z',
    })
    assert.equal(narrow.length, 2)
  })

  it('respeita o limite e a ordem cronológica', async () => {
    const store = createFileStore(dir)
    await store.ensureSchema()
    const rows = await store.queryRange({
      from: '2026-08-01T00:00:00.000Z',
      to: '2026-08-01T23:59:59.000Z',
      limit: 1,
    })
    assert.equal(rows.length, 1)
    assert.equal(rows[0].collectedAt, '2026-08-01T10:00:00.000Z')
  })
})

// -------------------------------------------------------------------- rotas --

function createRes() {
  return {
    statusCode: 200,
    headers: {},
    body: null,
    setHeader(name, value) {
      this.headers[name.toLowerCase()] = value
    },
    end(chunk) {
      this.body = chunk ? JSON.parse(chunk) : null
    },
  }
}

describe('rotas do histórico', () => {
  let dir
  let env

  before(async () => {
    dir = await fs.mkdtemp(path.join(os.tmpdir(), 'cor-routes-'))
    env = { ...COLLECT_ENV, COLLECT_SECRET: 'segredo', HISTORY_DIR: dir }
  })

  after(async () => {
    await fs.rm(dir, { recursive: true, force: true })
  })

  it('recusa coleta sem segredo válido', () => {
    assert.equal(isCollectAuthorized({ headers: {} }, env), false)
    assert.equal(isCollectAuthorized({ headers: { 'x-collect-secret': 'errado' } }, env), false)
    assert.equal(isCollectAuthorized({ headers: { 'x-collect-secret': 'segredo' } }, env), true)
    assert.equal(isCollectAuthorized({ headers: { authorization: 'Bearer segredo' } }, env), true)
  })

  it('responde 503 quando COLLECT_SECRET não está configurado', async () => {
    const handlers = createHistoryHandlers({ ...env, COLLECT_SECRET: '' })
    const res = createRes()
    await handlers.collect({ headers: {} }, res)
    assert.equal(res.statusCode, 503)
    assert.match(res.body.error, /COLLECT_SECRET/)
  })

  it('responde 401 sem segredo e grava quando autorizado', async () => {
    globalThis.fetch = stubFetch(FULL_ROUTES)
    const handlers = createHistoryHandlers(env)

    const unauthorized = createRes()
    await handlers.collect({ headers: {} }, unauthorized)
    assert.equal(unauthorized.statusCode, 401)

    const authorized = createRes()
    await handlers.collect({ headers: { 'x-collect-secret': 'segredo' } }, authorized)
    assert.equal(authorized.statusCode, 200)
    assert.equal(authorized.body.inserted, 4)
    assert.equal(authorized.body.ok, true)
    assert.equal(authorized.body.driver, 'file')
  })

  it('lê as métricas gravadas pelo endpoint', async () => {
    const handlers = createHistoryHandlers(env)
    const res = createRes()
    await handlers.metrics({ url: '/api/metrics?source=ocorrencias' }, res)

    assert.equal(res.statusCode, 200)
    assert.equal(res.body.source, 'ocorrencias')
    assert.equal(res.body.count, 1)
    assert.equal(res.body.samples[0].metrics.total, 2)
  })

  it('ignora fonte desconhecida e limita a janela máxima', async () => {
    const handlers = createHistoryHandlers(env)
    const res = createRes()
    await handlers.metrics(
      { url: '/api/metrics?source=inventado&from=2000-01-01T00:00:00Z&to=2026-08-01T00:00:00Z' },
      res,
    )

    assert.equal(res.body.source, null)
    const spanHours = (new Date(res.body.to) - new Date(res.body.from)) / 3600000
    assert.ok(spanHours <= 24 * 31 + 1)
  })

  it('devolve amostras vazias para janela sem dados', async () => {
    const handlers = createHistoryHandlers(env)
    const res = createRes()
    await handlers.metrics(
      { url: '/api/metrics?from=2020-01-01T00:00:00Z&to=2020-01-02T00:00:00Z' },
      res,
    )
    assert.equal(res.body.count, 0)
    assert.deepEqual(res.body.samples, [])
  })
})
