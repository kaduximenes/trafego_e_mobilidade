// Servidor de produção: serve o build estático do Vite e faz proxy das APIs
// que não enviam CORS (COR, Antares, Waze).
//
// Credenciais ficam SOMENTE aqui (variáveis de ambiente do servidor) — nunca
// no bundle do navegador, diferente de VITE_*, que é embutido em tempo de build.

import express from 'express'
import { createProxyMiddleware, fixRequestBody } from 'http-proxy-middleware'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { proxyRoutes, rewriteProxyPath } from '../shared/proxyRoutes.js'
import { corioLoginResponse, tixxiLoginResponse } from '../shared/upstreamSession.js'
import { createWazeFeedHandler } from '../shared/wazeFeed.js'
import { createHealthHandler } from '../shared/health.js'
import { createHistoryHandlers, startBackgroundCollector } from '../shared/history/routes.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const DIST_DIR = path.resolve(__dirname, '..', 'dist')

const PORT = process.env.PORT || 5173

// Chaves consumidas apenas pelo servidor (nunca chegam ao cliente).
// As credenciais do COR e do Tixxi ficam em shared/upstreamSession.js, que é
// quem faz o login único de cada upstream.
const ANTARES_API_KEY = process.env.ANTARES_API_KEY || ''

const app = express()
app.disable('x-powered-by')

app.get('/healthz', createHealthHandler(process.env))

// Feed do Waze: o token do parceiro fica só no servidor (a URL nunca chega ao
// navegador) e o cache evita baixar ~1 MB por visitante a cada polling.
app.get('/api/waze-feed', createWazeFeedHandler(process.env))

// Histórico: POST /api/collect grava uma amostra de métricas por fonte e o
// frame do momento; as rotas GET servem a série, o replay e a linha do tempo.
// O POST exige COLLECT_SECRET, porque o agendador (GitHub Actions/Render Cron)
// chama o endpoint de fora.
const history = createHistoryHandlers(process.env)
app.post('/api/collect', (req, res) => history.collect(req, res))
app.get('/api/metrics', (req, res) => history.metrics(req, res))
app.get('/api/snapshot', (req, res) => history.snapshot(req, res))
app.get('/api/frames', (req, res) => history.frames(req, res))
app.get('/api/occurrences', (req, res) => history.occurrences(req, res))
app.get('/api/state-changes', (req, res) => history.stateChanges(req, res))

// Coleta automática no servidor: cobre o período em que a instância está
// acordada (deploy, visitantes, ou o cron que a desperta). O agendador externo
// continua sendo necessário para acordar a instância quando ninguém a acessa.
const collectIntervalMs = Number(process.env.COLLECT_INTERVAL_MINUTES || 15) * 60 * 1000
startBackgroundCollector(process.env, { intervalMs: collectIntervalMs }).start()

// O login do COR e do Tixxi é resolvido AQUI, e não repassado ao upstream.
// As duas APIs só admitem uma sessão por vez: se o navegador e o coletor
// logassem cada um por conta própria, um derrubaria o token do outro (o COR
// responde 400 "Invalid token" e o Tixxi, 429/403). O servidor mantém a sessão
// única (shared/upstreamSession.js) e devolve o token já existente.
app.post('/api/corio-events/Login', express.json(), async (req, res) => {
  const { status, body } = await corioLoginResponse(process.env)
  res.status(status).json(body)
})

app.post('/api/tixxi/api/auth/login', express.urlencoded({ extended: true }), async (req, res) => {
  const { status, body } = await tixxiLoginResponse(process.env)
  res.status(status).json(body)
})

for (const route of proxyRoutes) {
  app.use(
    route.prefix,
    createProxyMiddleware({
      target: route.resolveTarget(process.env),
      changeOrigin: true,
      secure: route.secure ?? false,
      pathRewrite: (pathname) => rewriteProxyPath(route, pathname),
      // Injeta as credenciais no servidor para que nunca cheguem ao navegador.
      on: {
        proxyReq: (proxyReq, req, res) => {
          if (route.prefix === '/api/antares' && ANTARES_API_KEY) {
            proxyReq.setHeader('API-Key', ANTARES_API_KEY)
          }
          if (req.body && Object.keys(req.body).length > 0) {
            fixRequestBody(proxyReq, req, res)
          }
        },
      },
    }),
  )
}

// Arquivos estáticos gerados por `vite build`, com fallback de SPA.
app.use(express.static(DIST_DIR, { index: false }))

app.get(/^\/(?!api\/).*/, (_req, res) => {
  res.sendFile(path.join(DIST_DIR, 'index.html'))
})

app.listen(PORT, '0.0.0.0', () => {
  console.log(`trafego-iacor ouvindo em http://0.0.0.0:${PORT}`)
})
