// Testes do driver Postgres executando SQL DE VERDADE.
//
// Motivo: o driver de produção nunca era exercitado — todos os testes usavam o
// driver de arquivo. Assim, erros de SQL (nome de coluna, cast, sintaxe) só
// apareceriam em produção, no primeiro deploy com DATABASE_URL.
//
// Aqui o SQL roda contra um Postgres em memória (pg-mem, dependência de
// desenvolvimento). Não substitui um Postgres real — pg-mem não implementa
// todos os detalhes do planejador — mas garante que todo comando é válido e que
// o ciclo de escrita e leitura funciona de ponta a ponta.
//
// Cobertura de features conferida: BRIN, text[], jsonb, ON CONFLICT, bigserial,
// índices parciais e $n::text IS NULL.

import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { createMetricStore, createPostgresStore } from './metricStore.js'

// Um banco novo por teste: mantém os casos independentes.
async function createMemoryStore() {
  const { newDb } = await import('pg-mem')
  const db = newDb()
  const adapter = db.adapters.createPg()
  const pool = new adapter.Pool()

  const store = createPostgresStore('postgres://memoria/teste', {
    createPool: async () => pool,
  })
  await store.ensureSchema()

  return { store, db, pool }
}

// Constrói o store pelo caminho normal (createMetricStore), com pool injetado.
async function createStoreViaConfig() {
  const { newDb } = await import('pg-mem')
  const db = newDb()
  const adapter = db.adapters.createPg()

  const store = await createMetricStore(
    { DATABASE_URL: 'postgres://memoria/teste' },
    { createPool: async () => new adapter.Pool() },
  )
  return store
}

describe('driver Postgres: schema', () => {
  it('cria as cinco tabelas sem erro de SQL', async () => {
    const { db } = await createMemoryStore()

    // db.public.many já devolve as linhas (não um objeto com `rows`).
    const rows = db.public.many(
      `SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' ORDER BY table_name`,
    )
    const names = rows.map((row) => row.table_name)

    for (const table of ['metric_sample', 'frame', 'occurrence', 'state_change', 'entity_state']) {
      assert.ok(names.includes(table), `tabela ${table} não foi criada (encontradas: ${names.join(', ')})`)
    }
  })

  // A idempotência de ensureSchema (rodar em todo boot/deploy) depende de
  // `CREATE TABLE/INDEX IF NOT EXISTS`, semântica padrão do Postgres. Não é
  // verificada aqui porque o pg-mem rejeita a segunda execução com
  // "AST which parts have not been read by the query planner" — limitação do
  // emulador, não do SQL.
})

describe('driver Postgres: métricas', () => {
  it('grava, faz upsert e lê filtrando por fonte e intervalo', async () => {
    const { store } = await createMemoryStore()

    await store.insertSamples('2026-08-01T10:00:00.000Z', [
      { source: 'ocorrencias', ok: true, error: null, metrics: { total: 10 } },
      { source: 'waze', ok: true, error: null, metrics: { jamCount: 2 } },
    ])

    // Upsert do mesmo (collected_at, source) com métricas novas.
    await store.insertSamples('2026-08-01T10:00:00.000Z', [
      { source: 'ocorrencias', ok: false, error: 'falha', metrics: { total: 11 } },
    ])

    const all = await store.queryRange({
      from: '2026-08-01T00:00:00.000Z',
      to: '2026-08-01T23:59:59.000Z',
    })
    assert.equal(all.length, 2, 'o upsert não deveria criar linha nova')

    const occurrences = await store.queryRange({
      from: '2026-08-01T00:00:00.000Z',
      to: '2026-08-01T23:59:59.000Z',
      source: 'ocorrencias',
    })
    assert.equal(occurrences.length, 1)
    assert.equal(occurrences[0].ok, false)
    assert.equal(occurrences[0].error, 'falha')
    assert.equal(occurrences[0].metrics.total, 11)
    // timestamptz volta como Date e é normalizado para ISO.
    assert.equal(occurrences[0].collectedAt, '2026-08-01T10:00:00.000Z')
  })
})

describe('driver Postgres: frames', () => {
  it('grava com arrays de texto e recupera o payload jsonb', async () => {
    const { store } = await createMemoryStore()

    const bytes = await store.insertFrame({
      collectedAt: '2026-08-02T10:00:00.000Z',
      payload: { occurrences: [{ id: 'A1' }], waze: { jams: [] } },
      sourcesOk: ['ocorrencias', 'waze'],
      sourcesFailed: ['cameras'],
    })
    assert.ok(bytes > 0)

    const frames = await store.listFrames({
      from: '2026-08-02T00:00:00.000Z',
      to: '2026-08-02T23:59:59.000Z',
    })
    assert.equal(frames.length, 1)
    assert.deepEqual(frames[0].sourcesOk, ['ocorrencias', 'waze'])
    assert.deepEqual(frames[0].sourcesFailed, ['cameras'])
    assert.equal(frames[0].payloadBytes, bytes)
  })

  it('busca o frame em ou antes do instante e o próximo', async () => {
    const { store } = await createMemoryStore()

    for (const at of ['2026-08-02T10:00:00.000Z', '2026-08-02T10:15:00.000Z']) {
      await store.insertFrame({ collectedAt: at, payload: { at }, sourcesOk: [], sourcesFailed: [] })
    }

    const { snapshot, next } = await store.getFrameAt('2026-08-02T10:10:00.000Z')
    assert.equal(snapshot.collectedAt, '2026-08-02T10:00:00.000Z')
    assert.equal(snapshot.payload.at, '2026-08-02T10:00:00.000Z')
    assert.equal(next.collectedAt, '2026-08-02T10:15:00.000Z')
  })

  it('faz upsert do frame quando o instante se repete', async () => {
    const { store } = await createMemoryStore()

    await store.insertFrame({ collectedAt: '2026-08-02T10:00:00.000Z', payload: { v: 1 }, sourcesOk: [], sourcesFailed: [] })
    await store.insertFrame({ collectedAt: '2026-08-02T10:00:00.000Z', payload: { v: 2 }, sourcesOk: [], sourcesFailed: [] })

    const frames = await store.listFrames({ from: '2026-08-02T00:00:00.000Z', to: '2026-08-02T23:59:59.000Z' })
    assert.equal(frames.length, 1)
    const { snapshot } = await store.getFrameAt('2026-08-02T10:00:00.000Z')
    assert.equal(snapshot.payload.v, 2)
  })

  it('devolve snapshot nulo além da janela de busca', async () => {
    const { store } = await createMemoryStore()
    await store.insertFrame({ collectedAt: '2026-08-02T10:00:00.000Z', payload: {}, sourcesOk: [], sourcesFailed: [] })

    // Além dos 7 dias de lookback.
    const { snapshot } = await store.getFrameAt('2026-09-02T10:00:00.000Z')
    assert.equal(snapshot, null)
  })

  it('poda por data e reporta a quantidade removida', async () => {
    const { store } = await createMemoryStore()

    for (const day of ['2026-07-01', '2026-07-02', '2026-08-30']) {
      await store.insertFrame({ collectedAt: `${day}T10:00:00.000Z`, payload: {}, sourcesOk: [], sourcesFailed: [] })
    }

    const removed = await store.pruneFrames('2026-08-01T00:00:00.000Z')
    assert.equal(removed, 2)

    const remaining = await store.listFrames({ from: '2026-01-01T00:00:00.000Z', to: '2026-12-31T00:00:00.000Z' })
    assert.deepEqual(remaining.map((frame) => frame.collectedAt), ['2026-08-30T10:00:00.000Z'])
    assert.equal(await store.pruneFrames('2026-08-01T00:00:00.000Z'), 0)
  })
})

describe('driver Postgres: ciclo de vida', () => {
  it('registra abertura, atualiza last_seen e fecha por ausência', async () => {
    const { store } = await createMemoryStore()

    const a = { id: 'A', severity: 'high', typeKey: 'pop27', type: 'Alagamento', location: 'Av. Brasil', coordinates: [-22.9, -43.2] }
    const b = { id: 'B', severity: 'low', typeKey: 'pop23', type: 'Obra', location: 'Centro', coordinates: null }

    await store.syncOccurrences('2026-08-03T10:00:00.000Z', [a, b], [])
    assert.deepEqual((await store.openEventIds()).sort(), ['A', 'B'])

    // Só A permanece: B fechou.
    await store.syncOccurrences('2026-08-03T10:15:00.000Z', [a], [{ id: 'B' }])
    assert.deepEqual(await store.openEventIds(), ['A'])

    const items = await store.listOccurrences({
      from: '2026-08-03T00:00:00.000Z',
      to: '2026-08-03T23:59:59.000Z',
    })
    const byId = Object.fromEntries(items.map((item) => [item.id, item]))

    // first_seen nunca é sobrescrito pelo upsert.
    assert.equal(byId.A.firstSeen, '2026-08-03T10:00:00.000Z')
    assert.equal(byId.A.lastSeen, '2026-08-03T10:15:00.000Z')
    assert.equal(byId.A.closedAt, null)
    assert.equal(byId.B.closedAt, '2026-08-03T10:15:00.000Z')
    assert.equal(byId.B.durationMs, 15 * 60 * 1000)
    // Coordenadas persistidas nas colunas numéricas.
    assert.equal(byId.A.latitude, -22.9)
    assert.equal(byId.A.longitude, -43.2)
    // Ocorrência sem coordenadas grava nulo, não quebra.
    assert.equal(byId.B.latitude, null)
  })

  it('filtra por situação com $3::boolean', async () => {
    const { store, db } = await createMemoryStore()

    await store.syncOccurrences('2026-08-03T10:00:00.000Z', [
      { id: 'A', coordinates: null },
      { id: 'B', coordinates: null },
    ], [])
    await store.syncOccurrences('2026-08-03T10:15:00.000Z', [{ id: 'A', coordinates: null }], [{ id: 'B' }])

    const range = { from: '2026-08-01T00:00:00.000Z', to: '2026-08-05T00:00:00.000Z' }

    const open = await store.listOccurrences({ ...range, open: true })
    assert.deepEqual(open.map((item) => item.id), ['A'])

    const both = await store.listOccurrences({ ...range })
    assert.equal(both.length, 2)

    // O índice parcial `(closed_at) WHERE closed_at IS NULL` é correto e útil no
    // Postgres (serve justamente o filtro de ocorrências abertas), mas o pg-mem
    // não o mantém após UPDATE: com ele presente, `WHERE closed_at IS NOT NULL`
    // devolve zero linhas mesmo com o dado gravado. Verificado isoladamente —
    // mesma tabela, mesmo UPDATE, com índice -> [] / sem índice -> ['B'].
    // Removemos o índice apenas aqui para conseguir exercitar a cláusula.
    db.public.none(`DROP INDEX occurrence_open_idx`)

    const closed = await store.listOccurrences({ ...range, open: false })
    assert.deepEqual(closed.map((item) => item.id), ['B'])
  })

  it('não sobrescreve o instante do primeiro fechamento', async () => {
    const { store } = await createMemoryStore()

    await store.syncOccurrences('2026-08-03T10:00:00.000Z', [{ id: 'A', coordinates: null }], [])
    await store.syncOccurrences('2026-08-03T10:15:00.000Z', [], [{ id: 'A' }])
    // Uma leitura posterior volta a "fechar" o mesmo id: o instante original
    // precisa ser preservado, senão a duração medida mudaria a cada coleta.
    await store.syncOccurrences('2026-08-03T10:30:00.000Z', [], [{ id: 'A' }])

    const items = await store.listOccurrences({
      from: '2026-08-01T00:00:00.000Z',
      to: '2026-08-05T00:00:00.000Z',
    })
    assert.equal(items.length, 1)
    assert.equal(items[0].closedAt, '2026-08-03T10:15:00.000Z')
    assert.equal(items[0].durationMs, 15 * 60 * 1000)
  })

  it('reabre uma ocorrência que reaparece na leitura', async () => {
    const { store } = await createMemoryStore()

    await store.syncOccurrences('2026-08-03T10:00:00.000Z', [{ id: 'A', coordinates: null }], [])
    await store.syncOccurrences('2026-08-03T10:15:00.000Z', [], [{ id: 'A' }])
    assert.deepEqual(await store.openEventIds(), [])

    // Reaparece: volta a constar como aberta (closed_at = NULL no upsert).
    await store.syncOccurrences('2026-08-03T10:30:00.000Z', [{ id: 'A', coordinates: null }], [])
    assert.deepEqual(await store.openEventIds(), ['A'])

    const items = await store.listOccurrences({
      from: '2026-08-01T00:00:00.000Z',
      to: '2026-08-05T00:00:00.000Z',
    })
    assert.equal(items[0].closedAt, null)
  })
})

describe('driver Postgres: estado por entidade', () => {
  it('faz upsert do estado corrente por entidade', async () => {
    const { store } = await createMemoryStore()

    await store.setEntityStates(
      'semaforos',
      [{ entityId: 'C1', state: 'normal' }, { entityId: 'C2', state: 'offline' }],
      '2026-08-03T10:00:00.000Z',
    )
    await store.setEntityStates('semaforos', [{ entityId: 'C2', state: 'alarm' }], '2026-08-03T10:15:00.000Z')

    const states = await store.getEntityStates('semaforos')
    const byId = Object.fromEntries(states.map((item) => [item.entityId, item.state]))
    assert.equal(byId.C1, 'normal')
    assert.equal(byId.C2, 'alarm')

    assert.deepEqual(await store.getEntityStates('cameras'), [])
  })

  it('insere e consulta mudanças de estado com bigserial', async () => {
    const { store } = await createMemoryStore()

    const inserted = await store.insertStateChanges('2026-08-03T10:15:00.000Z', [
      { entity: 'semaforos', entityId: 'C2', fromState: 'offline', toState: 'alarm' },
      { entity: 'cameras', entityId: '7', fromState: 'online', toState: 'offline' },
    ])
    assert.equal(inserted, 2)

    const all = await store.queryStateChanges({ from: '2026-08-03T00:00:00.000Z', to: '2026-08-03T23:59:59.000Z' })
    assert.equal(all.length, 2)

    const onlyLights = await store.queryStateChanges({
      from: '2026-08-03T00:00:00.000Z',
      to: '2026-08-03T23:59:59.000Z',
      entity: 'semaforos',
    })
    assert.equal(onlyLights.length, 1)
    assert.equal(onlyLights[0].fromState, 'offline')
    assert.equal(onlyLights[0].toState, 'alarm')

    // Listas vazias não geram SQL inválido.
    assert.equal(await store.insertStateChanges('2026-08-03T10:00:00.000Z', []), 0)
  })

  it('mantém a ordem de inserção dentro de um mesmo instante', async () => {
    const { store } = await createMemoryStore()

    // Um lote usa um único `changedAt` para todas as linhas. Como a consulta
    // ordena por changed_at com LIMIT, sem desempate a ordem (e quais linhas
    // sobrevivem ao limite) seria arbitrária. O `id` do bigserial é o desempate.
    await store.insertStateChanges('2026-08-03T10:15:00.000Z', [
      { entity: 'semaforos', entityId: 'P1', fromState: 'a', toState: 'b' },
      { entity: 'semaforos', entityId: 'P2', fromState: 'a', toState: 'b' },
      { entity: 'semaforos', entityId: 'P3', fromState: 'a', toState: 'b' },
    ])

    const all = await store.queryStateChanges({ from: '2026-08-03T00:00:00.000Z', to: '2026-08-03T23:59:59.000Z' })
    assert.deepEqual(
      all.map((item) => item.entityId),
      ['P1', 'P2', 'P3'],
    )

    // Com o limite igual ao número de linhas do mesmo instante, a ordem tem de
    // continuar determinística.
    const limited = await store.queryStateChanges({
      from: '2026-08-03T00:00:00.000Z',
      to: '2026-08-03T23:59:59.000Z',
      limit: 2,
    })
    assert.deepEqual(
      limited.map((item) => item.entityId),
      ['P1', 'P2'],
    )
  })
})

describe('driver Postgres: seleção pelo caminho de configuração', () => {
  it('usa o driver Postgres quando há DATABASE_URL', async () => {
    const store = await createStoreViaConfig()
    assert.equal(store.name, 'postgres')

    await store.insertSamples('2026-08-01T10:00:00.000Z', [
      { source: 'waze', ok: true, error: null, metrics: { jamCount: 1 } },
    ])
    const rows = await store.queryRange({ from: '2026-08-01T00:00:00.000Z', to: '2026-08-01T23:59:59.000Z' })
    assert.equal(rows.length, 1)
  })
})
