import { ArrowLeft, LayoutDashboard } from 'lucide-react'
import { period } from '../../data/mockData'

export function Header({ summaryOpen = false, onToggleSummary }) {
  return (
    <header className="relative isolate overflow-hidden rounded-lg border border-[#2a688f] bg-[#13335a] px-4 py-3 shadow-[0_14px_40px_-20px_rgba(19,51,90,0.55)]">
      <span
        aria-hidden="true"
        className="pointer-events-none absolute right-0 top-0 size-14 bg-[#42b9eb]"
        style={{ clipPath: 'polygon(0 0, 100% 0, 100% 100%)' }}
      />
      <div className="relative flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex min-w-0 items-start gap-3 sm:items-center sm:gap-3">
          <div className="relative aspect-[368/138] w-32 shrink-0 overflow-hidden sm:w-40 lg:w-44">
            <img
              src="/logo-prefeitura-rio-cor-blue.png"
              alt="Prefeitura Rio e Centro de Operações Rio"
              className="h-10 w-auto object-contain"
            />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
              <h1 className="w-full min-w-0 flex-none text-base font-black uppercase leading-tight text-white sm:w-auto sm:flex-1 sm:basis-48 sm:text-lg md:text-xl">
                Tráfego e Mobilidade Urbana
              </h1>
              <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-white/25 bg-white/10 px-2.5 py-0.5 text-[11px] font-semibold text-white">
                <span className="relative flex size-1.5">
                  <span className="absolute inline-flex size-full animate-ping rounded-full bg-ok opacity-75" />
                  <span className="relative inline-flex size-1.5 rounded-full bg-ok" />
                </span>
                Ao vivo
              </span>
            </div>
            <p className="mt-1 text-sm text-white/75">{period.label}</p>
          </div>
        </div>
        {onToggleSummary && (
          <button
            type="button"
            onClick={onToggleSummary}
            className="inline-flex shrink-0 items-center justify-center gap-2 self-start rounded-lg border border-white/25 bg-white/10 px-3 py-2 text-xs font-semibold text-white transition-colors hover:border-white/50 hover:bg-white/15 lg:self-auto"
          >
            {summaryOpen ? <ArrowLeft size={15} /> : <LayoutDashboard size={15} />}
            {summaryOpen ? 'Voltar ao painel' : 'Resumo dos indicadores'}
          </button>
        )}
      </div>
    </header>
  )
}
