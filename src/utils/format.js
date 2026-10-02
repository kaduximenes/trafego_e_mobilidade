const nf = new Intl.NumberFormat('pt-BR')

export function formatNumber(value) {
  return nf.format(value)
}

export function formatDecimal(value, digits = 1) {
  return new Intl.NumberFormat('pt-BR', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(value)
}

export function formatPercent(value, digits = 1) {
  return `${new Intl.NumberFormat('pt-BR', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(value)}%`
}
