// Testes das rotas de proxy compartilhadas entre dev (Vite) e produção
// (Express). O ponto sensível é o roteamento do gateway do Tixxi, que leva o
// caminho da API no query string: /stream/?api/auth/login.

import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { buildViteProxy, proxyRoutes, rewriteProxyPath } from './proxyRoutes.js'

const tixxi = proxyRoutes.find((route) => route.prefix === '/api/tixxi')
const corio = proxyRoutes.find((route) => route.prefix === '/api/corio-events')
const antares = proxyRoutes.find((route) => route.prefix === '/api/antares')

describe('rotas de proxy', () => {
  it('aponta o Tixxi para o gateway público por padrão', () => {
    assert.equal(tixxi.resolveTarget({}), 'https://api.tixxi.rio/stream/')
    assert.equal(tixxi.secure, true)
  })

  it('permite sobrescrever o destino do Tixxi pelo ambiente', () => {
    const env = { TIXXI_TARGET: 'http://127.0.0.1:9000/stream/' }
    assert.equal(tixxi.resolveTarget(env), 'http://127.0.0.1:9000/stream/')
  })

  it('move o caminho do Tixxi para o query string do destino', () => {
    assert.equal(rewriteProxyPath(tixxi, '/api/tixxi/api/auth/login'), '?api/auth/login')
    assert.equal(rewriteProxyPath(tixxi, '/api/tixxi/api/cameras'), '?api/cameras')
  })

  it('não envia um `?` solto quando o pedido é a raiz do prefixo', () => {
    assert.equal(rewriteProxyPath(tixxi, '/api/tixxi'), '')
    assert.equal(rewriteProxyPath(tixxi, '/api/tixxi/'), '')
  })

  it('mantém o caminho nas rotas que não roteiam por query string', () => {
    assert.equal(rewriteProxyPath(corio, '/api/corio-events/Login'), '/Login')
    assert.equal(rewriteProxyPath(antares, '/api/antares/controlador/estado'), '/controlador/estado')
  })

  it('monta as mesmas opções para o proxy do Vite', () => {
    const proxy = buildViteProxy({})

    assert.equal(proxy['/api/tixxi'].target, 'https://api.tixxi.rio/stream/')
    assert.equal(proxy['/api/tixxi'].secure, true)
    assert.equal(proxy['/api/tixxi'].rewrite('/api/tixxi/api/cameras'), '?api/cameras')
    // Rotas sem TLS mantêm `secure: false` para não exigir certificado válido.
    assert.equal(proxy['/api/antares'].secure, false)
    assert.equal(proxy['/api/antares'].rewrite('/api/antares/controlador/estado'), '/controlador/estado')
  })
})
