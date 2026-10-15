import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig, loadEnv } from 'vite'
import { buildViteProxy } from './shared/proxyRoutes.js'
import { createWazeFeedHandler } from './shared/wazeFeed.js'
import { createHistoryHandlers } from './shared/history/routes.js'
import { createHealthHandler } from './shared/health.js'
import { corioLoginResponse, tixxiLoginResponse } from './shared/upstreamSession.js'

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

  // O login do COR e do Tixxi é respondido aqui, e não repassado ao upstream: as
  // duas APIs só admitem UMA sessão por vez, então devolver o token já existente
  // (shared/upstreamSession.js) evita que a UI e o coletor derrubem um ao outro.
  const loginMiddlewares = (server) => {
    const respond = (res, { status, body }) => {
      res.statusCode = status
      res.setHeader('Content-Type', 'application/json')
      res.end(JSON.stringify(body))
    }

    const handleLogin = (responseFor) => async (req, res, next) => {
      if (req.method !== 'POST') return next()
      // O corpo não é usado (as credenciais vêm do servidor), mas precisa ser
      // drenado para a conexão não ficar pendurada.
      req.resume()
      respond(res, await responseFor(env))
    }

    server.middlewares.use('/api/corio-events/Login', handleLogin(corioLoginResponse))
    server.middlewares.use('/api/tixxi/api/auth/login', handleLogin(tixxiLoginResponse))
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
          loginMiddlewares(server)
          server.middlewares.use('/api/waze-feed', wazeFeed)
          historyMiddlewares(server)
        },
        configurePreviewServer: (server) => {
          loginMiddlewares(server)
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
