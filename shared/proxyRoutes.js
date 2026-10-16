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
    // Gateway público do Tixxi. A API interna do COR (10.50.3.96:8000) não é
    // alcançável da hospedagem (Render). Roteia pelo query string:
    // /stream/?api/auth/login.
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

// Remove o prefixo do proxy do caminho. Rotas marcadas com queryPath movem o
// restante do caminho para o query string do destino.
export function rewriteProxyPath(route, path) {
  const rest = path.replace(new RegExp(`^${route.prefix}`), '')
  if (!route.queryPath) return rest
  // Sem caminho restante (pedido à raiz do prefixo) devolve vazio.
  const apiPath = rest.replace(/^\/+/, '')
  return apiPath ? `?${apiPath}` : ''
}

// URL completa no upstream para um caminho da API (ex.: '/api/cameras'), com a
// mesma regra do proxy. Usada pelo servidor quando chama o upstream direto.
export function upstreamUrl(prefix, env, apiPath) {
  const route = proxyRoutes.find((item) => item.prefix === prefix)
  const base = route?.resolveTarget(env)
  if (!base) return null
  const rest = rewriteProxyPath(route, `${prefix}${apiPath}`)
  return route.queryPath ? `${base}${rest}` : `${base.replace(/\/+$/, '')}${rest}`
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
