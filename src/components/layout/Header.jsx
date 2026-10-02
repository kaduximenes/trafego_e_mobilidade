import { Activity, CalendarRange, Radar } from 'lucide-react'
import { period } from '../../data/mockData'

export function Header() {
  return (
    <header className="relative overflow-hidden rounded-2xl border border-corborder bg-corpanel/80 px-6 py-5 shadow-[0_14px_40px_-20px_rgba(0,0,0,0.8)]">
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-r from-primary/10 via-transparent to-violet/10" />
      <div className="pointer-events-none absolute -right-16 -top-16 size-48 rounded-full bg-primary/10 blur-3xl" />

      <div className="relative flex flex-wrap items-center justify-between gap-5">
        <div className="flex items-center gap-4">
          <div className="grid size-12 shrink-0 place-items-center rounded-xl bg-gradient-to-br from-primary to-primary-soft text-cordeep shadow-[0_0_24px_rgba(0,168,255,0.4)]">
            <Radar size={26} strokeWidth={2.2} />
          </div>
          <div>
            <div className="flex items-center gap-2.5">
              <h1 className="text-xl font-bold tracking-tight text-text-main md:text-2xl">
                Tráfego e Mobilidade Urbana
              </h1>
              <span className="hidden items-center gap-1.5 rounded-full border border-ok/30 bg-ok/10 px-2.5 py-0.5 text-[11px] font-semibold text-ok sm:inline-flex">
                <span className="relative flex size-1.5">
                  <span className="absolute inline-flex size-full animate-ping rounded-full bg-ok opacity-75" />
                  <span className="relative inline-flex size-1.5 rounded-full bg-ok" />
                </span>
                Ao vivo
              </span>
            </div>
            <p className="mt-0.5 text-sm text-text-muted">{period.label}</p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 rounded-xl border border-corborder bg-cordeep/60 px-3.5 py-2">
            <CalendarRange size={16} className="text-primary" />
            <div className="leading-tight">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-text-dim">
                Período analisado
              </p>
              <p className="font-mono text-xs text-text-main tabular">
                {period.start} <span className="text-text-dim">→</span> {period.end}
              </p>
            </div>
          </div>

          <div className="hidden items-center gap-3 rounded-xl border border-corborder bg-cordeep/60 px-4 py-2.5 lg:flex">
            <div className="grid size-9 place-items-center rounded-lg bg-violet/15 text-violet">
              <Activity size={18} />
            </div>
            <div className="leading-tight">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-text-dim">
                Centro de Operações
              </p>
              <p className="text-sm font-bold text-text-main">COR.Rio • Resiliência</p>
            </div>
          </div>
        </div>
      </div>
    </header>
  )
}
