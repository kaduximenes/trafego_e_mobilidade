import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig, loadEnv } from 'vite'
import { buildViteProxy } from './shared/proxyRoutes.js'
import { createWazeFeedHandler } from './shared/wazeFeed.js'

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  // Carrega o .env do projeto (o Vite só expõe variáveis com prefixo VITE_ ao
  // cliente; aqui usamos loadEnv para ler WAZE_FEED_URL e mantê-la no servidor).
  const env = loadEnv(mode, process.cwd(), '')
  const wazeFeed = createWazeFeedHandler(env)
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
        },
        configurePreviewServer: (server) => {
          server.middlewares.use('/api/waze-feed', wazeFeed)
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
