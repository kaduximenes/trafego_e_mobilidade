// Handlers HTTP do histórico, compartilhados entre o servidor de produção
// (Express) e o de desenvolvimento (Vite), para que dev e produção tenham o
// mesmo comportamento.
//
// POST /api/collect  → dispara uma coleta e grava as amostras.
// GET  /api/metrics  → lê o intervalo pedido (from, to, source, limit).
//
// O POST é protegido por COLLECT_SECRET: sem ele, coletar fica aberto e qualquer
// visitante poderia encher o banco. A comparação é feita em tempo constante para
// não vazar o segredo por diferença de tempo de resposta.

import { timingSafeEqual } from 'node:crypto'
import { createMetricStore, METRIC_SOURCES } from './metricStore.js'
import { collectAll } from './collector.js'

const DEFAULT_WINDOW_HOURS = 24
const MAX_WINDOW_HOURS = 24 * 31
const MAX_LIMIT = 20000
const DEFAULT_LIMIT = 2000

function safeEqual(a, b) {
  const left = Buffer.from(String(a ?? ''))
  const right = Buffer.from(String(b ?? ''))
  if (left.length !== right.length) return false
  return timingSafeEqual(left, right)
}

function readHeader(req, name) {
  const value = req.headers?.[name]
  return Array.isArray(value) ? value[0] : value
}

export function isCollectAuthorized(req, env = {}) {
  const secret = env.COLLECT_SECRET
  if (!secret) return false

  const provided =
    readHeader(req, 'x-collect-secret') ||
    (readHeader(req, 'authorization') || '').replace(/^Bearer\s+/i, '')

  return safeEqual(provided, secret)
}

function parseDate(value, fallback) {
  if (!value) return fallback
  const parsed = new Date(value)
  return Number.isNaN(parsed.getTime()) ? fallback : parsed
}

function clampWindow(from, to) {
  const maxMs = MAX_WINDOW_HOURS * 60 * 60 * 1000
  if (to - from <= maxMs) return { from, to }
  return { from: new Date(to.getTime() - maxMs), to }
}

// `store` é opcional: nos testes e em /api/metrics quando não há banco, o
// handler pode receber um store já pronto em vez de criar um novo a cada chamada.
export function createHistoryHandlers(env = {}) {
  let storePromise = null

  const getStore = () => {
    if (!storePromise) storePromise = createMetricStore(env)
    return storePromise
  }

  return {
    async collect(req, res) {
      if (!env.COLLECT_SECRET) {
        res.statusCode = 503
        res.setHeader('Content-Type', 'application/json')
        res.end(JSON.stringify({ error: 'COLLECT_SECRET não configurado no servidor.' }))
        return
      }

      if (!isCollectAuthorized(req, env)) {
        res.statusCode = 401
        res.setHeader('Content-Type', 'application/json')
        res.end(JSON.stringify({ error: 'Segredo de coleta ausente ou inválido.' }))
        return
      }

      try {
        const result = await collectAll(env)
        const store = await getStore()
        const inserted = await store.insertSamples(result.collectedAt, result.samples)

        res.setHeader('Content-Type', 'application/json')
        res.end(
          JSON.stringify({
            collectedAt: result.collectedAt,
            inserted,
            driver: store.name,
            ok: result.ok,
            failed: result.failed,
            sources: result.samples.map((sample) => ({
              source: sample.source,
              ok: sample.ok,
              error: sample.error,
            })),
          }),
        )
      } catch (err) {
        res.statusCode = 500
        res.setHeader('Content-Type', 'application/json')
        res.end(JSON.stringify({ error: err?.message || 'Falha ao coletar métricas.' }))
      }
    },

    async metrics(req, res) {
      try {
        const url = new URL(req.url || '/', 'http://localhost')
        const to = parseDate(url.searchParams.get('to'), new Date())
        const from = parseDate(
          url.searchParams.get('from'),
          new Date(to.getTime() - DEFAULT_WINDOW_HOURS * 60 * 60 * 1000),
        )
        const window = clampWindow(from, to)

        const sourceParam = url.searchParams.get('source')
        const source = METRIC_SOURCES.includes(sourceParam) ? sourceParam : null

        const limitParam = Number(url.searchParams.get('limit'))
        const limit =
          Number.isFinite(limitParam) && limitParam > 0
            ? Math.min(Math.floor(limitParam), MAX_LIMIT)
            : DEFAULT_LIMIT

        const store = await getStore()
        const samples = await store.queryRange({ ...window, source, limit })

        res.setHeader('Content-Type', 'application/json')
        res.end(
          JSON.stringify({
            from: window.from.toISOString(),
            to: window.to.toISOString(),
            source,
            count: samples.length,
            samples,
          }),
        )
      } catch (err) {
        res.statusCode = 500
        res.setHeader('Content-Type', 'application/json')
        res.end(JSON.stringify({ error: err?.message || 'Falha ao ler o histórico.' }))
      }
    },
  }
}
