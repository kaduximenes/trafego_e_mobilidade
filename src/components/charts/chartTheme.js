const TOOLTIP_STYLE = {
  backgroundColor: '#ffffff',
  border: '1px solid #d1dce2',
  borderRadius: 8,
  padding: '8px 12px',
  fontSize: 12,
  color: '#13335a',
  boxShadow: '0 10px 24px -12px rgba(19,51,90,0.28)',
}

export function chartTooltipStyle(extra = {}) {
  return { ...TOOLTIP_STYLE, ...extra }
}

export function tooltipLabelFormatter(label) {
  return { color: '#4c6576', fontWeight: 600, label }
}
