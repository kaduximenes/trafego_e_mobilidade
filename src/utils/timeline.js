// Geometria da linha do tempo: converte instantes em posições (0..1) da janela
// de frames e vice-versa. Fica isolado da UI para poder ser testado sem DOM.

export function positionOf(instant, bounds) {
  if (!bounds || !instant) return 0

  const first = new Date(bounds.first).getTime()
  const last = new Date(bounds.last).getTime()
  if (!Number.isFinite(first) || !Number.isFinite(last)) return 0
  // Com um único frame a janela tem largura zero: a alça fica no fim.
  if (last <= first) return 1

  const at = new Date(instant).getTime()
  if (!Number.isFinite(at)) return 0

  return Math.min(1, Math.max(0, (at - first) / (last - first)))
}

// Inverso de positionOf: de uma posição 0..1 para o instante correspondente.
export function instantAtPosition(ratio, bounds) {
  if (!bounds) return null

  const first = new Date(bounds.first).getTime()
  const last = new Date(bounds.last).getTime()
  if (!Number.isFinite(first) || !Number.isFinite(last)) return null
  if (last <= first) return bounds.first

  const clamped = Math.min(1, Math.max(0, ratio))
  return new Date(first + (last - first) * clamped).toISOString()
}

// Índice do frame em ou antes do instante — usado para alinhar a alça a um
// frame existente em vez de a um instante arbitrário sem dados.
export function nearestFrameIndex(instants, when) {
  if (!instants?.length) return -1
  const target = new Date(when).getTime()
  if (!Number.isFinite(target)) return -1

  let index = -1
  for (let i = 0; i < instants.length; i += 1) {
    if (instants[i] <= target) index = i
    else break
  }
  return index
}
