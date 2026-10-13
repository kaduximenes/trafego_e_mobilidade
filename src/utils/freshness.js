// Avalia há quanto tempo cada fonte foi atualizada pela última vez.
// O nível é comparado ao intervalo de polling esperado da fonte: uma leitura
// dentro de 1,5x do intervalo é normal, até 3x é atenção e acima disso indica
// que o painel está exibindo dados possivelmente defasados.
export function describeFreshness(lastUpdatedAt, expectedMs, now = Date.now()) {
  if (!lastUpdatedAt) return { level: 'unknown', label: 'sem leitura', ageMs: null }

  const timestamp = new Date(lastUpdatedAt).getTime()
  if (!Number.isFinite(timestamp)) return { level: 'unknown', label: 'sem leitura', ageMs: null }

  const ageMs = Math.max(0, now - timestamp)
  const level =
    ageMs <= expectedMs * 1.5 ? 'fresh' : ageMs <= expectedMs * 3 ? 'warn' : 'stale'

  return { level, label: formatAge(ageMs), ageMs }
}

export function formatAge(ageMs) {
  if (ageMs === null) return '—'

  const seconds = Math.floor(ageMs / 1000)
  if (seconds < 60) return 'agora'

  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `há ${minutes} min`

  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `há ${hours} h`

  return `há ${Math.floor(hours / 24)} d`
}
