// Rotas de proxy compartilhadas entre o servidor de desenvolvimento (Vite)
// e o servidor de produção (Express).
//
// Motivo: tanto a API do COR quanto a do Antares NÃO enviam cabeçalhos CORS,
// então o navegador só consegue consumi-las através de um proxy same-origin.
// Em produção o proxy também evita expor credenciais no bundle (VITE_* é
// embutido no JavaScript em tempo de build).

export const proxyRoutes = [
  {
    prefix: '/api/tixxi',
    // Rede interna do COR; não é alcançável a partir da internet pública.
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
  {
    prefix: '/api/waze',
    resolveTarget: () => 'https://www.waze.com/row-partnerhub-api',
    secure: false,
  },
]

// Monta as opções no formato esperado pelo Vite (server.proxy).
export function buildViteProxy(env) {
  const proxy = {}
  for (const route of proxyRoutes) {
    proxy[route.prefix] = {
      target: route.resolveTarget(env),
      changeOrigin: true,
      secure: route.secure ?? false,
      rewrite: (path) => path.replace(new RegExp(`^${route.prefix}`), ''),
    }
  }
  return proxy
}
