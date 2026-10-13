// Verificação do histórico contra um Postgres REAL (por exemplo o Neon).
//
// Executa exatamente o SQL de produção (mesmo createMetricStore), então serve
// para responder "esse banco é compatível?" antes de confiar nele. A suíte roda
// contra um emulador (`pg-mem`), que não cobre tudo — na prática o emulador
// mentiu em dois pontos que aqui são conferidos de verdade: a idempotência do
// `CREATE TABLE IF NOT EXISTS` e o índice parcial usado no filtro de ocorrências
// abertas.
//
//   npm run verify:db
//
// Grava dados de teste com marcadores próprios e os apaga no fim. Só toca em
// linhas identificadas por esses marcadores (`SMOKE-*` e `source/entity =
// 'smoke'`), nunca em dados reais de coleta.

import { createMetricStore } from '../shared/history/metricStore.js'

const RUN = Date.now()
const AT = new Date(RUN).toISOString()
const FROM = new Date(RUN - 3600_000).toISOString()
const TO = new Date(RUN + 3600_000).toISOString()
const ID_A = `SMOKE-${RUN}-A`
const ID_B = `SMOKE-${RUN}-B`

let failures = 0
function check(label, condition, detail = '') {
  if (condition) {
    console.log(`  OK    ${label}${detail ? ` (${detail})` : ''}`)
  } else {
    failures += 1
    console.log(`  FALHA ${label}${detail ? ` (${detail})` : ''}`)
  }
}

const store = await createMetricStore(process.env)
console.log(`\ndriver: ${store.name}`)
if (store.name !== 'postgres') {
  console.error('FALHA: caiu no driver de arquivo — DATABASE_URL não foi lido.')
  process.exit(1)
}

console.log('\n1. Schema (idempotência do boot)')
// createMetricStore já chamou ensureSchema uma vez. Uma segunda vez exercita o
// `CREATE TABLE/INDEX IF NOT EXISTS`, que é o caminho de todo restart/deploy.
await store.ensureSchema()
await store.ensureSchema()
check('ensureSchema repetido sem erro', true, '3 execuções')

console.log('\n2. metric_sample (PK composta + jsonb)')
await store.insertSamples(AT, [{ source: 'smoke', ok: true, error: null, metrics: { total: 1 } }])
await store.insertSamples(AT, [{ source: 'smoke', ok: false, error: 'probe', metrics: { total: 2 } }])
const samples = await store.queryRange({ from: FROM, to: TO, source: 'smoke' })
check('upsert não duplica por (collected_at, source)', samples.length === 1, `linhas: ${samples.length}`)
check('jsonb volta como objeto', samples[0]?.metrics?.total === 2, `total: ${samples[0]?.metrics?.total}`)
check('coluna boolean ok persistida', samples[0]?.ok === false, `ok: ${samples[0]?.ok}`)

console.log('\n3. frame (jsonb grande + text[] + busca por instante)')
const payload = { ocorrencias: [{ id: ID_A }], waze: { jams: [] }, cameras: [] }
const bytes = await store.insertFrame({
  collectedAt: AT,
  payload,
  sourcesOk: ['ocorrencias'],
  sourcesFailed: ['waze', 'cameras'],
})
const { snapshot, next } = await store.getFrameAt(AT)
check('frame gravado e lido de volta', snapshot?.collectedAt === AT, `${bytes} bytes`)
check('jsonb aninhado preservado', snapshot?.payload?.ocorrencias?.[0]?.id === ID_A)
check('text[] de fontes ok', JSON.stringify(snapshot?.sourcesOk) === '["ocorrencias"]')
check('text[] de fontes com falha', JSON.stringify(snapshot?.sourcesFailed) === '["waze","cameras"]')
check('sem frame posterior, next é null', next === null, `next: ${JSON.stringify(next)}`)

console.log('\n4. ciclo de vida (índice parcial + fechamento por IN)')
await store.syncOccurrences(AT, [
  { id: ID_A, severity: 'low', typeKey: 'tk', type: 'Teste A', location: 'Rio', coordinates: [-22.9, -43.2] },
  { id: ID_B, severity: 'high', typeKey: 'tk', type: 'Teste B', location: 'Rio', coordinates: null },
], [])
const openedIds = await store.openEventIds()
check('as duas nascem abertas', [ID_A, ID_B].every((id) => openedIds.includes(id)), `abertas: ${openedIds.length}`)

// A segunda leitura vê só A: B "sumiu" e portanto fechou.
const synced = await store.syncOccurrences(new Date(RUN + 1000).toISOString(), [{ id: ID_A }], [{ id: ID_B }])
check('fechamento reportado', synced.closed === 1, `closed: ${synced.closed}`)

const closedList = await store.listOccurrences({ from: FROM, to: TO, open: false })
const closedIds = closedList.map((item) => item.id)
// Este é o ponto exato onde o emulador mentia: o índice parcial fazia
// `IS NOT NULL` devolver vazio. No Postgres real tem de devolver B.
check('open=false encontra a encerrada', closedIds.includes(ID_B), `ids: ${closedIds.join(',') || 'nenhuma'}`)

const openList = await store.listOccurrences({ from: FROM, to: TO, open: true })
const openIds = openList.map((item) => item.id)
check('open=true não inclui a encerrada', !openIds.includes(ID_B))
check('open=true inclui a que continua aberta', openIds.includes(ID_A))

const onlyA = await store.listOccurrences({ from: FROM, to: TO, limit: 500 })
const foundA = onlyA.find((item) => item.id === ID_A)
check('firstSeen preservado no upsert', foundA?.firstSeen === AT, `firstSeen: ${foundA?.firstSeen}`)
check('lastSeen avançou no upsert', foundA?.lastSeen !== AT, `lastSeen: ${foundA?.lastSeen}`)
check('coordinates viram números', foundA?.latitude === -22.9 && foundA?.longitude === -43.2)
check('coordenada ausente vira null', onlyA.find((i) => i.id === ID_B)?.latitude === null)

console.log('\n5. estado por entidade e mudanças (bigserial)')
await store.setEntityStates('smoke', [{ entityId: 'C1', state: 'normal' }, { entityId: 'C2', state: 'offline' }], AT)
await store.setEntityStates('smoke', [{ entityId: 'C2', state: 'alarm' }], new Date(RUN + 1000).toISOString())
const states = await store.getEntityStates('smoke')
const byId = Object.fromEntries(states.map((item) => [item.entityId, item.state]))
check('upsert do estado corrente', byId.C1 === 'normal' && byId.C2 === 'alarm', JSON.stringify(byId))

// Um único lote: todas as linhas ficam com o MESMO changed_at. Sem o desempate
// por `id`, a ordem (e quais linhas sobrevivem ao LIMIT) seria arbitrária.
const inserted = await store.insertStateChanges(new Date(RUN + 2000).toISOString(), [
  { entity: 'smoke', entityId: 'P1', fromState: 'offline', toState: 'normal' },
  { entity: 'smoke', entityId: 'P2', fromState: 'offline', toState: 'alarm' },
  { entity: 'smoke', entityId: 'P3', fromState: 'offline', toState: 'normal' },
])
check('insere o lote de mudanças', inserted === 3, `inseridas: ${inserted}`)
const changes = await store.queryStateChanges({ from: FROM, to: TO, entity: 'smoke' })
check('consulta mudanças por entidade', changes.length === 3, `mudanças: ${changes.length}`)
// Mesmo instante em todas: a ordem tem de ser a de inserção (P1, P2, P3).
check(
  'ordem estável dentro do mesmo instante',
  JSON.stringify(changes.map((item) => item.entityId)) === JSON.stringify(['P1', 'P2', 'P3']),
  changes.map((item) => item.entityId).join(','),
)

console.log('\n6. retenção (prune de frames)')
const pruned = await store.pruneFrames(new Date(RUN - 86400_000).toISOString())
check('pruneFrames roda sem erro', typeof pruned === 'number', `removidos: ${pruned}`)

console.log('\n7. limpeza dos dados de teste')
const { default: pg } = await import('pg')
const client = new pg.Client({ connectionString: process.env.DATABASE_URL })
await client.connect()
await client.query('DELETE FROM frame WHERE collected_at = $1', [AT])
await client.query('DELETE FROM metric_sample WHERE source = $1', ['smoke'])
await client.query('DELETE FROM occurrence WHERE event_id = ANY($1::text[])', [[ID_A, ID_B]])
await client.query('DELETE FROM state_change WHERE entity = $1', ['smoke'])
await client.query('DELETE FROM entity_state WHERE entity = $1', ['smoke'])
const leftover = await client.query(
  `SELECT (SELECT count(*) FROM frame WHERE collected_at = $1) AS f,
          (SELECT count(*) FROM metric_sample WHERE source = 'smoke') AS m,
          (SELECT count(*) FROM occurrence WHERE event_id = ANY($2::text[])) AS o,
          (SELECT count(*) FROM state_change WHERE entity = 'smoke') AS s,
          (SELECT count(*) FROM entity_state WHERE entity = 'smoke') AS e`,
  [AT, [ID_A, ID_B]],
)
const left = leftover.rows[0]
const clean = Object.values(left).every((value) => Number(value) === 0)
check('nenhum resíduo de teste', clean, JSON.stringify(left))
await client.end()
await store.close()

console.log(failures === 0 ? '\n=== TUDO OK contra o Neon ===' : `\n=== ${failures} FALHA(S) ===`)
process.exit(failures === 0 ? 0 : 1)
