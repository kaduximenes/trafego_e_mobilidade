// Dados simulados de monitoramento de tráfego — Tráfego em Camboriú
// Período analisado: 14/09/2026 23:56 → 15/09/2026 23:56

export const period = {
  start: '14/09/2026 23:56',
  end: '15/09/2026 23:56',
  label: 'Análise de 24 horas • Detecção por IA',
}

export const kpis = {
  totalRecords: 24838,
  avgSpeed: 28.8,
  medianSpeed: 30.2,
  p95Speed: 40.1,
}

// Badges circulares de excesso de velocidade (com contagem de veículos)
export const speedingBadges = [
  { threshold: '>40', pct: 4.97, count: 992, color: 'warn' },
  { threshold: '>50', pct: 0.32, count: 64, color: 'danger' },
  { threshold: '>60', pct: 0.06, count: 12, color: 'magenta' },
]

// Volume de tráfego por hora (0h → 23h) — picos manhã (07h-09h) e noite (17h-19h)
export const hourlyVolume = [
  { hour: '00h', volume: 380 },
  { hour: '01h', volume: 210 },
  { hour: '02h', volume: 140 },
  { hour: '03h', volume: 110 },
  { hour: '04h', volume: 160 },
  { hour: '05h', volume: 420 },
  { hour: '06h', volume: 1020 },
  { hour: '07h', volume: 1780 },
  { hour: '08h', volume: 2110 },
  { hour: '09h', volume: 1540 },
  { hour: '10h', volume: 1180 },
  { hour: '11h', volume: 1260 },
  { hour: '12h', volume: 1450 },
  { hour: '13h', volume: 1320 },
  { hour: '14h', volume: 1210 },
  { hour: '15h', volume: 1310 },
  { hour: '16h', volume: 1430 },
  { hour: '17h', volume: 1840 },
  { hour: '18h', volume: 2090 },
  { hour: '19h', volume: 1660 },
  { hour: '20h', volume: 980 },
  { hour: '21h', volume: 720 },
  { hour: '22h', volume: 540 },
  { hour: '23h', volume: 420 },
]

export const peakPeriods = {
  morning: { label: 'Pico da Manhã', hours: '07h – 09h', color: '#2a688f' },
  evening: { label: 'Pico da Tarde/Noite', hours: '17h – 19h', color: '#42b9eb' },
}

// Ranking de principais horários
export const topHours = [
  { rank: 1, hour: '08h', volume: 2110, pct: 8.5 },
  { rank: 2, hour: '18h', volume: 2090, pct: 8.4 },
  { rank: 3, hour: '17h', volume: 1840, pct: 7.4 },
  { rank: 4, hour: '07h', volume: 1780, pct: 7.2 },
  { rank: 5, hour: '19h', volume: 1660, pct: 6.7 },
]

// Composição do tráfego
export const composition = [
  { key: 'cars', label: 'Carros', value: 14590, pct: 73.0, color: '#42b9eb' },
  { key: 'trucks', label: 'Caminhões', value: 2180, pct: 10.9, color: '#2a688f' },
  { key: 'motos', label: 'Motos', value: 1690, pct: 8.5, color: '#00E676' },
  { key: 'bus', label: 'Ônibus', value: 720, pct: 3.6, color: '#FF9100' },
]

// Velocidade média por classe de veículo
export const speedByClass = [
  { key: 'cars', label: 'Carro', speed: 32.1, icon: 'Car', color: '#42b9eb' },
  { key: 'motos', label: 'Moto', speed: 34.6, icon: 'Bike', color: '#00E676' },
  { key: 'bus', label: 'Ônibus', speed: 24.8, icon: 'Bus', color: '#FF9100' },
  { key: 'trucks', label: 'Caminhão', speed: 22.3, icon: 'Truck', color: '#2a688f' },
]

// Histograma de distribuição de velocidades (faixas km/h → frequência)
export const speedHistogram = [
  { range: '0–10', freq: 180 },
  { range: '10–15', freq: 420 },
  { range: '15–20', freq: 1420 },
  { range: '20–25', freq: 3010 },
  { range: '25–30', freq: 4380 },
  { range: '30–35', freq: 4950 },
  { range: '35–40', freq: 3380 },
  { range: '40–45', freq: 1610 },
  { range: '45–50', freq: 520 },
  { range: '50–55', freq: 96 },
  { range: '55–60', freq: 14 },
  { range: '60+', freq: 2 },
]

export const percentiles = [
  { label: 'P25', value: 24.6, color: '#00A8FF' },
  { label: 'P50', value: 30.2, color: '#00E676' },
  { label: 'P75', value: 35.1, color: '#FF9100' },
  { label: 'P85', value: 38.4, color: '#A855F7' },
  { label: 'P95', value: 40.1, color: '#FF1744' },
]

export const insights = [
  {
    title: 'Pico matinal concentrado entre 07h e 09h',
    text: 'O maior volume do dia ocorre às 08h (2.110 veículos), alinhado ao deslocamento pendular de entrada na cidade.',
    tag: 'Volume',
    color: 'primary',
  },
  {
    title: 'Segundo pico expressivo no fim da tarde',
    text: 'Entre 17h e 19h o fluxo volta a crescer e atinge 2.090 veículos às 18h, com retorno para casa e saída do trabalho.',
    tag: 'Volume',
    color: 'violet',
  },
  {
    title: 'Carros dominam 73% do fluxo total',
    text: 'Dos 24.838 registros, 14.590 são automóveis. Caminhões (2.180) e motos (1.690) completam as categorias motorizadas.',
    tag: 'Composição',
    color: 'ok',
  },
  {
    title: '2,6% dos condutores acima de 40 km/h',
    text: 'Foram 992 registros acima do limite, com 64 casos superiores a 50 km/h e 12 acima de 60 km/h — pico entre 17h e 19h.',
    tag: 'Velocidade',
    color: 'warn',
  },
  {
    title: 'Motocicletas registram a maior média de velocidade',
    text: 'Com 34,6 km/h, as motos superam os carros (32,1 km/h), exigindo atenção redobrada à fiscalização dessa classe.',
    tag: 'Velocidade',
    color: 'danger',
  },
  {
    title: 'P95 de velocidade em 40,1 km/h',
    text: '5% do fluxo trafega acima de 40 km/h, concentrando os alertas entre 17h e 19h — janela ideal para reforço de fiscalização.',
    tag: 'Velocidade',
    color: 'violet',
  },
]

// ─────────────────────────────────────────────────────────────
// Módulo: Monitoramento de Ocorrências em Tempo Real
// ─────────────────────────────────────────────────────────────

export const occurrenceSeverities = {
  high: {
    key: 'high',
    label: 'Alta',
    count: 3,
    description: 'Ocorrências críticas • Vias interditadas',
    color: '#EF4444',
  },
  medium: {
    key: 'medium',
    label: 'Média',
    count: 8,
    description: 'Lentidão • Semáforo desligado',
    color: '#F59E0B',
  },
  low: {
    key: 'low',
    label: 'Baixa',
    count: 14,
    description: 'Manutenção programada • Acostamento',
    color: '#3B82F6',
  },
}

// Distribuição por tipo de ocorrência (gráfico de barras)
export const occurrenceTypes = [
  { key: 'accident_no_victim', label: 'Acidente sem Vítima', value: 9, color: '#00A8FF' },
  { key: 'accident_victim', label: 'Acidente com Vítima', value: 3, color: '#EF4444' },
  { key: 'broken_vehicle', label: 'Veículo Quebrado', value: 5, color: '#A855F7' },
  { key: 'flooding', label: 'Alagamento', value: 4, color: '#00E676' },
  { key: 'bad_traffic_light', label: 'Semáforo Ruim', value: 6, color: '#F59E0B' },
  { key: 'road_work', label: 'Obras na Via', value: 8, color: '#8B5CF6' },
]

// Feed de ocorrências ativas
export const occurrenceFeed = [
  { id: 1, severity: 'high', type: 'Acidente com Vítima', location: 'Av. Brasil, km 12', icon: 'Car', minutes: 15, status: 'Equipe a Caminho' },
  { id: 2, severity: 'high', type: 'Acidente com Vítima', location: 'Linha Vermelha, altura de Bonsucesso', icon: 'Car', minutes: 22, status: 'Em Atendimento' },
  { id: 3, severity: 'high', type: 'Alagamento', location: 'Av. Ayrton Senna, pista lateral', icon: 'Droplets', minutes: 34, status: 'Vias Interditadas' },
  { id: 4, severity: 'medium', type: 'Semáforo Ruim', location: 'Av. das Américas × Av. Guignard', icon: 'AlertTriangle', minutes: 8, status: 'Equipe a Caminho' },
  { id: 5, severity: 'medium', type: 'Acidente sem Vítima', location: 'Av. Dom Hélder Câmara, km 5', icon: 'Car', minutes: 18, status: 'Em Atendimento' },
  { id: 6, severity: 'medium', type: 'Veículo Quebrado', location: 'Túnel Rebouças, sentido Centro', icon: 'Wrench', minutes: 11, status: 'Aguardando Reboque' },
  { id: 7, severity: 'medium', type: 'Alagamento', location: 'Av. Brasil, altura de Deodoro', icon: 'Droplets', minutes: 26, status: 'Em Atendimento' },
  { id: 8, severity: 'low', type: 'Obras na Via', location: 'Av. Presidente Vargas, pista central', icon: 'Construction', minutes: 45, status: 'Manutenção Programada' },
  { id: 9, severity: 'low', type: 'Obras na Via', location: 'Rua Santa Luzia, Centro', icon: 'Construction', minutes: 60, status: 'Manutenção Programada' },
  { id: 10, severity: 'low', type: 'Veículo Quebrado', location: 'Av. Atlântica, acostamento', icon: 'Wrench', minutes: 5, status: 'Aguardando Reboque' },
  { id: 11, severity: 'low', type: 'Acidente sem Vítima', location: 'Estrada do Galeão, km 3', icon: 'Car', minutes: 30, status: 'Em Atendimento' },
]
