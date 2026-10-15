// Rotas de proxy compartilhadas entre o servidor de desenvolvimento (Vite)
// e o servidor de produção (Express).
//
// Motivo: as APIs do COR e do Antares NÃO enviam cabeçalhos CORS, então o
// navegador só consegue consumi-las através de um proxy same-origin. O Tixxi é
// um gateway público, mas passa pelo mesmo proxy porque o login carrega as
// credenciais — expô-las no bundle (VITE_* é embutido em tempo de build) as
// tornaria públicas.

export const proxyRoutes = [
  {
    prefix: '/api/tixxi',
    // Gateway público do Tixxi, que substituiu a antiga rede interna do COR
    // (10.50.3.96:8000). Roteia pelo query string: /stream/?api/auth/login.
    resolveTarget: (env) => env.TIXXI_TARGET || 'https://api.tixxi.rio/stream/',
    secure: true,
    // O caminho da API vai no query string (ex.: /stream/?api/cameras).
    queryPath: true,
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

// Remove o prefixo do proxy do caminho. Nas rotas que roteiam pelo query string
// (Tixxi), move o restante do caminho para o query string do destino.
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
