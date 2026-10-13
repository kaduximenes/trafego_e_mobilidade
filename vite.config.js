import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig, loadEnv } from 'vite'
import { buildViteProxy } from './shared/proxyRoutes.js'
import { createWazeFeedHandler } from './shared/wazeFeed.js'
import { createHistoryHandlers } from './shared/history/routes.js'
import { createHealthHandler } from './shared/health.js'

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  // Carrega o .env do projeto (o Vite só expõe variáveis com prefixo VITE_ ao
  // cliente; aqui usamos loadEnv para ler WAZE_FEED_URL e mantê-la no servidor).
  const env = loadEnv(mode, process.cwd(), '')
  const wazeFeed = createWazeFeedHandler(env)
  const history = createHistoryHandlers(env)
  const health = createHealthHandler(env)
  const proxy = buildViteProxy(env)

  proxy['/api/antares'].configure = (proxyServer) => {
    proxyServer.on('proxyReq', (proxyReq) => {
      if (env.ANTARES_API_KEY) {
        proxyReq.setHeader('API-Key', env.ANTARES_API_KEY)
      }
    })
  }

  proxy['/api/corio-events'].configure = (proxyServer) => {
    proxyServer.on('proxyReq', (proxyReq, req) => {
      const requestPath = new URL(req.url, 'http://localhost').pathname
      if (req.method !== 'POST' || !requestPath.endsWith('/Login')) return

      const body = JSON.stringify({
        UserName: env.CORIO_EVENTS_USERNAME || 'APIOpenedEvent',
        Password: env.CORIO_EVENTS_PASSWORD || '12345',
      })
      proxyReq.setHeader('Content-Type', 'application/json')
      proxyReq.setHeader('Content-Length', Buffer.byteLength(body))
      proxyReq.write(body)
    })
  }

  // Middlewares das rotas do histórico, compartilhados entre dev e preview.
  const historyMiddlewares = (server) => {
    // /healthz no dev: mostra qual driver de histórico está ativo. É o mesmo
    // handler da produção, para que a verificação do README valha nos dois.
    server.middlewares.use('/healthz', (req, res, next) =>
      req.method === 'GET' ? health(req, res) : next(),
    )
    server.middlewares.use('/api/collect', (req, res, next) =>
      req.method === 'POST' ? history.collect(req, res) : next(),
    )
    server.middlewares.use('/api/metrics', (req, res, next) =>
      req.method === 'GET' ? history.metrics(req, res) : next(),
    )
    server.middlewares.use('/api/snapshot', (req, res, next) =>
      req.method === 'GET' ? history.snapshot(req, res) : next(),
    )
    server.middlewares.use('/api/frames', (req, res, next) =>
      req.method === 'GET' ? history.frames(req, res) : next(),
    )
    server.middlewares.use('/api/occurrences', (req, res, next) =>
      req.method === 'GET' ? history.occurrences(req, res) : next(),
    )
    server.middlewares.use('/api/state-changes', (req, res, next) =>
      req.method === 'GET' ? history.stateChanges(req, res) : next(),
    )
  }

  return {
    plugins: [
      react(),
      tailwindcss(),
      // Endpoint dev do feed do Waze: mesmo formato e cache do servidor de
      // produção, e mantém o token do parceiro fora do bundle.
      {
        name: 'waze-feed-dev-endpoint',
        configureServer: (server) => {
          server.middlewares.use('/api/waze-feed', wazeFeed)
          historyMiddlewares(server)
        },
        configurePreviewServer: (server) => {
          server.middlewares.use('/api/waze-feed', wazeFeed)
          historyMiddlewares(server)
        },
      },
    ],
    server: {
      // As mesmas rotas de proxy usadas pelo servidor de producao (server/index.js),
      // para que dev e producao tenham comportamento identico.
      proxy,
    },
  }
})
