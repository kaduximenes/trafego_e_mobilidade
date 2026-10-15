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
import { buildFramePayload, occurrencesFrame, wazeFrame, trafficLightsFrame, camerasFrame } from './collector.js'
import { entityStatesOf, occurrenceRecords } from './collector.js'
import { createFileStore, diffEntities, pickFrameAt, getRetentionConfig, retentionCutoff } from './metricStore.js'
import { createHistoryHandlers, isCollectAuthorized, startBackgroundCollector } from './routes.js'
import { resetUpstreamSessions } from '../upstreamSession.js'

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
    // A sessão do upstream é única e fica em cache: sem limpar, um teste
    // herdaria o token do anterior e não exercitaria o login.
    resetUpstreamSessions()
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
    // Uma falha da API de câmeras não deve interromper as outras fontes.
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

// ------------------------------------------------------------------- frames --

describe('seleção do frame aplicável', () => {
  const frames = [
    { collectedAt: '2026-08-01T10:00:00.000Z', payload: { n: 1 } },
    { collectedAt: '2026-08-01T10:15:00.000Z', payload: { n: 2 } },
    { collectedAt: '2026-08-01T10:30:00.000Z', payload: { n: 3 } },
  ]

  it('devolve o frame em ou antes do instante e o próximo', () => {
    const { snapshot, next } = pickFrameAt(frames, '2026-08-01T10:20:00.000Z')
    assert.equal(snapshot.payload.n, 2)
    assert.equal(next.payload.n, 3)
  })

  it('devolve o próprio frame quando o instante coincide', () => {
    const { snapshot, next } = pickFrameAt(frames, '2026-08-01T10:15:00.000Z')
    assert.equal(snapshot.payload.n, 2)
    assert.equal(next.payload.n, 3)
  })

  it('devolve snapshot nulo antes do primeiro frame', () => {
    const { snapshot, next } = pickFrameAt(frames, '2026-08-01T09:00:00.000Z')
    assert.equal(snapshot, null)
    assert.equal(next.payload.n, 1)
  })

  it('devolve next nulo depois do último frame', () => {
    const { snapshot, next } = pickFrameAt(frames, '2026-08-01T11:00:00.000Z')
    assert.equal(snapshot.payload.n, 3)
    assert.equal(next, null)
  })

  it('lida com lista vazia e data inválida', () => {
    assert.deepEqual(pickFrameAt([], '2026-08-01T10:00:00.000Z'), { snapshot: null, next: null })
    assert.deepEqual(pickFrameAt(frames, 'nao-e-data'), { snapshot: null, next: null })
  })
})

describe('store de arquivo: frames', () => {
  let dir

  before(async () => {
    dir = await fs.mkdtemp(path.join(os.tmpdir(), 'cor-frames-'))
  })

  after(async () => {
    await fs.rm(dir, { recursive: true, force: true })
  })

  it('grava frames e busca o aplicável a um instante', async () => {
    const store = createFileStore(dir)
    await store.ensureSchema()

    await store.insertFrame({
      collectedAt: '2026-08-02T10:00:00.000Z',
      payload: { occurrences: [{ id: 'A1' }] },
      sourcesOk: ['ocorrencias'],
      sourcesFailed: ['cameras'],
    })
    await store.insertFrame({
      collectedAt: '2026-08-02T10:15:00.000Z',
      payload: { occurrences: [{ id: 'A1' }, { id: 'A2' }] },
      sourcesOk: ['ocorrencias', 'cameras'],
      sourcesFailed: [],
    })

    const { snapshot, next } = await store.getFrameAt('2026-08-02T10:10:00.000Z')
    assert.equal(snapshot.collectedAt, '2026-08-02T10:00:00.000Z')
    assert.equal(snapshot.payload.occurrences.length, 1)
    assert.deepEqual(snapshot.sourcesFailed, ['cameras'])
    assert.equal(next.collectedAt, '2026-08-02T10:15:00.000Z')
  })

  it('não devolve frame anterior fora da janela de busca', async () => {
    const store = createFileStore(dir)
    await store.ensureSchema()
    // O único frame é de agosto; um pedido de outubro está além da janela de 7 dias.
    const { snapshot } = await store.getFrameAt('2026-10-02T10:10:00.000Z')
    assert.equal(snapshot, null)
  })

  it('lista os instantes disponíveis no intervalo', async () => {
    const store = createFileStore(dir)
    await store.ensureSchema()

    const frames = await store.listFrames({
      from: '2026-08-02T00:00:00.000Z',
      to: '2026-08-02T23:59:59.000Z',
    })
    assert.equal(frames.length, 2)
    assert.equal(frames[0].collectedAt, '2026-08-02T10:00:00.000Z')
    assert.ok(frames[0].payloadBytes > 0)

    const narrow = await store.listFrames({
      from: '2026-08-02T10:10:00.000Z',
      to: '2026-08-02T23:59:59.000Z',
    })
    assert.equal(narrow.length, 1)
  })
})

describe('payload do frame', () => {
  it('monta o frame apenas com o essencial para o mapa', () => {
    const events = [
      {
        id: 'A1',
        type: 'Alagamento',
        typeKey: 'pop27',
        severity: 'high',
        severityColor: '#EF4444',
        severityLabel: 'Alta',
        status: 'Ativo',
        location: 'Av. Brasil',
        timestamp: 1,
        coordinates: { latitude: -22.9, longitude: -43.2 },
      },
      { id: 'A2', type: 'Obra', severity: 'low', location: 'Centro', timestamp: 2 },
    ]

    const frame = occurrencesFrame(events)
    assert.equal(frame.length, 2)
    assert.deepEqual(frame[0].coordinates, [-22.9, -43.2])
    // Ocorrência sem coordenadas continua no frame, mas sem o campo.
    assert.equal('coordinates' in frame[1], false)
  })

  it('inclui só trechos com retenção e alertas com posição', () => {
    const frame = wazeFrame({
      jams: [
        { id: 'j1', street: 'A', level: 4, coordinates: [[-22.9, -43.2], [-22.91, -43.21]], lengthKm: 2, speedKmh: 10, delayS: 60, bucketColor: '#EF4444', bucketLabel: 'Intenso' },
        { id: 'j2', street: 'B', level: 1, coordinates: [[-22.9, -43.2], [-22.92, -43.22]], lengthKm: 5 },
      ],
      alerts: [{ id: 'a1', groupKey: 'accident', label: 'Acidente', severity: 'high', lat: -22.9, lon: -43.2, updatedAt: 1 }],
    })

    assert.equal(frame.jams.length, 1)
    assert.equal(frame.jams[0].id, 'j1')
    assert.equal(frame.alerts.length, 1)
  })

  it('inclui só controladores com falha e coordenadas', () => {
    const frame = trafficLightsFrame([
      { id: 'C1', groupKey: 'offline', latitude: -22.9, longitude: -43.2, flags: [{ label: 'Sem comunicação' }] },
      { id: 'C2', groupKey: 'normal', latitude: -22.9, longitude: -43.2, flags: [] },
      { id: 'C3', groupKey: 'alarm', latitude: null, longitude: null, flags: [] },
    ])

    assert.equal(frame.length, 1)
    assert.equal(frame[0].id, 'C1')
    assert.deepEqual(frame[0].flags, ['Sem comunicação'])
  })

  it('inclui só câmeras indisponíveis e geolocalizadas', () => {
    const frame = camerasFrame([
      { id: 1, code: 'C1', statusRaw: '0', status: { key: 'online' }, latitude: -22.9, longitude: -43.2 },
      { id: 2, code: 'C2', statusRaw: 'A', status: { key: 'maintenance' }, latitude: -22.9, longitude: -43.2 },
      { id: 3, code: 'C3', statusRaw: '3', status: { key: 'offline' }, latitude: null, longitude: null },
    ])

    // A operacional (C1) não entra: são milhares e o mapa não as desenha.
    assert.deepEqual(frame.map((camera) => camera.code), ['C2'])
    assert.equal(frame[0].statusLabel, undefined)
    assert.equal(frame[0].statusKey, 'maintenance')

    // Sem câmeras indisponíveis o frame é vazio, não nulo.
    assert.deepEqual(camerasFrame([]), [])
  })

  it('monta o payload consolidado com fonte faltante vazia', () => {
    const payload = buildFramePayload([
      { source: 'ocorrencias', ok: true, frame: [{ id: 'A1' }] },
      { source: 'waze', ok: true, frame: { jams: [], alerts: [] } },
      { source: 'semaforos', ok: false, frame: null },
      { source: 'cameras', ok: false, frame: null },
    ])

    assert.equal(payload.occurrences.length, 1)
    assert.deepEqual(payload.trafficLights, [])
    assert.deepEqual(payload.cameras, [])
    assert.deepEqual(payload.waze, { jams: [], alerts: [] })
  })
})

// ------------------------------------------------------------- ciclo de vida --

describe('diff de entidades', () => {
  const idOf = (item) => item.id
  const stateOf = (item) => item.state

  it('detecta aberturas, fechamentos e mudanças de estado', () => {
    const previous = [
      { id: 'A', state: 'normal' },
      { id: 'B', state: 'offline' },
      { id: 'C', state: 'alarm' },
    ]
    const current = [
      { id: 'A', state: 'normal' },
      { id: 'B', state: 'flashing' },
      { id: 'D', state: 'offline' },
    ]

    const { opened, closed, changed } = diffEntities({ current, previous, idOf, stateOf })

    assert.deepEqual(opened.map(idOf), ['D'])
    assert.deepEqual(closed.map(idOf), ['C'])
    assert.equal(changed.length, 1)
    assert.equal(changed[0].item.id, 'B')
    assert.equal(changed[0].fromState, 'offline')
    assert.equal(changed[0].toState, 'flashing')
  })

  it('trata listas vazias', () => {
    const empty = diffEntities({ current: [], previous: [], idOf, stateOf })
    assert.deepEqual(empty.opened, [])
    assert.deepEqual(empty.closed, [])
    assert.deepEqual(empty.changed, [])

    const firstRun = diffEntities({ current: [{ id: 'A', state: 'ok' }], previous: [], idOf, stateOf })
    assert.equal(firstRun.opened.length, 1)
    assert.equal(firstRun.changed.length, 0)

    const everythingClosed = diffEntities({ current: [], previous: [{ id: 'A', state: 'ok' }], idOf, stateOf })
    assert.equal(everythingClosed.closed.length, 1)
  })
})

describe('store de arquivo: ciclo de vida', () => {
  let dir

  before(async () => {
    dir = await fs.mkdtemp(path.join(os.tmpdir(), 'cor-lifecycle-'))
  })

  after(async () => {
    await fs.rm(dir, { recursive: true, force: true })
  })

  it('registra abertura, mantém last_seen e fecha por ausência', async () => {
    const store = createFileStore(dir)
    await store.ensureSchema()

    const a = { id: 'A', severity: 'high', typeKey: 'pop27', type: 'Alagamento', location: 'Av. Brasil', coordinates: [-22.9, -43.2] }
    const b = { id: 'B', severity: 'low', typeKey: 'pop23', type: 'Obra', location: 'Centro', coordinates: null }

    await store.syncOccurrences('2026-08-03T10:00:00.000Z', [a, b], [])
    assert.deepEqual((await store.openEventIds()).sort(), ['A', 'B'])

    // Na segunda leitura só A continua aberta.
    await store.syncOccurrences('2026-08-03T10:15:00.000Z', [a], [{ id: 'B' }])
    assert.deepEqual(await store.openEventIds(), ['A'])

    const items = await store.listOccurrences({
      from: '2026-08-03T00:00:00.000Z',
      to: '2026-08-03T23:59:59.000Z',
    })
    const byId = Object.fromEntries(items.map((item) => [item.id, item]))

    assert.equal(byId.A.firstSeen, '2026-08-03T10:00:00.000Z')
    assert.equal(byId.A.lastSeen, '2026-08-03T10:15:00.000Z')
    assert.equal(byId.A.closedAt, null)
    assert.equal(byId.B.closedAt, '2026-08-03T10:15:00.000Z')
    // Duração de B: 15 minutos entre abrir e fechar.
    assert.equal(byId.B.durationMs, 15 * 60 * 1000)
    assert.deepEqual(byId.A.coordinates?.length ?? undefined, undefined)
  })

  it('filtra por situação (aberta/fechada)', async () => {
    const store = createFileStore(dir)
    await store.ensureSchema()

    const open = await store.listOccurrences({
      from: '2026-08-03T00:00:00.000Z',
      to: '2026-08-03T23:59:59.000Z',
      open: true,
    })
    assert.deepEqual(open.map((item) => item.id), ['A'])

    const closed = await store.listOccurrences({
      from: '2026-08-03T00:00:00.000Z',
      to: '2026-08-03T23:59:59.000Z',
      open: false,
    })
    assert.deepEqual(closed.map((item) => item.id), ['B'])
  })

  it('guarda e devolve o estado corrente por entidade', async () => {
    const store = createFileStore(dir)
    await store.ensureSchema()

    await store.setEntityStates(
      'semaforos',
      [{ entityId: 'C1', state: 'normal' }, { entityId: 'C2', state: 'offline' }],
      '2026-08-03T10:00:00.000Z',
    )
    // Uma transição posterior deve prevalecer sobre a anterior.
    await store.setEntityStates('semaforos', [{ entityId: 'C2', state: 'alarm' }], '2026-08-03T10:15:00.000Z')

    const states = await store.getEntityStates('semaforos')
    const byId = Object.fromEntries(states.map((item) => [item.entityId, item.state]))
    assert.equal(byId.C1, 'normal')
    assert.equal(byId.C2, 'alarm')

    // Entidade distinta tem estado independente.
    assert.deepEqual(await store.getEntityStates('cameras'), [])
  })

  it('registra e consulta mudanças de estado', async () => {
    const store = createFileStore(dir)
    await store.ensureSchema()

    await store.insertStateChanges('2026-08-03T10:15:00.000Z', [
      { entity: 'semaforos', entityId: 'C2', fromState: 'offline', toState: 'alarm' },
      { entity: 'cameras', entityId: '7', fromState: 'online', toState: 'offline' },
    ])

    const all = await store.queryStateChanges({
      from: '2026-08-03T00:00:00.000Z',
      to: '2026-08-03T23:59:59.000Z',
    })
    assert.equal(all.length, 2)

    const onlyLights = await store.queryStateChanges({
      from: '2026-08-03T00:00:00.000Z',
      to: '2026-08-03T23:59:59.000Z',
      entity: 'semaforos',
    })
    assert.equal(onlyLights.length, 1)
    assert.equal(onlyLights[0].fromState, 'offline')
    assert.equal(onlyLights[0].toState, 'alarm')
  })
})

// ------------------------------------------------------------------ retenção --

describe('retenção de frames', () => {
  it('usa 90 dias por padrão e desliga com 0 ou negativo', () => {
    assert.deepEqual(getRetentionConfig({}), { days: 90, enabled: true })
    assert.deepEqual(getRetentionConfig({ HISTORY_RETENTION_DAYS: '' }), { days: 90, enabled: true })
    assert.deepEqual(getRetentionConfig({ HISTORY_RETENTION_DAYS: '30' }), { days: 30, enabled: true })
    assert.deepEqual(getRetentionConfig({ HISTORY_RETENTION_DAYS: '0' }), { days: 0, enabled: false })
    assert.deepEqual(getRetentionConfig({ HISTORY_RETENTION_DAYS: '-5' }), { days: -5, enabled: false })
    // Valor não numérico cai no padrão em vez de remover tudo.
    assert.deepEqual(getRetentionConfig({ HISTORY_RETENTION_DAYS: 'abc' }), { days: 90, enabled: true })
  })

  it('calcula o instante de corte', () => {
    const now = new Date('2026-08-31T12:00:00.000Z')
    assert.equal(retentionCutoff({ HISTORY_RETENTION_DAYS: '30' }, now), '2026-08-01T12:00:00.000Z')
    assert.equal(retentionCutoff({}, now), '2026-06-02T12:00:00.000Z')
    assert.equal(retentionCutoff({ HISTORY_RETENTION_DAYS: '0' }, now), null)
  })

  it('remove dias inteiros anteriores ao corte e preserva os recentes', async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'cor-prune-'))
    const store = createFileStore(dir)
    await store.ensureSchema()

    // Três dias de frames: dois vencidos e um dentro da retenção.
    for (const day of ['2026-07-01', '2026-07-02', '2026-08-30']) {
      await store.insertFrame({
        collectedAt: `${day}T10:00:00.000Z`,
        payload: { occurrences: [{ id: day }] },
        sourcesOk: ['ocorrencias'],
        sourcesFailed: [],
      })
    }

    // Corte em 2026-08-01: julho sai, agosto fica.
    const removed = await store.pruneFrames('2026-08-01T00:00:00.000Z')
    assert.equal(removed, 2)

    const remaining = await store.listFrames({
      from: '2026-01-01T00:00:00.000Z',
      to: '2026-12-31T00:00:00.000Z',
    })
    assert.equal(remaining.length, 1)
    assert.equal(remaining[0].collectedAt, '2026-08-30T10:00:00.000Z')

    // Poda repetida não encontra mais nada e não falha.
    assert.equal(await store.pruneFrames('2026-08-01T00:00:00.000Z'), 0)

    await fs.rm(dir, { recursive: true, force: true })
  })

  it('não remove o dia corrente quando o corte cai dentro dele', async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'cor-prune-today-'))
    const store = createFileStore(dir)
    await store.ensureSchema()

    await store.insertFrame({
      collectedAt: '2026-08-15T23:00:00.000Z',
      payload: {},
      sourcesOk: [],
      sourcesFailed: [],
    })

    // Corte no meio do mesmo dia: o arquivo cobre até 23:59:59, então fica.
    assert.equal(await store.pruneFrames('2026-08-15T12:00:00.000Z'), 0)
    assert.equal(
      (await store.listFrames({ from: '2026-08-15T00:00:00.000Z', to: '2026-08-15T23:59:59.999Z' })).length,
      1,
    )

    // Corte no dia seguinte já permite remover.
    assert.equal(await store.pruneFrames('2026-08-16T00:00:00.000Z'), 1)

    await fs.rm(dir, { recursive: true, force: true })
  })

  it('ignora diretório inexistente e corte inválido', async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'cor-prune-empty-'))
    const store = createFileStore(dir)
    assert.equal(await store.pruneFrames('2026-08-01T00:00:00.000Z'), 0)
    assert.equal(await store.pruneFrames('nao-e-data'), 0)
    await fs.rm(dir, { recursive: true, force: true })
  })

  it('não toca nas tabelas analíticas ao podar', async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'cor-prune-keep-'))
    const store = createFileStore(dir)
    await store.ensureSchema()

    const event = { id: 'A1', severity: 'high', typeKey: 'pop27', type: 'Alagamento', location: 'X', coordinates: [-22.9, -43.2] }
    await store.syncOccurrences('2026-07-01T10:00:00.000Z', [event], [])
    await store.insertStateChanges('2026-07-01T10:00:00.000Z', [
      { entity: 'semaforos', entityId: 'C1', fromState: 'normal', toState: 'offline' },
    ])

    await store.pruneFrames('2026-08-01T00:00:00.000Z')

    // As ocorrências e transições sobrevivem: são o valor de longo prazo.
    const occurrences = await store.listOccurrences({
      from: '2026-01-01T00:00:00.000Z',
      to: '2026-12-31T00:00:00.000Z',
    })
    assert.equal(occurrences.length, 1)
    const changes = await store.queryStateChanges({
      from: '2026-01-01T00:00:00.000Z',
      to: '2026-12-31T00:00:00.000Z',
    })
    assert.equal(changes.length, 1)

    await fs.rm(dir, { recursive: true, force: true })
  })
})

describe('coletor: dados para as tabelas derivadas', () => {
  it('extrai o estado observado por entidade', () => {
    assert.deepEqual(
      entityStatesOf('semaforos', [{ id: 'C1', groupKey: 'normal' }, { id: 'C2', groupKey: 'offline' }]),
      [{ entityId: 'C1', state: 'normal' }, { entityId: 'C2', state: 'offline' }],
    )
    assert.deepEqual(
      entityStatesOf('cameras', [{ id: 7, status: { key: 'online' } }]),
      [{ entityId: '7', state: 'online' }],
    )
    assert.deepEqual(entityStatesOf('waze', [{ id: 'j1' }]), [])
  })

  it('normaliza ocorrências para o registro persistido', () => {
    const records = occurrenceRecords([
      {
        id: 'A1',
        type: 'Alagamento',
        typeKey: 'pop27',
        severity: 'high',
        location: 'Av. Brasil',
        coordinates: { latitude: -22.9, longitude: -43.2 },
      },
    ])

    assert.deepEqual(records[0], {
      id: 'A1',
      severity: 'high',
      typeKey: 'pop27',
      type: 'Alagamento',
      location: 'Av. Brasil',
      coordinates: [-22.9, -43.2],
    })
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

  it('grava o frame junto da coleta', async () => {
    globalThis.fetch = stubFetch(FULL_ROUTES)
    const handlers = createHistoryHandlers(env)
    const res = createRes()
    await handlers.collect({ headers: { 'x-collect-secret': 'segredo' } }, res)

    assert.equal(res.statusCode, 200)
    assert.ok(res.body.payloadBytes > 0)
  })

  it('serve o snapshot do frame gravado', async () => {
    const handlers = createHistoryHandlers(env)

    // O frame é do momento atual (a coleta anterior usou `now`); pedimos um
    // instante à frente para garantir que o frame esteja "em ou antes".
    const at = new Date(Date.now() + 60_000).toISOString()
    const res = createRes()
    await handlers.snapshot({ url: `/api/snapshot?at=${encodeURIComponent(at)}` }, res)

    assert.equal(res.statusCode, 200)
    assert.equal(res.body.available, true)
    assert.ok(res.body.at)
    assert.ok(res.body.effectiveLagMs >= 0)
    assert.ok(Array.isArray(res.body.payload.occurrences))
    assert.ok(res.body.sourcesOk.includes('ocorrencias'))
  })

  it('responde 404 quando não há frame para o instante', async () => {
    const handlers = createHistoryHandlers(env)
    const res = createRes()
    await handlers.snapshot({ url: '/api/snapshot?at=2019-01-01T00:00:00Z' }, res)

    assert.equal(res.statusCode, 404)
    assert.equal(res.body.available, false)
    assert.equal(res.body.payload, null)
  })

  it('lista os instantes de frame para a linha do tempo', async () => {
    const handlers = createHistoryHandlers(env)
    const res = createRes()
    const from = new Date(Date.now() - 60 * 60 * 1000).toISOString()
    await handlers.frames({ url: `/api/frames?from=${encodeURIComponent(from)}` }, res)

    assert.equal(res.statusCode, 200)
    // Coletas anteriores nesta suíte também gravaram frames na última hora.
    assert.ok(res.body.count >= 1)
    assert.ok(res.body.frames.every((f) => Array.isArray(f.sourcesFailed)))
    assert.ok(res.body.frames[0].collectedAt)
  })

  it('registra o ciclo de vida das ocorrências na coleta', async () => {
    const dir2 = await fs.mkdtemp(path.join(os.tmpdir(), 'cor-life-'))
    const handlers = createHistoryHandlers({ ...env, HISTORY_DIR: dir2 })

    globalThis.fetch = stubFetch(FULL_ROUTES)
    const first = createRes()
    await handlers.collect({ headers: { 'x-collect-secret': 'segredo' } }, first)

    // A primeira coleta vê 2 ocorrências (A1 e A2), nenhuma fechada.
    assert.equal(first.body.lifecycle.occurrences.seen, 2)
    assert.equal(first.body.lifecycle.occurrences.opened, 2)
    assert.equal(first.body.lifecycle.occurrences.closed, 0)

    // A segunda traz só A1: A2 desapareceu e deve ser fechada.
    globalThis.fetch = stubFetch({
      ...FULL_ROUTES,
      '/OpenedEvents': {
        body: { openedEvents: [{ EventId: 'A1', AgencyEventTypeCode: 'POP27', CreatedDate: '2026-08-01T10:00:00Z' }] },
      },
    })
    const second = createRes()
    await handlers.collect({ headers: { 'x-collect-secret': 'segredo' } }, second)
    assert.equal(second.body.lifecycle.occurrences.seen, 1)
    assert.equal(second.body.lifecycle.occurrences.closed, 1)

    const list = createRes()
    await handlers.occurrences(
      { url: `/api/occurrences?from=${encodeURIComponent(new Date(Date.now() - 3600000).toISOString())}` },
      list,
    )
    assert.equal(list.body.count, 2)
    assert.equal(list.body.openCount, 1)
    assert.equal(list.body.closedCount, 1)
    assert.ok(list.body.avgDurationMs >= 0)

    await fs.rm(dir2, { recursive: true, force: true })
  })

  it('NÃO fecha ocorrências quando a fonte falha', async () => {
    const dir3 = await fs.mkdtemp(path.join(os.tmpdir(), 'cor-fail-'))
    const handlers = createHistoryHandlers({ ...env, HISTORY_DIR: dir3 })

    // Primeira coleta bem-sucedida: duas ocorrências abertas.
    globalThis.fetch = stubFetch(FULL_ROUTES)
    await handlers.collect({ headers: { 'x-collect-secret': 'segredo' } }, createRes())

    // Segunda coleta com o COR indisponível: nada pode ser concluído.
    globalThis.fetch = stubFetch({ ...FULL_ROUTES, '/OpenedEvents': { status: 500, body: {} } })
    const failed = createRes()
    await handlers.collect({ headers: { 'x-collect-secret': 'segredo' } }, failed)

    assert.equal(failed.body.lifecycle.occurrences, null)

    const list = createRes()
    await handlers.occurrences(
      { url: `/api/occurrences?from=${encodeURIComponent(new Date(Date.now() - 3600000).toISOString())}&open=true` },
      list,
    )
    // As duas continuam abertas: uma falha de rede não pode parecer encerramento.
    assert.equal(list.body.openCount, 2)

    await fs.rm(dir3, { recursive: true, force: true })
  })

  it('registra transições de estado dos controladores entre coletas', async () => {
    const dir4 = await fs.mkdtemp(path.join(os.tmpdir(), 'cor-states-'))
    const handlers = createHistoryHandlers({ ...env, HISTORY_DIR: dir4 })

    globalThis.fetch = stubFetch(FULL_ROUTES)
    await handlers.collect({ headers: { 'x-collect-secret': 'segredo' } }, createRes())

    // C2 sai de "sem comunicação" para "OK" e C1 continua OK.
    globalThis.fetch = stubFetch({
      ...FULL_ROUTES,
      'controlador/estado': {
        body: [{ controlador: 'C1', estado: 'OK' }, { controlador: 'C2', estado: 'OK' }],
      },
    })
    const res = createRes()
    await handlers.collect({ headers: { 'x-collect-secret': 'segredo' } }, res)

    assert.equal(res.body.lifecycle.stateChanges, 1)

    const changes = createRes()
    await handlers.stateChanges(
      { url: `/api/state-changes?entity=semaforos&from=${encodeURIComponent(new Date(Date.now() - 3600000).toISOString())}` },
      changes,
    )
    assert.equal(changes.body.count, 1)
    assert.equal(changes.body.changes[0].entityId, 'C2')
    assert.equal(changes.body.changes[0].fromState, 'offline')
    assert.equal(changes.body.changes[0].toState, 'normal')

    await fs.rm(dir4, { recursive: true, force: true })
  })

  it('ignora entidade desconhecida em state-changes', async () => {
    const handlers = createHistoryHandlers(env)
    const res = createRes()
    await handlers.stateChanges({ url: '/api/state-changes?entity=inventado' }, res)
    assert.equal(res.body.entity, null)
  })

  it('poda frames vencidos durante a coleta e reporta a quantidade', async () => {
    const dir5 = await fs.mkdtemp(path.join(os.tmpdir(), 'cor-prune-route-'))
    const handlers = createHistoryHandlers({ ...env, HISTORY_DIR: dir5 })

    // Um arquivo de frames antigo, já fora da retenção de 90 dias.
    const legacy = new Date(Date.now() - 200 * 24 * 60 * 60 * 1000)
    const legacyDay = legacy.toISOString().slice(0, 10)
    await fs.writeFile(
      `${dir5}/frames-${legacyDay}.jsonl`,
      `${JSON.stringify({ collectedAt: `${legacyDay}T10:00:00.000Z`, payload: {}, sourcesOk: [], sourcesFailed: [] })}\n`,
      'utf8',
    )

    globalThis.fetch = stubFetch(FULL_ROUTES)
    const res = createRes()
    await handlers.collect({ headers: { 'x-collect-secret': 'segredo' } }, res)

    assert.equal(res.statusCode, 200)
    assert.equal(res.body.prunedFrames, 1)

    // O frame recém-coletado continua disponível.
    const frames = createRes()
    await handlers.frames({ url: '/api/frames' }, frames)
    assert.ok(frames.body.count >= 1)

    await fs.rm(dir5, { recursive: true, force: true })
  })

  it('não poda nada quando a retenção está desligada', async () => {
    const dir6 = await fs.mkdtemp(path.join(os.tmpdir(), 'cor-noprune-'))
    const handlers = createHistoryHandlers({
      ...env,
      HISTORY_DIR: dir6,
      HISTORY_RETENTION_DAYS: '0',
    })

    const legacy = new Date(Date.now() - 200 * 24 * 60 * 60 * 1000)
    const legacyDay = legacy.toISOString().slice(0, 10)
    await fs.writeFile(
      `${dir6}/frames-${legacyDay}.jsonl`,
      `${JSON.stringify({ collectedAt: `${legacyDay}T10:00:00.000Z`, payload: {}, sourcesOk: [], sourcesFailed: [] })}\n`,
      'utf8',
    )

    globalThis.fetch = stubFetch(FULL_ROUTES)
    const res = createRes()
    await handlers.collect({ headers: { 'x-collect-secret': 'segredo' } }, res)

    assert.equal(res.body.prunedFrames, 0)
    assert.ok(await fs.stat(`${dir6}/frames-${legacyDay}.jsonl`))

    await fs.rm(dir6, { recursive: true, force: true })
  })
})

describe('coletor em segundo plano', () => {
  it('não coleta sem DATABASE_URL (o driver de arquivo é só para dev)', () => {
    const logs = []
    const collector = startBackgroundCollector(
      { HISTORY_DIR: '/tmp/qualquer' },
      { log: { log: (...args) => logs.push(args), error: (...args) => logs.push(args) } },
    )

    const stop = collector.start()
    assert.equal(typeof stop, 'function')
    stop()

    // Sem banco persistente o coletor fica inerte: nada é agendado nem logado.
    assert.equal(logs.length, 0)
  })

  it('expõe um start idempotente (não duplica o timer)', () => {
    const collector = startBackgroundCollector({ DATABASE_URL: 'postgres://x/y' }, { collectOnStart: false })
    const first = collector.start()
    const second = collector.start()
    assert.equal(typeof first, 'function')
    assert.equal(second(), undefined)
    first()
  })
})
