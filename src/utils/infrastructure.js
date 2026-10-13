// Índice consolidado de saúde da infraestrutura monitorada pelo COR.
// Cada subsistema (semáforos, câmeras) entra com peso igual: uma rede maior não
// deve diluir a indisponibilidade da menor. O índice é a média das
// disponibilidades dos subsistemas que possuem dados.
const OK_THRESHOLD = 95
const WARN_THRESHOLD = 80

export const INFRASTRUCTURE_STATUS_LABEL = {
  ok: 'Operação normal',
  warn: 'Atenção',
  danger: 'Crítico',
  unknown: 'Sem dados',
}

export function computeInfrastructureHealth({ semaforos, cameras }) {
  const subsystems = []

  const trafficLightTotal = semaforos?.total || 0
  if (trafficLightTotal > 0) {
    subsystems.push({
      key: 'trafficLights',
      label: 'Semáforos',
      pct: semaforos.operationalPct || 0,
      total: trafficLightTotal,
    })
  }

  const cameraTotal = cameras?.counts?.total || 0
  if (cameraTotal > 0) {
    subsystems.push({
      key: 'cameras',
      label: 'Câmeras',
      pct: ((cameras.counts['0'] || 0) / cameraTotal) * 100,
      total: cameraTotal,
    })
  }

  if (!subsystems.length) {
    return { pct: null, status: 'unknown', subsystems: [] }
  }

  const pct = subsystems.reduce((sum, subsystem) => sum + subsystem.pct, 0) / subsystems.length
  const status = pct >= OK_THRESHOLD ? 'ok' : pct >= WARN_THRESHOLD ? 'warn' : 'danger'

  return { pct, status, subsystems }
}
