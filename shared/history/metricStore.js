// Persistência do histórico: métricas compactas (série temporal), frames
// (estado completo compacto, para o replay do mapa) e as tabelas derivadas de
// ciclo de vida (ocorrências e mudanças de estado), que registram o que
// MUDOU — não o que existia em cada instante.
//
// Dois drivers, escolhidos por variável de ambiente:
//   - Postgres (DATABASE_URL)  → produção
//   - JSONL    (HISTORY_DIR)   → desenvolvimento local, sem banco
//
// O driver de arquivo NÃO serve para produção: em hospedagem com disco efêmero
// (ex.: plano gratuito do Render) o conteúdo se perde a cada deploy/restart. Ele
// existe para rodar e testar a coleta sem depender de um banco.
//
// As tabelas são desenhadas para serem pequenas: uma linha por fonte por coleta
// (métricas consolidadas em jsonb) e um payload compacto por frame — nunca o
// payload bruto das APIs.

import fs from 'node:fs/promises'

const TABLE = 'metric_sample'
const FRAME_TABLE = 'frame'
const OCCURRENCE_TABLE = 'occurrence'
const STATE_CHANGE_TABLE = 'state_change'
const ENTITY_STATE_TABLE = 'entity_state'

// Entidades acompanhadas na detecção de transições de estado.
export const TRACKED_ENTITIES = ['semaforos', 'cameras']

// Retenção dos frames. O frame é 95% do volume do histórico (~100 MB/mês), então
// é a única tabela que precisa de poda para caber em free tiers. As demais são
// pequenas e, principalmente, são o valor analítico de longo prazo — `occurrence`
// e `state_change` nunca são podadas.
//
// 90 dias deixam o estado estacionário em ~300 MB. Defina
// HISTORY_RETENTION_DAYS=0 para manter tudo (útil com banco folgado).
export const DEFAULT_RETENTION_DAYS = 90

export function getRetentionConfig(env = {}) {
  const raw = env.HISTORY_RETENTION_DAYS
  const days = raw === undefined || raw === '' ? DEFAULT_RETENTION_DAYS : Number(raw)

  // Valor ausente usa o padrão; 0 ou negativo desliga a poda explicitamente.
  if (!Number.isFinite(days)) return { days: DEFAULT_RETENTION_DAYS, enabled: true }
  return { days, enabled: days > 0 }
}

// Instante de corte: tudo anterior a ele pode ser removido. Devolve null quando
// a poda está desligada.
export function retentionCutoff(env = {}, now = new Date()) {
  const { days, enabled } = getRetentionConfig(env)
  if (!enabled) return null
  return new Date(now.getTime() - days * 24 * 60 * 60 * 1000).toISOString()
}

export const METRIC_SOURCES = ['ocorrencias', 'waze', 'semaforos', 'cameras']

// Quanto tempo para trás a busca por "frame em ou antes do instante" procura.
// Se não houver frame na janela, a lacuna é reportada como tal em vez de servir
// um estado antigo como se fosse daquele momento.
const FRAME_LOOKBACK_MS = 7 * 24 * 60 * 60 * 1000

export function getHistoryConfig(env = {}) {
  return {
    driver: env.DATABASE_URL ? 'postgres' : 'file',
    databaseUrl: env.DATABASE_URL || null,
    historyDir: env.HISTORY_DIR || 'var/history',
  }
}

export async function createMetricStore(env = {}) {
  const config = getHistoryConfig(env)
  const store =
    config.driver === 'postgres'
      ? createPostgresStore(config.databaseUrl)
      : createFileStore(config.historyDir)

  await store.ensureSchema()
  return store
}

function toDayKey(date) {
  return new Date(date).toISOString().slice(0, 10)
}

// Escolhe o frame aplicável a um instante e o próximo disponível.
// Exportado para ser testado sem banco.
export function pickFrameAt(frames, when) {
  const target = new Date(when).getTime()
  if (!Number.isFinite(target) || !frames.length) {
    return { snapshot: null, next: null }
  }

  const sorted = [...frames].sort(
    (a, b) => new Date(a.collectedAt) - new Date(b.collectedAt),
  )

  let before = null
  let next = null

  for (const frame of sorted) {
    const at = new Date(frame.collectedAt).getTime()
    if (at <= target) before = frame
    else if (!next) next = frame
  }

  return { snapshot: before, next }
}

// Compara a leitura atual de cada entidade com o estado conhecido e produz as
// transições. É a base das tabelas derivadas:
//   - ocorrência vista pela primeira vez        → abertura
//   - ocorrência ausente da leitura             → fechamento
//   - controlador/câmera com novo groupKey      → mudança de estado
//
// Puro de propósito: a decisão de o que mudou é testável sem banco.
export function diffEntities({ current = [], previous = [], idOf, stateOf }) {
  const previousById = new Map(previous.map((item) => [idOf(item), item]))
  const opened = []
  const changed = []

  for (const item of current) {
    const id = idOf(item)
    const before = previousById.get(id)
    if (!before) {
      opened.push(item)
      continue
    }
    const fromState = stateOf(before)
    const toState = stateOf(item)
    if (fromState !== toState) changed.push({ item, fromState, toState })
  }

  const currentIds = new Set(current.map(idOf))
  const closed = previous.filter((item) => !currentIds.has(idOf(item)))

  return { opened, closed, changed }
}


// ---------------------------------------------------------------- Postgres --

export function createPostgresStore(connectionString) {
  let pool = null

  const getPool = async () => {
    if (!pool) {
      // Import dinâmico: o driver só é carregado quando há DATABASE_URL, para
      // que o desenvolvimento local rode sem banco e sem a dependência ativa.
      const { default: pg } = await import('pg')
      pool = new pg.Pool({ connectionString, max: 3, connectionTimeoutMillis: 15000 })
    }
    return pool
  }

  return {
    name: 'postgres',

    async ensureSchema() {
      const p = await getPool()
      await p.query(`
        CREATE TABLE IF NOT EXISTS ${TABLE} (
          collected_at timestamptz NOT NULL,
          source       text        NOT NULL,
          ok           boolean     NOT NULL DEFAULT true,
          error        text,
          metrics      jsonb       NOT NULL,
          PRIMARY KEY (collected_at, source)
        )
      `)
      await p.query(
        `CREATE INDEX IF NOT EXISTS ${TABLE}_source_time_idx ON ${TABLE} (source, collected_at DESC)`,
      )
      await p.query(
        `CREATE INDEX IF NOT EXISTS ${TABLE}_time_brin ON ${TABLE} USING brin (collected_at)`,
      )

      await p.query(`
        CREATE TABLE IF NOT EXISTS ${FRAME_TABLE} (
          collected_at    timestamptz NOT NULL PRIMARY KEY,
          payload         jsonb       NOT NULL,
          payload_bytes   int         NOT NULL DEFAULT 0,
          sources_ok      text[]      NOT NULL DEFAULT '{}',
          sources_failed  text[]      NOT NULL DEFAULT '{}'
        )
      `)
      await p.query(
        `CREATE INDEX IF NOT EXISTS ${FRAME_TABLE}_time_brin ON ${FRAME_TABLE} USING brin (collected_at)`,
      )

      await p.query(`
        CREATE TABLE IF NOT EXISTS ${OCCURRENCE_TABLE} (
          event_id     text        PRIMARY KEY,
          first_seen   timestamptz NOT NULL,
          last_seen    timestamptz NOT NULL,
          closed_at    timestamptz,
          severity     text,
          type_key     text,
          type_label   text,
          location     text,
          latitude     double precision,
          longitude    double precision,
          created_at   timestamptz
        )
      `)
      await p.query(
        `CREATE INDEX IF NOT EXISTS ${OCCURRENCE_TABLE}_first_seen_idx ON ${OCCURRENCE_TABLE} (first_seen DESC)`,
      )
      await p.query(
        `CREATE INDEX IF NOT EXISTS ${OCCURRENCE_TABLE}_open_idx ON ${OCCURRENCE_TABLE} (closed_at) WHERE closed_at IS NULL`,
      )

      await p.query(`
        CREATE TABLE IF NOT EXISTS ${STATE_CHANGE_TABLE} (
          id          bigserial PRIMARY KEY,
          changed_at  timestamptz NOT NULL,
          entity      text        NOT NULL,
          entity_id   text        NOT NULL,
          from_state  text,
          to_state    text        NOT NULL
        )
      `)
      await p.query(
        `CREATE INDEX IF NOT EXISTS ${STATE_CHANGE_TABLE}_time_idx ON ${STATE_CHANGE_TABLE} (changed_at DESC)`,
      )
      await p.query(
        `CREATE INDEX IF NOT EXISTS ${STATE_CHANGE_TABLE}_entity_idx ON ${STATE_CHANGE_TABLE} (entity, entity_id, changed_at DESC)`,
      )

      // Estado corrente por entidade: permite detectar transições sem varrer o
      // log inteiro a cada coleta.
      await p.query(`
        CREATE TABLE IF NOT EXISTS ${ENTITY_STATE_TABLE} (
          entity      text        NOT NULL,
          entity_id   text        NOT NULL,
          state       text        NOT NULL,
          updated_at  timestamptz NOT NULL,
          PRIMARY KEY (entity, entity_id)
        )
      `)
    },

    async syncOccurrences(collectedAt, seen, closed) {
      const p = await getPool()

      // Vistos agora: insere na primeira vez e só atualiza `last_seen` nas
      // seguintes. `first_seen` nunca é sobrescrito — é o instante de abertura.
      if (seen.length) {
        const values = []
        const params = []
        seen.forEach((event, index) => {
          const base = index * 9
          values.push(
            `($${base + 1}, $${base + 2}, $${base + 3}, $${base + 4}, $${base + 5}, $${base + 6}, $${base + 7}, $${base + 8}, $${base + 9})`,
          )
          params.push(
            event.id,
            collectedAt,
            collectedAt,
            event.severity || null,
            event.typeKey || null,
            event.type || null,
            event.location || null,
            event.coordinates?.[0] ?? null,
            event.coordinates?.[1] ?? null,
          )
        })

        await p.query(
          `INSERT INTO ${OCCURRENCE_TABLE}
             (event_id, first_seen, last_seen, severity, type_key, type_label, location, latitude, longitude)
           VALUES ${values.join(', ')}
           ON CONFLICT (event_id)
           DO UPDATE SET last_seen = EXCLUDED.last_seen, closed_at = NULL`,
          params,
        )
      }

      // Ausentes agora: fecharam entre as duas leituras. O endpoint do COR só
      // devolve ocorrências abertas, então "sumiu" significa "encerrada".
      if (closed.length) {
        await p.query(
          `UPDATE ${OCCURRENCE_TABLE}
              SET closed_at = COALESCE(closed_at, $1)
            WHERE event_id = ANY($2::text[])`,
          [collectedAt, closed.map((event) => event.id)],
        )
      }

      return { opened: seen.length, closed: closed.length }
    },

    async openEventIds() {
      const p = await getPool()
      const { rows } = await p.query(
        `SELECT event_id FROM ${OCCURRENCE_TABLE} WHERE closed_at IS NULL`,
      )
      return rows.map((row) => row.event_id)
    },

    async getEntityStates(entity) {
      const p = await getPool()
      const { rows } = await p.query(
        `SELECT entity_id, state FROM ${ENTITY_STATE_TABLE} WHERE entity = $1`,
        [entity],
      )
      return rows.map((row) => ({ entityId: row.entity_id, state: row.state }))
    },

    async setEntityStates(entity, entries, updatedAt) {
      if (!entries.length) return 0
      const p = await getPool()

      const values = []
      const params = []
      entries.forEach((entry, index) => {
        const base = index * 4
        values.push(`($${base + 1}, $${base + 2}, $${base + 3}, $${base + 4})`)
        params.push(entity, entry.entityId, entry.state, updatedAt)
      })

      await p.query(
        `INSERT INTO ${ENTITY_STATE_TABLE} (entity, entity_id, state, updated_at)
         VALUES ${values.join(', ')}
         ON CONFLICT (entity, entity_id)
         DO UPDATE SET state = EXCLUDED.state, updated_at = EXCLUDED.updated_at`,
        params,
      )
      return entries.length
    },

    async insertStateChanges(changedAt, changes) {
      if (!changes.length) return 0
      const p = await getPool()

      const values = []
      const params = []
      changes.forEach((change, index) => {
        const base = index * 5
        values.push(`($${base + 1}, $${base + 2}, $${base + 3}, $${base + 4}, $${base + 5})`)
        params.push(changedAt, change.entity, change.entityId, change.fromState, change.toState)
      })

      await p.query(
        `INSERT INTO ${STATE_CHANGE_TABLE} (changed_at, entity, entity_id, from_state, to_state)
         VALUES ${values.join(', ')}`,
        params,
      )
      return changes.length
    },

    async queryStateChanges({ from, to, entity = null, limit = 500 }) {
      const p = await getPool()
      const { rows } = await p.query(
        `SELECT changed_at, entity, entity_id, from_state, to_state
           FROM ${STATE_CHANGE_TABLE}
          WHERE changed_at >= $1 AND changed_at <= $2
            AND ($3::text IS NULL OR entity = $3)
          ORDER BY changed_at DESC
          LIMIT $4`,
        [from, to, entity, limit],
      )
      return rows.map((row) => ({
        changedAt: row.changed_at.toISOString(),
        entity: row.entity,
        entityId: row.entity_id,
        fromState: row.from_state,
        toState: row.to_state,
      }))
    },

    async listOccurrences({ from, to, open = null, limit = 500 }) {
      const p = await getPool()
      const { rows } = await p.query(
        `SELECT event_id, first_seen, last_seen, closed_at, severity, type_key, type_label, location, latitude, longitude
           FROM ${OCCURRENCE_TABLE}
          WHERE first_seen <= $2 AND COALESCE(closed_at, $2::timestamptz) >= $1
            AND ($3::boolean IS NULL OR ($3::boolean = true AND closed_at IS NULL) OR ($3::boolean = false AND closed_at IS NOT NULL))
          ORDER BY first_seen DESC
          LIMIT $4`,
        [from, to, open, limit],
      )
      return rows.map((row) => ({
        id: row.event_id,
        firstSeen: row.first_seen.toISOString(),
        lastSeen: row.last_seen.toISOString(),
        closedAt: row.closed_at ? row.closed_at.toISOString() : null,
        durationMs: (row.closed_at || new Date(row.last_seen)).getTime() - row.first_seen.getTime(),
        severity: row.severity,
        typeKey: row.type_key,
        typeLabel: row.type_label,
        location: row.location,
        latitude: row.latitude,
        longitude: row.longitude,
      }))
    },

    async insertFrame({ collectedAt, payload, sourcesOk = [], sourcesFailed = [] }) {
      const p = await getPool()
      const serialized = JSON.stringify(payload || {})
      await p.query(
        `INSERT INTO ${FRAME_TABLE} (collected_at, payload, payload_bytes, sources_ok, sources_failed)
         VALUES ($1, $2::jsonb, $3, $4, $5)
         ON CONFLICT (collected_at)
         DO UPDATE SET payload = EXCLUDED.payload,
                       payload_bytes = EXCLUDED.payload_bytes,
                       sources_ok = EXCLUDED.sources_ok,
                       sources_failed = EXCLUDED.sources_failed`,
        [collectedAt, serialized, Buffer.byteLength(serialized), sourcesOk, sourcesFailed],
      )
      return Buffer.byteLength(serialized)
    },

    async listFrames({ from, to, limit = 2000 }) {
      const p = await getPool()
      const { rows } = await p.query(
        `SELECT collected_at, payload_bytes, sources_ok, sources_failed
           FROM ${FRAME_TABLE}
          WHERE collected_at >= $1 AND collected_at <= $2
          ORDER BY collected_at ASC
          LIMIT $3`,
        [from, to, limit],
      )
      return rows.map((row) => ({
        collectedAt: row.collected_at.toISOString(),
        payloadBytes: row.payload_bytes,
        sourcesOk: row.sources_ok,
        sourcesFailed: row.sources_failed,
      }))
    },

    // Remove frames anteriores ao corte e devolve quantos foram apagados. O
    // índice no tempo torna isso barato o suficiente para rodar a cada coleta.
    async pruneFrames(before) {
      const p = await getPool()
      const { rowCount } = await p.query(
        `DELETE FROM ${FRAME_TABLE} WHERE collected_at < $1`,
        [before],
      )
      return rowCount || 0
    },

    async getFrameAt(when) {
      const p = await getPool()
      const target = new Date(when)
      const lookback = new Date(target.getTime() - FRAME_LOOKBACK_MS)
      const { rows } = await p.query(
        `(SELECT collected_at, payload, payload_bytes, sources_ok, sources_failed
            FROM ${FRAME_TABLE}
           WHERE collected_at <= $1 AND collected_at >= $2
           ORDER BY collected_at DESC
           LIMIT 1)
         UNION ALL
         (SELECT collected_at, payload, payload_bytes, sources_ok, sources_failed
            FROM ${FRAME_TABLE}
           WHERE collected_at > $1
           ORDER BY collected_at ASC
           LIMIT 1)`,
        [target, lookback],
      )

      const toFrame = (row) =>
        row && {
          collectedAt: row.collected_at.toISOString(),
          payload: row.payload,
          payloadBytes: row.payload_bytes,
          sourcesOk: row.sources_ok,
          sourcesFailed: row.sources_failed,
        }

      const snapshot = toFrame(rows.find((row) => row.collected_at <= target))
      const next = toFrame(rows.find((row) => row.collected_at > target))

      return { snapshot, next }
    },

    async insertSamples(collectedAt, samples) {
      if (!samples.length) return 0
      const p = await getPool()

      const values = []
      const params = []
      samples.forEach((sample, index) => {
        const base = index * 5
        values.push(`($${base + 1}, $${base + 2}, $${base + 3}, $${base + 4}, $${base + 5}::jsonb)`)
        params.push(
          collectedAt,
          sample.source,
          sample.ok !== false,
          sample.error || null,
          JSON.stringify(sample.metrics || {}),
        )
      })

      await p.query(
        `INSERT INTO ${TABLE} (collected_at, source, ok, error, metrics)
         VALUES ${values.join(', ')}
         ON CONFLICT (collected_at, source)
         DO UPDATE SET ok = EXCLUDED.ok, error = EXCLUDED.error, metrics = EXCLUDED.metrics`,
        params,
      )
      return samples.length
    },

    async queryRange({ from, to, source = null, limit = 5000 }) {
      const p = await getPool()
      const { rows } = await p.query(
        `SELECT collected_at, source, ok, error, metrics
           FROM ${TABLE}
          WHERE collected_at >= $1
            AND collected_at <= $2
            AND ($3::text IS NULL OR source = $3)
          ORDER BY collected_at ASC
          LIMIT $4`,
        [from, to, source, limit],
      )
      return rows.map((row) => ({
        collectedAt: row.collected_at.toISOString(),
        source: row.source,
        ok: row.ok,
        error: row.error,
        metrics: row.metrics,
      }))
    },

    async close() {
      if (pool) await pool.end()
    },
  }
}

// -------------------------------------------------------------------- File --

// Driver de desenvolvimento: um arquivo JSONL por dia. A leitura percorre os
// dias do intervalo pedido e filtra em memória — suficiente para o volume local.
export function createFileStore(dir) {
  const fileFor = (date) => `${dir}/metrics-${toDayKey(date)}.jsonl`
  const frameFileFor = (date) => `${dir}/frames-${toDayKey(date)}.jsonl`
  const occurrenceFile = `${dir}/occurrences.jsonl`
  const stateChangeFile = `${dir}/state-changes.jsonl`
  const entityStateFile = `${dir}/entity-states.jsonl`

  // O driver de arquivo não tem índice: reconstruímos o estado em memória a
  // partir do log append-only. Para o volume local isso é suficiente.
  const readJsonl = async (file) => {
    let content
    try {
      content = await fs.readFile(file, 'utf8')
    } catch {
      return []
    }

    const records = []
    for (const line of content.split('\n')) {
      if (!line.trim()) continue
      try {
        records.push(JSON.parse(line))
      } catch {
        /* linha truncada por escrita concorrente: ignora */
      }
    }
    return records
  }

  const appendJsonl = async (file, record) => {
    await fs.mkdir(dir, { recursive: true })
    await fs.appendFile(file, `${JSON.stringify(record)}\n`, 'utf8')
  }

  // Reconstrói o estado atual das ocorrências a partir das aberturas e
  // fechamentos registrados.
  const foldOccurrences = (records) => {
    const byId = new Map()

    for (const record of records) {
      if (record.kind === 'open') {
        if (!byId.has(record.id)) {
          byId.set(record.id, {
            id: record.id,
            firstSeen: record.collectedAt,
            lastSeen: record.collectedAt,
            closedAt: null,
            severity: record.severity ?? null,
            typeKey: record.typeKey ?? null,
            typeLabel: record.typeLabel ?? null,
            location: record.location ?? null,
            latitude: record.latitude ?? null,
            longitude: record.longitude ?? null,
          })
        } else {
          byId.get(record.id).lastSeen = record.collectedAt
        }
      } else if (record.kind === 'close' && byId.has(record.id)) {
        const item = byId.get(record.id)
        item.closedAt = item.closedAt || record.collectedAt
      }
    }

    return [...byId.values()]
      .map((item) => ({
        ...item,
        durationMs:
          new Date(item.closedAt || item.lastSeen).getTime() - new Date(item.firstSeen).getTime(),
      }))
      .sort((a, b) => new Date(b.firstSeen) - new Date(a.firstSeen))
  }

  // Lê os frames gravados no intervalo, varrendo um arquivo por dia.
  const readFrames = async (from, to, limit) => {
    const start = new Date(from)
    const end = new Date(to)
    const frames = []

    for (let day = new Date(toDayKey(start)); day <= end; day.setUTCDate(day.getUTCDate() + 1)) {
      let content
      try {
        content = await fs.readFile(frameFileFor(day), 'utf8')
      } catch {
        continue
      }

      for (const line of content.split('\n')) {
        if (!line.trim()) continue
        let record
        try {
          record = JSON.parse(line)
        } catch {
          continue
        }
        const at = new Date(record.collectedAt)
        if (at < start || at > end) continue
        frames.push(record)
      }
    }

    return frames
      .sort((a, b) => new Date(a.collectedAt) - new Date(b.collectedAt))
      .slice(0, limit)
  }

  return {
    name: 'file',

    async ensureSchema() {
      await fs.mkdir(dir, { recursive: true })
    },

    async syncOccurrences(collectedAt, seen, closed) {
      for (const event of seen) {
        await appendJsonl(occurrenceFile, {
          kind: 'open',
          collectedAt,
          id: event.id,
          severity: event.severity,
          typeKey: event.typeKey,
          typeLabel: event.type,
          location: event.location,
          latitude: event.coordinates?.[0] ?? null,
          longitude: event.coordinates?.[1] ?? null,
        })
      }
      for (const event of closed) {
        await appendJsonl(occurrenceFile, { kind: 'close', collectedAt, id: event.id })
      }
      return { opened: seen.length, closed: closed.length }
    },

    async openEventIds() {
      const all = foldOccurrences(await readJsonl(occurrenceFile))
      return all.filter((item) => !item.closedAt).map((item) => item.id)
    },

    async getEntityStates(entity) {
      const records = await readJsonl(entityStateFile)
      const latest = new Map()

      for (const record of records) {
        if (record.entity !== entity) continue
        const previous = latest.get(record.entityId)
        if (!previous || new Date(record.updatedAt) >= new Date(previous.updatedAt)) {
          latest.set(record.entityId, record)
        }
      }

      return [...latest.values()].map((record) => ({
        entityId: record.entityId,
        state: record.state,
      }))
    },

    async setEntityStates(entity, entries, updatedAt) {
      for (const entry of entries) {
        await appendJsonl(entityStateFile, {
          entity,
          entityId: entry.entityId,
          state: entry.state,
          updatedAt,
        })
      }
      return entries.length
    },

    async insertStateChanges(changedAt, changes) {
      for (const change of changes) {
        await appendJsonl(stateChangeFile, { changedAt, ...change })
      }
      return changes.length
    },

    async queryStateChanges({ from, to, entity = null, limit = 500 }) {
      const start = new Date(from)
      const end = new Date(to)
      const records = await readJsonl(stateChangeFile)

      return records
        .filter((record) => {
          const at = new Date(record.changedAt)
          if (at < start || at > end) return false
          if (entity && record.entity !== entity) return false
          return true
        })
        .sort((a, b) => new Date(b.changedAt) - new Date(a.changedAt))
        .slice(0, limit)
    },

    async listOccurrences({ from, to, open = null, limit = 500 }) {
      const start = new Date(from)
      const end = new Date(to)
      const all = foldOccurrences(await readJsonl(occurrenceFile))

      return all
        .filter((item) => {
          // A ocorrência "existe" no intervalo se nasceu antes do fim e não
          // fechou antes do começo.
          if (new Date(item.firstSeen) > end) return false
          const closedAt = item.closedAt ? new Date(item.closedAt) : end
          if (closedAt < start) return false
          if (open === true && item.closedAt) return false
          if (open === false && !item.closedAt) return false
          return true
        })
        .slice(0, limit)
    },

    async insertFrame({ collectedAt, payload, sourcesOk = [], sourcesFailed = [] }) {
      const serialized = JSON.stringify(payload || {})
      const line = JSON.stringify({
        collectedAt,
        payload,
        payloadBytes: Buffer.byteLength(serialized),
        sourcesOk,
        sourcesFailed,
      })
      await fs.mkdir(dir, { recursive: true })
      await fs.appendFile(frameFileFor(collectedAt), `${line}\n`, 'utf8')
      return Buffer.byteLength(serialized)
    },

    async listFrames({ from, to, limit = 2000 }) {
      const frames = await readFrames(from, to, limit)
      return frames.map((frame) => ({
        collectedAt: frame.collectedAt,
        payloadBytes: frame.payloadBytes,
        sourcesOk: frame.sourcesOk,
        sourcesFailed: frame.sourcesFailed,
      }))
    },

    // Remove arquivos de dia inteiramente anteriores ao corte e devolve quantos
    // arquivos foram apagados (não quantos frames — o arquivo é a unidade de
    // remoção aqui). Um arquivo do dia D cobre [D 00:00, D+1 00:00), então só é
    // removido quando o FIM do dia ainda é anterior ao corte.
    async pruneFrames(before) {
      const cutoff = new Date(before).getTime()
      if (!Number.isFinite(cutoff)) return 0

      let entries
      try {
        entries = await fs.readdir(dir)
      } catch {
        return 0
      }

      let removed = 0
      for (const name of entries) {
        const match = /^frames-(\d{4}-\d{2}-\d{2})\.jsonl$/.exec(name)
        if (!match) continue

        const dayStart = new Date(`${match[1]}T00:00:00.000Z`).getTime()
        if (!Number.isFinite(dayStart)) continue
        // +1 ms para incluir o último instante do dia.
        const dayEnd = dayStart + 24 * 60 * 60 * 1000 - 1
        if (dayEnd < cutoff) {
          try {
            await fs.rm(`${dir}/${name}`, { force: true })
            removed += 1
          } catch {
            /* arquivo já removido ou sem permissão: segue */
          }
        }
      }

      return removed
    },

    async getFrameAt(when) {
      const target = new Date(when)
      const frames = await readFrames(
        new Date(target.getTime() - FRAME_LOOKBACK_MS),
        target,
        Number.MAX_SAFE_INTEGER,
      )
      const { snapshot } = pickFrameAt(frames, target)

      // O próximo frame é buscado à parte porque fica fora da janela lida.
      const ahead = await readFrames(target, new Date(target.getTime() + FRAME_LOOKBACK_MS), 1)
      const next = ahead.find((frame) => new Date(frame.collectedAt) > target) || null

      return { snapshot, next }
    },

    async insertSamples(collectedAt, samples) {
      if (!samples.length) return 0
      // Recria o diretório se necessário: o schema é verificado uma única vez,
      // mas o diretório pode ter sido removido entre as coletas.
      await fs.mkdir(dir, { recursive: true })
      const lines = samples
        .map((sample) => JSON.stringify({ collectedAt, ...sample }))
        .join('\n')
      await fs.appendFile(fileFor(collectedAt), `${lines}\n`, 'utf8')
      return samples.length
    },

    async queryRange({ from, to, source = null, limit = 5000 }) {
      const start = new Date(from)
      const end = new Date(to)
      const results = []

      for (let day = new Date(toDayKey(start)); day <= end; day.setUTCDate(day.getUTCDate() + 1)) {
        let content
        try {
          content = await fs.readFile(fileFor(day), 'utf8')
        } catch {
          continue
        }

        for (const line of content.split('\n')) {
          if (!line.trim()) continue
          let record
          try {
            record = JSON.parse(line)
          } catch {
            continue
          }
          const at = new Date(record.collectedAt)
          if (at < start || at > end) continue
          if (source && record.source !== source) continue
          results.push(record)
        }
      }

      return results
        .sort((a, b) => new Date(a.collectedAt) - new Date(b.collectedAt))
        .slice(0, limit)
    },

    async close() {},
  }
}
