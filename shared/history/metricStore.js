// Persistência do histórico: métricas compactas (série temporal) e frames
// (estado completo compacto, para o replay do mapa).
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
