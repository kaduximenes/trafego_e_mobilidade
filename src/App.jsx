import { AlertTriangle, BarChart3, Camera, ChartColumn, Gauge, Lightbulb, Map as MapIcon, PieChart, Radar, RefreshCw, Siren, TrafficCone, Trophy } from 'lucide-react'
import { useFetchEvents } from './hooks/useFetchEvents'
import { useSemaforos } from './hooks/useSemaforos'
import { useWazeTraffic } from './hooks/useWazeTraffic'
import { Header } from './components/layout/Header'
import { KpiSection } from './components/kpi/KpiSection'
import { Panel, PanelHeader, SectionTitle } from './components/ui/Panel'
import { TrafficChart } from './components/charts/TrafficChart'
import { SpeedHistogram } from './components/charts/SpeedHistogram'
import { TopHours } from './components/sections/TopHours'
import { Composition } from './components/sections/Composition'
import { SpeedByClass } from './components/sections/SpeedByClass'
import { Percentiles } from './components/sections/Percentiles'
import { InsightsList } from './components/sections/InsightsList'
import { TrafficLightKpi } from './components/trafficLights/TrafficLightKpi'
import { TrafficLightDonut } from './components/trafficLights/TrafficLightDonut'
import { FaultBreakdown } from './components/trafficLights/FaultBreakdown'
import { TrafficLightOccurrences } from './components/trafficLights/TrafficLightOccurrences'
import { CamerasSection } from './components/cameras/CamerasSection'
import { OccurrenceDashboard } from './components/occurrences/OccurrenceDashboard'
import { OccurrenceMap } from './components/map/OccurrenceMap'
import { WazeLiveMap } from './components/waze/WazeLiveMap'
import { CongestionKpi } from './components/waze/CongestionKpi'
import { formatDecimal, formatNumber } from './utils/format'

function Footer() {
  return (
    <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-corborder px-2 pt-4 text-xs text-text-dim">
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
  const ocorrencias = useFetchEvents({ pollingMs: 60000 })
  const waze = useWazeTraffic({ pollingMs: 120000 })

  const mapLoading = semaforos.loading || ocorrencias.loading

  const mapLastUpdated =
    semaforos.lastUpdated && ocorrencias.lastUpdated
      ? new Date(Math.max(new Date(semaforos.lastUpdated), new Date(ocorrencias.lastUpdated))).toISOString()
      : semaforos.lastUpdated || ocorrencias.lastUpdated

  const refreshMap = () => {
    void semaforos.refresh({ silent: false })
    void ocorrencias.refresh({ silent: false })
  }

  return (
    <div className="mx-auto flex min-h-screen w-full max-w-[1600px] flex-col gap-5 px-4 py-5 md:px-6">
      <Header />
      <KpiSection />

      {/* Seção 0 — Câmeras ao Vivo (API Tixxi) */}
      <section>
        <SectionTitle
          icon={Camera}
          title="Câmeras ao Vivo"
          subtitle="Monitoramento em tempo real da rede de câmeras Tixxi"
        />
        <CamerasSection />
      </section>

      {/* Seção 1 — Volume e Composição do Tráfego */}
      <section>
        <SectionTitle
          icon={BarChart3}
          title="Volume e Composição do Tráfego"
          subtitle="Comportamento horário e participação por tipo de veículo"
        />
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
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

          <Panel className="lg:col-span-2">
            <PanelHeader icon={PieChart} title="Composição do Tráfego" subtitle="Distribuição por tipo de veículo" />
            <Composition />
          </Panel>
        </div>
      </section>

      {/* Seção 2 — Velocidade e Distribuição */}
      <section>
        <SectionTitle
          icon={Gauge}
          title="Velocidade e Distribuição"
          subtitle="Análise por classe de veículo e dispersão do fluxo"
        />
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          <Panel>
            <PanelHeader icon={Gauge} title="Velocidade Média por Classe" subtitle="Média em km/h por veículo" />
            <SpeedByClass />
          </Panel>

          <Panel className="lg:col-span-2">
            <PanelHeader
              icon={ChartColumn}
              title="Distribuição de Velocidades"
              subtitle="Histograma de frequência por faixa km/h"
            />
            <SpeedHistogram />
          </Panel>

          <Panel className="lg:col-span-3">
            <PanelHeader icon={Radar} title="Percentis de Velocidade" subtitle="Curva de dispersão do fluxo" />
            <Percentiles />
          </Panel>
        </div>
      </section>

      {/* Seção 3 — Saúde e Operação dos Semáforos (API Dataprom/Antares) */}
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

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
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

        {/* Correlação: engarrafamento (Waze) × semáforos com falha */}
        <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-3">
          <Panel className="lg:col-span-2">
            <PanelHeader
              icon={MapIcon}
              title="Waze Live Map • Tráfego ao Vivo"
              subtitle="Cruze o engarrafamento reportado com os controladores em falha ao lado"
            />
            <WazeLiveMap />
          </Panel>

          <div className="flex flex-col gap-4">
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
              onRefresh={waze.refresh}
            />

            <Panel>
              <PanelHeader
                icon={Radar}
                title="Leitura Correlacionada"
                subtitle="Falha semafórica e engarrafamento no mesmo período"
              />
              <div className="flex flex-col gap-3 p-5 text-xs">
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
                    ? 'Compare os pontos vermelhos do mapa do Waze com os controladores em falha no painel acima: corredores com semáforo fora de operação tendem a concentrar retenção.'
                    : 'O KPI de engarrafamento depende do feed do Waze for Cities. Enquanto as credenciais não estiverem configuradas, use o mapa apenas como leitura visual; nenhum km é estimado.'}
                </p>
              </div>
            </Panel>
          </div>
        </div>
      </section>

      {/* Seção 4 — Mapa Operacional (ocorrências + semáforos georreferenciados) */}
      <section>
        <SectionTitle
          icon={MapIcon}
          title="Mapa Operacional"
          subtitle="Ocorrências urbanas e controladores semafóricos georreferenciados na cidade do Rio de Janeiro"
        />
        <Panel>
          <OccurrenceMap
            events={ocorrencias.feed}
            controllers={semaforos.controllers}
            loading={mapLoading}
            error={semaforos.error || ocorrencias.error}
            lastUpdated={mapLastUpdated}
            onRefresh={refreshMap}
          />
        </Panel>
      </section>

      {/* Seção 5 — Monitoramento de Ocorrências em Tempo Real */}
      <section>
        <SectionTitle
          icon={Siren}
          title="Monitoramento de Ocorrências"
          subtitle="Eventos ativos categorizados por gravidade e tipo"
        />
        <OccurrenceDashboard />
      </section>

      {/* Seção 6 — Painel Inferior de Insights */}
      <section>
        <SectionTitle
          icon={Lightbulb}
          title="Principais Insights"
          subtitle="Leituras operacionais sobre fluxo de veículos e excesso de velocidade"
        />
        <Panel>
          <PanelHeader icon={Lightbulb} title="Síntese do Período" subtitle="Análise inteligente dos últimos 30 dias de detecção" />
          <InsightsList />
        </Panel>
      </section>

      <Footer />
    </div>
  )
}
