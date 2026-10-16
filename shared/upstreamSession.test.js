// Testes da sessão única por upstream.
//
// O que precisa ficar garantido: o servidor faz UM login e o compartilha com o
// navegador e com o coletor. Sem isso, os dois competem pela única sessão que o
// COR e o Tixxi permitem (400 "Invalid token" e 429/403, respectivamente).

import assert from 'node:assert/strict'
import { afterEach, describe, it } from 'node:test'

import {
  corioLoginResponse,
  corioSession,
  createUpstreamSession,
  resetUpstreamSessions,
  tixxiLoginResponse,
  tixxiSession,
} from './upstreamSession.js'

const TTL_MS = 3600 * 1000
const TIXXI_ENV = { TIXXI_API_KEY: 'k', TIXXI_EMAIL: 'e', TIXXI_PASSWORD: 'p' }

function countingLogin(token = 't1', expiresIn = 3600) {
  const state = { calls: 0 }
  return {
    state,
    login: async () => {
      state.calls += 1
      return { token, expiresIn }
    },
  }
}

describe('sessão de upstream', () => {
  it('faz um único login e reaproveita o token', async () => {
    const { state, login } = countingLogin()
    const session = createUpstreamSession({ login })

    assert.equal(await session.getToken({}), 't1')
    assert.equal(await session.getToken({}), 't1')
    assert.equal(state.calls, 1)
  })

  it('compartilha um único login entre chamadas concorrentes', async () => {
    const { state, login } = countingLogin()
    const session = createUpstreamSession({ login })

    const tokens = await Promise.all([
      session.getToken({}),
      session.getToken({}),
      session.getToken({}),
    ])

    assert.deepEqual(tokens, ['t1', 't1', 't1'])
    assert.equal(state.calls, 1)
  })

  it('refaz o login depois de invalidate()', async () => {
    const { state, login } = countingLogin()
    const session = createUpstreamSession({ login })

    await session.getToken({})
    session.invalidate()
    await session.getToken({})

    assert.equal(state.calls, 2)
  })

  it('renova o token só depois do vencimento (com a folga)', async () => {
    let clock = TTL_MS
    const { state, login } = countingLogin()
    const session = createUpstreamSession({ login, now: () => clock, skewMs: 60000 })

    await session.getToken({})

    // Dentro da validade, com folga de sobra: continua o mesmo token.
    clock += 58 * 60 * 1000
    await session.getToken({})
    assert.equal(state.calls, 1)

    // Passou a folga de 60s do fim: renova.
    clock += 2 * 60 * 1000
    await session.getToken({})
    assert.equal(state.calls, 2)
  })

  it('expoe expiresIn junto do token', async () => {
    const { login } = countingLogin('t1', 1200)
    const session = createUpstreamSession({ login })

    assert.deepEqual(await session.getSession({}), { token: 't1', expiresIn: 1200 })
  })

  it('não cacheia token quando o login falha', async () => {
    let calls = 0
    const session = createUpstreamSession({
      login: async () => {
        calls += 1
        throw new Error('429 Maximum simultaneous connections reached')
      },
    })

    await assert.rejects(() => session.getToken({}), /429/)
    await assert.rejects(() => session.getToken({}), /429/)
    assert.equal(calls, 2)
  })
})

// ------------------------------------------------- login compartilhado (HTTP) --

describe('resposta de login compartilhada', () => {
  const originalFetch = globalThis.fetch

  afterEach(() => {
    globalThis.fetch = originalFetch
    resetUpstreamSessions()
  })

  // O ponto central da correção: navegador e coletor pedem o token e o upstream
  // recebe UM único login.
  it('o navegador e o coletor compartilham um único login no COR', async () => {
    let logins = 0
    globalThis.fetch = async (url) => {
      const target = String(url)
      if (target.includes('/Login')) {
        logins += 1
        return { ok: true, status: 200, text: async () => JSON.stringify({ AccessToken: 'corio-token', ExpiresIn: 3600 }) }
      }
      throw new Error(`fetch não previsto: ${target}`)
    }

    const browser = await corioLoginResponse({})
    const collectorToken = await corioSession.getToken({})

    assert.equal(browser.status, 200)
    assert.equal(browser.body.AccessToken, 'corio-token')
    assert.equal(browser.body.ExpiresIn, 3600)
    assert.equal(collectorToken, 'corio-token')
    assert.equal(logins, 1)
  })

  it('renova a sessão COR no upstream quando o navegador solicita login forçado', async () => {
    let logins = 0
    globalThis.fetch = async (url) => {
      assert.equal(String(url), 'https://api.corio-oncall.com.br/hxgnEvents/api/Events/Login')
      logins += 1
      return {
        ok: true,
        status: 200,
        text: async () => JSON.stringify({ AccessToken: `corio-token-${logins}`, ExpiresIn: 3600 }),
      }
    }

    const first = await corioLoginResponse({})
    const renewed = await corioLoginResponse({}, { force: true })
    const collectorToken = await corioSession.getToken({})

    assert.equal(first.body.AccessToken, 'corio-token-1')
    assert.equal(renewed.body.AccessToken, 'corio-token-2')
    assert.equal(collectorToken, 'corio-token-2')
    assert.equal(logins, 2)
  })

  it('o navegador e o coletor compartilham um único login no Tixxi', async () => {
    let logins = 0
    globalThis.fetch = async (url) => {
      const target = String(url)
      if (target.includes('api/auth/login')) {
        assert.equal(target, 'http://10.50.3.96:8000/api/auth/login')
        logins += 1
        return { ok: true, status: 200, text: async () => JSON.stringify({ success: true, access_token: 'tixxi-token', expires_in: 3600 }) }
      }
      throw new Error(`fetch não previsto: ${target}`)
    }

    const browser = await tixxiLoginResponse(TIXXI_ENV)
    const collectorToken = await tixxiSession.getToken(TIXXI_ENV)

    assert.equal(browser.status, 200)
    assert.equal(browser.body.success, true)
    assert.equal(browser.body.access_token, 'tixxi-token')
    assert.equal(collectorToken, 'tixxi-token')
    assert.equal(logins, 1)
  })

  it('devolve o status e a mensagem do upstream quando o login falha', async () => {
    globalThis.fetch = async () => ({
      ok: false,
      status: 429,
      text: async () => JSON.stringify({ success: false, message: 'Maximum simultaneous connections reached' }),
    })

    const { status, body } = await tixxiLoginResponse(TIXXI_ENV)

    assert.equal(status, 429)
    assert.equal(body.success, false)
    assert.match(body.message, /Maximum simultaneous connections/)
  })

  it('não chama o upstream quando faltam credenciais do Tixxi', async () => {
    globalThis.fetch = async (url) => {
      throw new Error(`fetch não previsto: ${url}`)
    }

    const { status, body } = await tixxiLoginResponse({ TIXXI_API_KEY: 'k' })

    assert.equal(status, 503)
    assert.equal(body.success, false)
    assert.match(body.message, /credenciais não configuradas \(email, password\)/)
  })

  it('mostra os campos rejeitados quando o Tixxi responde 422', async () => {
    globalThis.fetch = async () => ({
      ok: false,
      status: 422,
      text: async () => JSON.stringify({ success: false, message: 'Validation failed', errors: { email: ['Email is invalid'] } }),
    })

    const { status, body } = await tixxiLoginResponse(TIXXI_ENV)

    assert.equal(status, 422)
    assert.match(body.message, /Validation failed: Email is invalid/)
  })
})
