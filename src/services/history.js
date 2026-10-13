// Cliente das rotas de histórico do servidor (/api/frames e /api/snapshot).
//
// O histórico vive no servidor porque as fontes não enviam CORS, exigem
// credenciais e precisam ser coletadas mesmo sem ninguém com a página aberta.

const REQUEST_TIMEOUT_MS = 20000

async function fetchJson(path, signal) {
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)
  const onAbort = () => controller.abort()
  signal?.addEventListener('abort', onAbort)

  try {
    const response = await fetch(path, {
      signal: controller.signal,
      headers: { Accept: 'application/json' },
    })

    if (response.status === 404) return null

    if (!response.ok) {
      const body = await response.json().catch(() => null)
      throw new Error(body?.error || `Falha ao consultar o histórico (${response.status}).`)
    }

    return await response.json()
  } catch (err) {
    if (err?.name === 'AbortError') {
      // Cancelamento pelo próprio consumidor não é erro de exibição.
      if (signal?.aborted) return null
      throw new Error('Tempo limite excedido ao consultar o histórico.')
    }
    throw err
  } finally {
    clearTimeout(timeoutId)
    signal?.removeEventListener('abort', onAbort)
  }
}

// Instantes de frame disponíveis na janela — insumo da linha do tempo.
export async function listFrames({ from, to, signal } = {}) {
  const params = new URLSearchParams()
  if (from) params.set('from', from)
  if (to) params.set('to', to)

  const data = await fetchJson(`/api/frames?${params.toString()}`, signal)
  return data?.frames || []
}

// Estado do mapa em um instante. Devolve null quando não há frame aplicável,
// para que a UI distinga "sem histórico" de "histórico vazio".
export async function getSnapshot(at, { signal } = {}) {
  const data = await fetchJson(`/api/snapshot?at=${encodeURIComponent(at)}`, signal)
  if (!data || !data.available) return null
  return data
}
