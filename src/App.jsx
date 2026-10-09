import { useState } from 'react'
import { AlertTriangle, BarChart3, Camera, ChartColumn, Gauge, Map as MapIcon, PieChart, Radar, RefreshCw, Siren, TrafficCone, Trophy } from 'lucide-react'
import { useSemaforos } from './hooks/useSemaforos'
import { useWazeTraffic } from './hooks/useWazeTraffic'
import { useOpenEvents } from './hooks/useOpenEvents'
import { useCameras } from './hooks/useCameras'
import { Header } from './components/layout/Header'
import { IndicatorsSummary } from './components/layout/IndicatorsSummary'
import { Panel, PanelHeader, SectionTitle } from './components/ui/Panel'
import { TrafficChart } from './components/charts/TrafficChart'
import { TopHours } from './components/sections/TopHours'
import { TrafficLightKpi } from './components/trafficLights/TrafficLightKpi'
import { TrafficLightDonut } from './components/trafficLights/TrafficLightDonut'
import { FaultBreakdown } from './components/trafficLights/FaultBreakdown'
import { TrafficLightOccurrences } from './components/trafficLights/TrafficLightOccurrences'
import { CamerasSection } from './components/cameras/CamerasSection'
import { OccurrenceDashboard } from './components/occurrences/OccurrenceDashboard'
import { WazeLiveMap } from './components/waze/WazeLiveMap'
import { CongestionKpi } from './components/waze/CongestionKpi'
import { WazeTopJams } from './components/waze/WazeTopJams'
import { WazeAlertsPanel } from './components/waze/WazeAlertsPanel'
import { formatDecimal, formatNumber } from './utils/format'

function Footer() {
  return (
    <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-corborder px-2 pt-3 text-xs text-text-dim">
      <p>© 2026 Centro de Operações e Resiliência — Monitoramento de Mobilidade Urbana</p>
      <p className="flex items-center gap-1.5">
        <span className="relative flex size-2">
          <span className="absolute inline-flex size-full animate-ping rounded-full bg-ok opacity-60" />
          <span className="relative inline-flex size-2 rounded-full bg-ok" />
        </span>
        Sistema operacional • Última atualização: 15/09/2026 23:56
      </p>
    </footer>
  )
}

export default function App() {
  const semaforos = useSemaforos({ pollingMs: 60000 })
  const waze = useWazeTraffic({ pollingMs: 120000 })
  const occurrences = useOpenEvents({ pollingMs: 60000 })
  const cameras = useCameras()
  const [summaryOpen, setSummaryOpen] = useState(false)

  return (
    <div className="flex min-h-full w-full shrink-0 flex-col gap-3 overflow-x-hidden">
      <Header
        summaryOpen={summaryOpen}
        onToggleSummary={() => {
          setSummaryOpen((open) => !open)
          document.getElementById('root')?.scrollTo({ top: 0, behavior: 'smooth' })
        }}
      />

      {summaryOpen ? (
        <IndicatorsSummary
          occurrences={occurrences}
          waze={waze}
          cameras={cameras}
          semaforos={semaforos}
        />
      ) : (
        <>
      {/* Seção 0 — Monitoramento de Ocorrências em Tempo Real */}
      <section>
        <SectionTitle
          icon={Siren}
          title="Monitoramento de Ocorrências"
          subtitle="Eventos ativos categorizados por gravidade e tipo"
        />
        <OccurrenceDashboard {...occurrences} />
      </section>

      {/* Seção 1 — Waze • Tráfego ao Vivo (API Waze for Cities) */}
      <section>
        <SectionTitle
          icon={MapIcon}
          title="Waze • Tráfego ao Vivo"
          subtitle="Engarrafamento e alertas reportados em tempo real"
        />

        {/* Correlação: engarrafamento (Waze) × semáforos com falha */}
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
          <Panel className="lg:col-span-2">
            <PanelHeader
              icon={MapIcon}
              title="Waze Live Map • Tráfego ao Vivo"
              subtitle="Engarrafamento ao vivo — cruze com os controladores em falha em Saúde dos Semáforos"
            />
            <WazeLiveMap />
          </Panel>

          <div className="flex flex-col gap-3">
            <CongestionKpi
              configured={waze.configured}
              missing={waze.missing}
              loading={waze.loading}
              error={waze.error}
              congestionKm={waze.congestionKm}
              totalKm={waze.totalKm}
              slowKm={waze.slowKm}
              jamCount={waze.jamCount}
              avgCongestedSpeedKmh={waze.avgCongestedSpeedKmh}
              byLevel={waze.byLevel}
              lastUpdated={waze.lastUpdated}
              stale={waze.stale}
              onRefresh={waze.refresh}
            />

            <Panel>
              <PanelHeader
                icon={Radar}
                title="Leitura Correlacionada"
                subtitle="Falha semafórica e engarrafamento no mesmo período"
              />
              <div className="flex flex-col gap-3 p-4 text-xs">
                <div className="flex items-baseline justify-between gap-3">
                  <span className="text-text-muted">Controladores com falha</span>
                  <span className="font-mono font-bold text-warn tabular">
                    {formatNumber(semaforos.total - semaforos.online)}
                    <span className="ml-1 font-normal text-text-dim">
                      ({formatDecimal(semaforos.offline ? ((semaforos.total - semaforos.online) / semaforos.total) * 100 : 0)}%)
                    </span>
                  </span>
                </div>
                <div className="flex items-baseline justify-between gap-3">
                  <span className="text-text-muted">Trechos com engarrafamento</span>
                  <span className="font-mono font-bold text-danger tabular">
                    {waze.configured ? formatNumber(waze.jamCount) : '—'}
                  </span>
                </div>
                <div className="flex items-baseline justify-between gap-3">
                  <span className="text-text-muted">Km engarrafados</span>
                  <span className="font-mono font-bold text-danger tabular">
                    {waze.configured ? `${formatDecimal(waze.congestionKm)} km` : '—'}
                  </span>
                </div>
                <p className="mt-1 border-t border-corborder-soft pt-3 text-[11px] leading-relaxed text-text-dim">
                  {waze.configured
                    ? 'Compare os pontos vermelhos do mapa do Waze com os controladores em falha na seção Saúde e Operação dos Semáforos: corredores com semáforo fora de operação tendem a concentrar retenção.'
                    : 'O KPI de engarrafamento depende do feed do Waze for Cities. Enquanto as credenciais não estiverem configuradas, use o mapa apenas como leitura visual; nenhum km é estimado.'}
                </p>
              </div>
            </Panel>
          </div>
        </div>

        {/* Detalhamento do feed Waze: vias mais retidas e alertas ativos */}
        <div className="mt-3 grid grid-cols-1 gap-3 lg:grid-cols-2">
          <Panel>
            <PanelHeader
              icon={MapIcon}
              title="Congestionamento por Via"
              subtitle="Trechos com maior extensão de retenção reportados pelo Waze"
            />
            <WazeTopJams
              data={waze.topJams}
              loading={waze.loading}
              configured={waze.configured}
            />
          </Panel>

          <Panel>
            <PanelHeader
              icon={Siren}
              title="Alertas do Waze"
              subtitle="Vias bloqueadas, acidentes, obras e perigos ativos na via"
            />
            <WazeAlertsPanel
              alerts={waze.priorityAlerts}
              byGroup={waze.byGroup}
              loading={waze.loading}
              configured={waze.configured}
              lastUpdated={waze.lastUpdated}
              onRefresh={waze.refresh}
            />
          </Panel>
        </div>
      </section>

      {/* Seção 2 — Volume de Tráfego */}
      <section>
        <SectionTitle
          icon={BarChart3}
          title="Volume de Tráfego"
          subtitle="Comportamento horário do fluxo veicular e horários de pico"
        />
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
          <Panel className="lg:col-span-2">
            <PanelHeader
              icon={ChartColumn}
              title="Volume de Tráfego por Hora"
              subtitle="Veículos detectados ao longo das 24 horas — picos destacados"
            />
            <TrafficChart />
          </Panel>

          <Panel>
            <PanelHeader icon={Trophy} title="Principais Horários" subtitle="Ranking de pico (1º ao 5º)" />
            <TopHours />
          </Panel>
        </div>
      </section>

      {/* Seção 3 — Câmeras ao Vivo (API Tixxi) */}
      <section>
        <SectionTitle
          icon={Camera}
          title="Câmeras ao Vivo"
          subtitle="Monitoramento em tempo real da rede de câmeras Tixxi"
        />
        <CamerasSection {...cameras} />
      </section>

      {/* Seção 4 — Saúde e Operação dos Semáforos (API Dataprom/Antares) */}
      <section>
        <SectionTitle
          icon={TrafficCone}
          title="Saúde e Operação dos Semáforos"
          subtitle="Monitoramento em tempo real da rede semafórica"
        />

        {semaforos.error && (
          <div className="mb-4 flex items-center justify-between gap-3 rounded-2xl border border-danger/30 bg-danger/10 p-3 text-sm text-danger">
            <div className="flex min-w-0 items-center gap-2">
              <AlertTriangle size={16} className="shrink-0" />
              <span className="truncate">{semaforos.error}</span>
            </div>
            <button
              type="button"
              onClick={() => semaforos.refresh({ silent: false })}
              className="inline-flex shrink-0 items-center gap-2 rounded-lg border border-danger/30 bg-danger/10 px-2.5 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-danger transition-colors hover:bg-danger/20"
            >
              <RefreshCw size={12} className={semaforos.loading ? 'animate-spin' : ''} />
              Recarregar
            </button>
          </div>
        )}

        <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
          <TrafficLightKpi
            loading={semaforos.loading}
            total={semaforos.total}
            online={semaforos.online}
            offline={semaforos.offline}
            operationalPct={semaforos.operationalPct}
            status={semaforos.status}
            lastUpdated={semaforos.lastUpdated}
            onRefresh={semaforos.refresh}
          />

          <Panel className="lg:col-span-2">
            <PanelHeader
              icon={PieChart}
              title="Distribuição por Estado"
              subtitle="Em operação, intermitente, com alarmes e sem comunicação"
            />
            <TrafficLightDonut
              data={semaforos.distribution}
              loading={semaforos.loading}
              total={semaforos.total}
              normalCount={semaforos.normalCount}
            />
          </Panel>

          <Panel className="lg:col-span-2">
            <PanelHeader
              icon={Gauge}
              title="Principais Falhas Detectadas"
              subtitle="Ranking por flag de falha reportada pelos controladores"
            />
            <FaultBreakdown
              data={semaforos.topFailures}
              loading={semaforos.loading}
              total={semaforos.total}
            />
          </Panel>

          <Panel>
            <PanelHeader
              icon={AlertTriangle}
              title="Semáforos com Falha"
              subtitle="Sem comunicação, alarmes, piscantes e modo operador"
            />
            <TrafficLightOccurrences data={semaforos.failures} loading={semaforos.loading} />
          </Panel>
        </div>
      </section>

        </>
      )}
      <Footer />
    </div>
  )
}
