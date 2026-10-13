// Persistência do histórico de métricas.
//
// Dois drivers, escolhidos por variável de ambiente:
//   - Postgres (DATABASE_URL)  → produção
//   - JSONL    (HISTORY_DIR)   → desenvolvimento local, sem banco
//
// O driver de arquivo NÃO serve para produção: em hospedagem com disco efêmero
// (ex.: plano gratuito do Render) o conteúdo se perde a cada deploy/restart. Ele
// existe para rodar e testar a coleta sem depender de um banco.
//
// A tabela é desenhada para ser pequena: uma linha por fonte por coleta, com as
// métricas consolidadas em jsonb — não o payload bruto das APIs.

import fs from 'node:fs/promises'

const TABLE = 'metric_sample'

export const METRIC_SOURCES = ['ocorrencias', 'waze', 'semaforos', 'cameras']

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

  return {
    name: 'file',

    async ensureSchema() {
      await fs.mkdir(dir, { recursive: true })
    },

    async insertSamples(collectedAt, samples) {
      if (!samples.length) return 0
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
