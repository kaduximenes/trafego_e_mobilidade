// Janelas de consulta da linha do tempo. O limite superior é o teto do servidor
// (31 dias em /api/frames), para que a opção escolhida nunca seja recusada.
export const TIMELINE_WINDOWS = [
  { hours: 6, label: '6 h' },
  { hours: 12, label: '12 h' },
  { hours: 24, label: '24 h' },
  { hours: 24 * 3, label: '3 dias' },
  { hours: 24 * 7, label: '7 dias' },
]

export const DEFAULT_TIMELINE_WINDOW_HOURS = 12
