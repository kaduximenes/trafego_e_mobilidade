// Handlers HTTP do histórico, compartilhados entre o servidor de produção
// (Express) e o de desenvolvimento (Vite), para que dev e produção tenham o
// mesmo comportamento.
//
// POST /api/collect   → dispara uma coleta, grava métricas e o frame do momento.
// GET  /api/metrics   → lê o intervalo pedido (from, to, source, limit).
// GET  /api/snapshot  → estado do mapa em um instante (?at=), para o replay.
// GET  /api/frames    → instantes de frame disponíveis na janela (linha do tempo).
//
// O POST é protegido por COLLECT_SECRET: sem ele, coletar fica aberto e qualquer
// visitante poderia encher o banco. A comparação é feita em tempo constante para
// não vazar o segredo por diferença de tempo de resposta.

import { timingSafeEqual } from 'node:crypto'
import { createMetricStore, METRIC_SOURCES } from './metricStore.js'
import { buildFramePayload, collectAll } from './collector.js'

const DEFAULT_WINDOW_HOURS = 24
const MAX_WINDOW_HOURS = 24 * 31
const MAX_LIMIT = 20000
const DEFAULT_LIMIT = 2000
const DEFAULT_FRAME_LIMIT = 5000

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

        const sourcesOk = result.samples.filter((s) => s.ok).map((s) => s.source)
        const sourcesFailed = result.samples.filter((s) => !s.ok).map((s) => s.source)

        // O frame é gravado junto das métricas: assim o replay do mapa tem
        // exatamente o mesmo instante da série temporal.
        const payloadBytes = await store.insertFrame({
          collectedAt: result.collectedAt,
          payload: buildFramePayload(result.samples),
          sourcesOk,
          sourcesFailed,
        })

        res.setHeader('Content-Type', 'application/json')
        res.end(
          JSON.stringify({
            collectedAt: result.collectedAt,
            inserted,
            payloadBytes,
            driver: store.name,
            ok: result.ok,
            failed: sourcesFailed,
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

    // Estado do mapa em um instante. O cliente usa para montar o replay: servimos
    // o frame em ou antes de `at` (o que estava valendo naquele momento) e o
    // próximo disponível, para a linha do tempo conhecer o intervalo.
    async snapshot(req, res) {
      try {
        const url = new URL(req.url || '/', 'http://localhost')
        const at = parseDate(url.searchParams.get('at'), new Date())

        const store = await getStore()
        const { snapshot, next } = await store.getFrameAt(at)

        res.setHeader('Content-Type', 'application/json')
        res.statusCode = snapshot ? 200 : 404
        res.end(
          JSON.stringify({
            requestedAt: at.toISOString(),
            available: Boolean(snapshot),
            // `at` é o instante real do frame: pode ser anterior ao pedido, e o
            // cliente precisa saber disso para rotular a tela corretamente.
            at: snapshot?.collectedAt || null,
            effectiveLagMs: snapshot ? at - new Date(snapshot.collectedAt) : null,
            sourcesOk: snapshot?.sourcesOk || [],
            sourcesFailed: snapshot?.sourcesFailed || [],
            nextAt: next?.collectedAt || null,
            payload: snapshot?.payload || null,
          }),
        )
      } catch (err) {
        res.statusCode = 500
        res.setHeader('Content-Type', 'application/json')
        res.end(JSON.stringify({ error: err?.message || 'Falha ao ler o snapshot.' }))
      }
    },

    // Instantes de frame disponíveis: é o que a barra de linha do tempo usa para
    // saber onde há dados e onde há buraco.
    async frames(req, res) {
      try {
        const url = new URL(req.url || '/', 'http://localhost')
        const to = parseDate(url.searchParams.get('to'), new Date())
        const from = parseDate(
          url.searchParams.get('from'),
          new Date(to.getTime() - DEFAULT_WINDOW_HOURS * 60 * 60 * 1000),
        )
        const window = clampWindow(from, to)

        const limitParam = Number(url.searchParams.get('limit'))
        const limit =
          Number.isFinite(limitParam) && limitParam > 0
            ? Math.min(Math.floor(limitParam), MAX_LIMIT)
            : DEFAULT_FRAME_LIMIT

        const store = await getStore()
        const frames = await store.listFrames({ ...window, limit })

        res.setHeader('Content-Type', 'application/json')
        res.end(
          JSON.stringify({
            from: window.from.toISOString(),
            to: window.to.toISOString(),
            count: frames.length,
            frames,
          }),
        )
      } catch (err) {
        res.statusCode = 500
        res.setHeader('Content-Type', 'application/json')
        res.end(JSON.stringify({ error: err?.message || 'Falha ao listar os frames.' }))
      }
    },
  }
}
