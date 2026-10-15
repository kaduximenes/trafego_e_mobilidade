// Rotas de proxy compartilhadas entre o servidor de desenvolvimento (Vite)
// e o servidor de produção (Express).
//
// Motivo: as APIs do COR e do Antares NÃO enviam cabeçalhos CORS, então o
// navegador só consegue consumi-las através de um proxy same-origin. A API das
// câmeras passa pelo mesmo proxy porque o login carrega credenciais — expô-las
// no bundle (VITE_* é embutido em tempo de build) as tornaria públicas.

export const proxyRoutes = [
  {
    prefix: '/api/tixxi',
    // API de câmeras do COR. TIXXI_TARGET mantém a possibilidade de apontar
    // para outro servidor sem expor credenciais no cliente.
    resolveTarget: (env) => env.TIXXI_TARGET || 'http://10.50.3.96:8000',
    secure: false,
  },
  {
    prefix: '/api/corio-events',
    resolveTarget: () => 'https://api.corio-oncall.com.br/hxgnEvents/api/Events',
    secure: false,
  },
  {
    prefix: '/api/antares',
    resolveTarget: () => 'https://antares-cetrj.dataprom.com',
    secure: false,
  },
]

// Remove o prefixo do proxy do caminho. Rotas com queryPath movem o restante
// do caminho para o query string do destino.
export function rewriteProxyPath(route, path) {
  const rest = path.replace(new RegExp(`^${route.prefix}`), '')
  if (!route.queryPath) return rest
  // Sem caminho restante (pedido à raiz do prefixo) devolve vazio, para não
  // enviar um `?` solto ao gateway.
  const apiPath = rest.replace(/^\/+/, '')
  return apiPath ? `?${apiPath}` : ''
}

// Monta as opções no formato esperado pelo Vite (server.proxy).
export function buildViteProxy(env) {
  const proxy = {}
  for (const route of proxyRoutes) {
    proxy[route.prefix] = {
      target: route.resolveTarget(env),
      changeOrigin: true,
      secure: route.secure ?? false,
      rewrite: (path) => rewriteProxyPath(route, path),
    }
  }
  return proxy
}
