// Servidor de produção: serve o build estático do Vite e faz proxy das APIs
// que não enviam CORS (COR, Antares, Waze).
//
// Credenciais ficam SOMENTE aqui (variáveis de ambiente do servidor) — nunca
// no bundle do navegador, diferente de VITE_*, que é embutido em tempo de build.

import express from 'express'
import { createProxyMiddleware, fixRequestBody } from 'http-proxy-middleware'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { proxyRoutes } from '../shared/proxyRoutes.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const DIST_DIR = path.resolve(__dirname, '..', 'dist')

const PORT = process.env.PORT || 5173

// Chaves consumidas apenas pelo servidor (nunca chegam ao cliente).
const ANTARES_API_KEY = process.env.ANTARES_API_KEY || ''
const WAZE_API_KEY = process.env.WAZE_API_KEY || ''
const CORIO_USERNAME = process.env.CORIO_EVENTS_USERNAME || 'APIOpenedEvent'
const CORIO_PASSWORD = process.env.CORIO_EVENTS_PASSWORD || '12345'

const app = express()
app.disable('x-powered-by')

app.get('/healthz', (_req, res) => {
  res.json({
    status: 'ok',
    antaresKeyConfigured: Boolean(ANTARES_API_KEY),
    wazeKeyConfigured: Boolean(WAZE_API_KEY),
  })
})

// Intercepta o Login do COR: o cliente não precisa conhecer as credenciais,
// elas são injetadas aqui (e nunca entram no bundle do navegador).
// GraphQL/REST bodies já lidos pelo express precisam ser reescritos de volta no
// stream para o proxy — por isso o fixRequestBody.
app.post('/api/corio-events/Login', express.json(), (req, _res, next) => {
  req.body = { UserName: CORIO_USERNAME, Password: CORIO_PASSWORD }
  next()
})

for (const route of proxyRoutes) {
  app.use(
    route.prefix,
    createProxyMiddleware({
      target: route.resolveTarget(process.env),
      changeOrigin: true,
      secure: route.secure ?? false,
      pathRewrite: (pathname) => pathname.replace(new RegExp(`^${route.prefix}`), ''),
      // Injeta as credenciais no servidor para que nunca cheguem ao navegador.
      on: {
        proxyReq: (proxyReq, req, res) => {
          if (route.prefix === '/api/antares' && ANTARES_API_KEY) {
            proxyReq.setHeader('API-Key', ANTARES_API_KEY)
          }
          if (route.prefix === '/api/waze' && WAZE_API_KEY) {
            proxyReq.setHeader('Authorization', `Bearer ${WAZE_API_KEY}`)
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
