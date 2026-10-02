const TOOLTIP_STYLE = {
  backgroundColor: '#0d1730',
  border: '1px solid #243049',
  borderRadius: 10,
  padding: '8px 12px',
  fontSize: 12,
  color: '#e2e8f0',
  boxShadow: '0 12px 30px -10px rgba(0,0,0,0.7)',
}

export function chartTooltipStyle(extra = {}) {
  return { ...TOOLTIP_STYLE, ...extra }
}

export function tooltipLabelFormatter(label) {
  return { color: '#8b98b8', fontWeight: 600, label }
}
