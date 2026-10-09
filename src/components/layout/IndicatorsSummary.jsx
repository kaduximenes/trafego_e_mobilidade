import { AlertTriangle, BarChart3, Camera, Map, Siren, TrafficCone } from 'lucide-react'
import { CAMERA_STATUS } from '../../services/tixxi'
import { hourlyVolume, topHours } from '../../data/mockData'
import { formatDecimal, formatNumber } from '../../utils/format'
import { Panel } from '../ui/Panel'

const totalVehicles = hourlyVolume.reduce((total, item) => total + item.volume, 0)
const unavailableCameraStatuses = ['1', '3', '5', 'A']

function IndicatorCard({ icon: Icon, title, children, note, loading, error }) {
  return (
    <Panel className="p-4">
      <div className="flex items-center gap-2.5">
        <span className="grid size-9 place-items-center rounded-lg bg-primary/10 text-primary">
          <Icon size={17} />
        </span>
        <h3 className="text-sm font-semibold text-text-main">{title}</h3>
      </div>
      <div className="mt-4 flex flex-col gap-3">{children}</div>
      {(loading || error || note) && (
        <div className="mt-4 border-t border-corborder-soft pt-3 text-[11px] leading-relaxed text-text-dim">
          {loading && <p>Atualizando dados…</p>}
          {!loading && error && (
            <p className="flex items-start gap-1.5 text-danger">
              <AlertTriangle size={13} className="mt-0.5 shrink-0" />
              <span>{error}</span>
            </p>
          )}
          {note && <p>{note}</p>}
        </div>
      )}
    </Panel>
  )
}

function Metric({ label, value, detail }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <span className="text-xs text-text-muted">{label}</span>
      <span className="text-right font-mono text-sm font-bold text-text-main tabular">
        {value}
        {detail && <span className="ml-1.5 whitespace-nowrap text-[10px] font-normal text-text-dim">{detail}</span>}
      </span>
    </div>
  )
}

export function IndicatorsSummary({ occurrences, waze, cameras, semaforos }) {
  const cameraUnavailable = unavailableCameraStatuses.reduce(
    (total, status) => total + (cameras.counts[status] || 0),
    0,
  )
  const occurrenceDataUnavailable = !occurrences.loading && occurrences.error && occurrences.feed.length === 0
  const cameraDataUnavailable = !cameras.loading && cameras.error && cameras.counts.total === 0
  const wazeDataUnavailable = !waze.configured || (!waze.loading && waze.error && !waze.lastUpdated)
  const highestSeverity = occurrences.severityCounts?.high?.count || 0
  const topOccurrence = occurrences.typeCounts?.[0]

  return (
    <section aria-labelledby="indicators-summary-title">
      <div className="mb-3">
        <h2 id="indicators-summary-title" className="text-base font-bold text-text-main">
          Análise ampla dos indicadores
        </h2>
        <p className="mt-1 text-xs text-text-muted">
          Visão consolidada dos principais números do painel. Os dados mantêm a atualização de cada fonte.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
        <IndicatorCard
          icon={Siren}
          title="Ocorrências ativas"
          loading={occurrences.loading}
          error={occurrences.error}
        >
          <Metric
            label="Total em aberto"
            value={occurrences.loading || occurrenceDataUnavailable ? '—' : formatNumber(occurrences.feed.length)}
          />
          <Metric
            label="Gravidade alta"
            value={occurrences.loading || occurrenceDataUnavailable ? '—' : formatNumber(highestSeverity)}
          />
          <Metric
            label="Tipo mais frequente"
            value={occurrences.loading || occurrenceDataUnavailable ? '—' : topOccurrence?.label || 'Nenhuma'}
          />
        </IndicatorCard>

        <IndicatorCard
          icon={Map}
          title="Tráfego e alertas do Waze"
          loading={waze.loading}
          error={waze.error}
          note={waze.stale ? 'Feed indisponível; exibindo a última leitura válida.' : null}
        >
          <Metric
            label="Km congestionados"
            value={wazeDataUnavailable || waze.loading ? '—' : `${formatDecimal(waze.congestionKm)} km`}
          />
          <Metric
            label="Alertas ativos"
            value={wazeDataUnavailable || waze.loading ? '—' : formatNumber(waze.alertCount)}
          />
          <Metric
            label="Trechos reportados"
            value={wazeDataUnavailable || waze.loading ? '—' : formatNumber(waze.jamCount)}
          />
          {!waze.configured && !waze.loading && (
            <p className="text-[11px] text-text-dim">Aguardando configuração do feed do Waze for Cities.</p>
          )}
        </IndicatorCard>

        <IndicatorCard
          icon={BarChart3}
          title="Volume de tráfego"
          note="Dados demonstrativos do painel; não representam uma contagem ao vivo."
        >
          <Metric label="Volume nas 24 horas" value={formatNumber(totalVehicles)} detail="veículos" />
          <Metric
            label="Horário de pico"
            value={topHours[0].hour}
            detail={`${formatNumber(topHours[0].volume)} veículos`}
          />
          <Metric label="Registros por hora" value={formatNumber(hourlyVolume.length)} />
        </IndicatorCard>

        <IndicatorCard
          icon={Camera}
          title="Câmeras"
          loading={cameras.loading}
          error={cameras.error}
        >
          <Metric
            label="Total monitorado"
            value={cameras.loading || cameraDataUnavailable ? '—' : formatNumber(cameras.counts.total)}
          />
          <Metric
            label={CAMERA_STATUS[0].label}
            value={cameras.loading || cameraDataUnavailable ? '—' : formatNumber(cameras.counts['0'] || 0)}
          />
          <Metric
            label="Com instabilidade ou manutenção"
            value={cameras.loading || cameraDataUnavailable ? '—' : formatNumber(cameraUnavailable)}
          />
        </IndicatorCard>

        <IndicatorCard
          icon={TrafficCone}
          title="Saúde dos semáforos"
          loading={semaforos.loading}
          error={semaforos.error}
        >
          <Metric label="Controladores" value={semaforos.loading ? '—' : formatNumber(semaforos.total)} />
          <Metric
            label="Em estado normal"
            value={semaforos.loading ? '—' : formatNumber(semaforos.normalCount)}
          />
          <Metric
            label="Fora do estado normal"
            value={semaforos.loading ? '—' : formatNumber(semaforos.total - semaforos.normalCount)}
          />
        </IndicatorCard>
      </div>
    </section>
  )
}
