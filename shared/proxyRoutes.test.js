// Testes das rotas de proxy compartilhadas entre dev (Vite) e produção
// (Express). A API de câmeras usa caminhos convencionais (/api/auth/login,
// /api/cameras) e fica atrás de um proxy same-origin.

import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { buildViteProxy, proxyRoutes, rewriteProxyPath } from './proxyRoutes.js'

const tixxi = proxyRoutes.find((route) => route.prefix === '/api/tixxi')
const corio = proxyRoutes.find((route) => route.prefix === '/api/corio-events')
const antares = proxyRoutes.find((route) => route.prefix === '/api/antares')

describe('rotas de proxy', () => {
  it('aponta a API de câmeras para o serviço do COR por padrão', () => {
    assert.equal(tixxi.resolveTarget({}), 'http://10.50.3.96:8000')
    assert.equal(tixxi.secure, false)
  })

  it('permite sobrescrever o destino da API de câmeras pelo ambiente', () => {
    const env = { TIXXI_TARGET: 'http://127.0.0.1:9000' }
    assert.equal(tixxi.resolveTarget(env), 'http://127.0.0.1:9000')
  })

  it('mantém os caminhos da API de câmeras no destino', () => {
    assert.equal(rewriteProxyPath(tixxi, '/api/tixxi/api/auth/login'), '/api/auth/login')
    assert.equal(rewriteProxyPath(tixxi, '/api/tixxi/api/cameras'), '/api/cameras')
  })

  it('preserva a raiz quando o pedido não tem caminho após o prefixo', () => {
    assert.equal(rewriteProxyPath(tixxi, '/api/tixxi'), '')
    assert.equal(rewriteProxyPath(tixxi, '/api/tixxi/'), '/')
  })

  it('mantém o caminho nas rotas que não roteiam por query string', () => {
    assert.equal(rewriteProxyPath(corio, '/api/corio-events/Login'), '/Login')
    assert.equal(rewriteProxyPath(antares, '/api/antares/controlador/estado'), '/controlador/estado')
  })

  it('monta as mesmas opções para o proxy do Vite', () => {
    const proxy = buildViteProxy({})

    assert.equal(proxy['/api/tixxi'].target, 'http://10.50.3.96:8000')
    assert.equal(proxy['/api/tixxi'].secure, false)
    assert.equal(proxy['/api/tixxi'].rewrite('/api/tixxi/api/cameras'), '/api/cameras')
    // Rotas sem TLS mantêm `secure: false` para não exigir certificado válido.
    assert.equal(proxy['/api/antares'].secure, false)
    assert.equal(proxy['/api/antares'].rewrite('/api/antares/controlador/estado'), '/controlador/estado')
  })
})
