// Mapa dos Procedimentos Operacionais (POP) do COR.Rio.
// Fonte: "Índice POPs" (OPE-POP-001-R00 a OPE-POP-042-R00) e documentos das
// revisões R01 a R06 (OPE-POP-043 a OPE-POP-053).
// A API retorna apenas o código da agência (ex.: "POP23"), sem descrição.

export const SEVERITY = { high: 'high', medium: 'medium', low: 'low' }

// icon: chave consumida por OccurrenceFeed (lucide-react).
export const eventTypeMap = {
  POP01: { label: 'Acidente Enguiço Sem Vítimas', severity: SEVERITY.medium, icon: 'Car' },
  POP02: { label: 'Acidente com Vítimas', severity: SEVERITY.high, icon: 'Car' },
  POP03: { label: 'Acidente com Óbito', severity: SEVERITY.high, icon: 'Car' },
  POP04: { label: 'Incêndio em veículo(s)', severity: SEVERITY.high, icon: 'AlertTriangle' },
  POP05: { label: "Bolsão d'água em Via", severity: SEVERITY.medium, icon: 'Droplets' },
  POP06: { label: 'Manifestação em local público', severity: SEVERITY.medium, icon: 'AlertTriangle' },
  POP07: { label: 'Incêndio em imóvel', severity: SEVERITY.high, icon: 'AlertTriangle' },
  POP08: { label: 'Sinais de trânsito com mau funcionamento', severity: SEVERITY.medium, icon: 'AlertTriangle' },
  POP09: { label: 'Reintegração de posse', severity: SEVERITY.medium, icon: 'AlertTriangle' },
  POP10: { label: 'Queda de árvore', severity: SEVERITY.medium, icon: 'Wrench' },
  POP11: { label: 'Queda de poste', severity: SEVERITY.high, icon: 'Wrench' },
  POP12: { label: 'Acidente com queda de carga', severity: SEVERITY.high, icon: 'Car' },
  POP13: { label: 'Incêndio em Área de Vegetação de Vias Públicas', severity: SEVERITY.medium, icon: 'AlertTriangle' },
  POP14: { label: 'Incêndio dentro de túneis', severity: SEVERITY.high, icon: 'AlertTriangle' },
  POP15: { label: 'Vazamento de água esgoto', severity: SEVERITY.low, icon: 'Droplets' },
  POP16: { label: 'Falta de crítica energia apagão', severity: SEVERITY.high, icon: 'AlertTriangle' },
  POP17: { label: 'Implosão', severity: SEVERITY.high, icon: 'AlertTriangle' },
  POP18: { label: 'Escapamento de gás', severity: SEVERITY.high, icon: 'AlertTriangle' },
  POP19: { label: 'Evento não programado', severity: SEVERITY.low, icon: 'AlertTriangle' },
  POP20: { label: 'Atropelamento', severity: SEVERITY.high, icon: 'Car' },
  POP21: { label: 'Afundamento de pista buraco na via', severity: SEVERITY.medium, icon: 'Construction' },
  POP22: { label: 'Abalroamento', severity: SEVERITY.medium, icon: 'Car' },
  POP23: { label: 'Obra em local público', severity: SEVERITY.low, icon: 'Construction' },
  POP24: { label: 'Operação policial', severity: SEVERITY.high, icon: 'AlertTriangle' },
  POP25: { label: 'Deslizamento', severity: SEVERITY.high, icon: 'AlertTriangle' },
  POP26: { label: 'Acionamento de sirenes', severity: SEVERITY.medium, icon: 'AlertTriangle' },
  POP27: { label: 'Alagamento', severity: SEVERITY.high, icon: 'Droplets' },
  POP28: { label: 'Enchente', severity: SEVERITY.high, icon: 'Droplets' },
  POP29: { label: "Lâmina d'água", severity: SEVERITY.medium, icon: 'Droplets' },
  POP30: { label: 'Acidente ambiental', severity: SEVERITY.medium, icon: 'AlertTriangle' },
  POP31: { label: 'Incidente com bueiro', severity: SEVERITY.low, icon: 'Construction' },
  POP32: { label: 'Incêndio em vegetação', severity: SEVERITY.medium, icon: 'AlertTriangle' },
  POP33: { label: 'Queda de árvore sobre fiação', severity: SEVERITY.high, icon: 'Wrench' },
  POP34: { label: 'Resíduo na via', severity: SEVERITY.low, icon: 'Construction' },
  POP35: { label: 'Resgate ou remoção de animais terrestres e aéreos', severity: SEVERITY.low, icon: 'AlertTriangle' },
  POP36: { label: 'Remoção de animal morto na areia', severity: SEVERITY.low, icon: 'AlertTriangle' },
  POP37: { label: 'Resgate de animal marinho preso em rede encalhado', severity: SEVERITY.low, icon: 'AlertTriangle' },
  POP38: { label: 'Animal em local público', severity: SEVERITY.low, icon: 'AlertTriangle' },
  POP39: { label: 'Queda de estrutura de alvenaria', severity: SEVERITY.high, icon: 'Construction' },
  POP40: { label: 'Queda de carga viva de grande porte', severity: SEVERITY.high, icon: 'Car' },
  POP41: { label: 'Queda de carga viva de pequeno porte', severity: SEVERITY.medium, icon: 'Car' },
  POP42: { label: 'Aeroporto – Ocorrências Internas no Parque Aeroportuário', severity: SEVERITY.low, icon: 'AlertTriangle' },
  POP43: { label: 'Prontidão Ciclovia', severity: SEVERITY.low, icon: 'Construction' },
  POP44: { label: 'Posicionamento em Ciclovia', severity: SEVERITY.low, icon: 'Construction' },
  POP45: { label: 'Interdição em Ciclovia', severity: SEVERITY.medium, icon: 'Construction' },
  POP46: { label: 'Enguiço na Via', severity: SEVERITY.medium, icon: 'Car' },
  POP47: { label: 'Acidente Sem Vítimas', severity: SEVERITY.medium, icon: 'Car' },
  POP48: { label: 'Protocolo de Ciclovia', severity: SEVERITY.low, icon: 'Construction' },
  POP49: { label: 'Interdição de Via Protocolar', severity: SEVERITY.medium, icon: 'Construction' },
  POP50: { label: 'Fiação Partida-Arriada', severity: SEVERITY.high, icon: 'Wrench' },
  POP51: { label: 'Interrupção parcial ou total de modal', severity: SEVERITY.high, icon: 'AlertTriangle' },
  // POP52 não existe no dossiê de POPs (revisões R00 a R06): sem título oficial.
  POP53: { label: 'Veículo Grande Porte', severity: SEVERITY.medium, icon: 'Car' },
}

// Normaliza "pop 8", "POP-08" ou "ope-pop-008-r00" para "POP08".
export function normalizeTypeCode(raw) {
  const digits = String(raw ?? '').match(/(\d{1,3})\s*$/)?.[1]
  if (!digits) return null
  return `POP${digits.padStart(2, '0')}`
}

export function resolveEventType(rawCode) {
  const code = normalizeTypeCode(rawCode)
  const entry = code ? eventTypeMap[code] : null

  if (!entry) {
    // Código sem título conhecido no dossiê (ex.: POP52).
    return {
      code: code || String(rawCode ?? '').trim() || 'POP—',
      label: code ? `Tipo ${code}` : 'Ocorrência geral',
      severity: SEVERITY.medium,
      icon: 'AlertTriangle',
    }
  }

  return { code, ...entry }
}
