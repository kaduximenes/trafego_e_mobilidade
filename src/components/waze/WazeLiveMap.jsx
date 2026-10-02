import { useMemo, useState } from 'react'
import { ExternalLink, Navigation } from 'lucide-react'
import { cn } from '../../utils/cn'

// Centro padrão: município do Rio de Janeiro.
const DEFAULT_CENTER = { lat: -22.9068, lon: -43.1729, zoom: 13 }

const LIVE_MAP_BASE = 'https://embed.waze.com/iframe'

export function WazeLiveMap({
  lat = DEFAULT_CENTER.lat,
  lon = DEFAULT_CENTER.lon,
  zoom = DEFAULT_CENTER.zoom,
  className,
}) {
  const [loaded, setLoaded] = useState(false)

  const embedUrl = useMemo(
    () => `${LIVE_MAP_BASE}?zoom=${zoom}&lat=${lat}&lon=${lon}&ct=livemap`,
    [lat, lon, zoom],
  )

  // Link direto para o Waze Web na mesma visão do iframe.
  const externalUrl = `https://www.waze.com/livemap?zoom=${zoom}&lat=${lat}&lon=${lon}`

  return (
    <div className={cn('flex flex-col', className)}>
      <div className="flex flex-wrap items-center justify-end gap-2 border-b border-corborder-soft px-5 py-2.5">
        <span className="inline-flex items-center gap-1.5 rounded-full border border-primary/30 bg-primary/10 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-primary">
          <Navigation size={11} />
          Fonte: Waze
        </span>
        <a
          href={externalUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 rounded-md border border-corborder-soft px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide text-text-muted transition-colors hover:border-corborder hover:text-text-main"
        >
          <ExternalLink size={11} />
          Abrir no Waze Web
        </a>
      </div>

      <div className="relative h-[450px] w-full">
        {!loaded && (
          <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-3 bg-cordeep/70">
            <span className="size-7 animate-spin rounded-full border-2 border-corborder border-t-primary" />
            <p className="text-[11px] uppercase tracking-wider text-text-dim">Carregando mapa do Waze…</p>
          </div>
        )}

        <iframe
          title="Waze Live Map — Tráfego ao Vivo"
          src={embedUrl}
          onLoad={() => setLoaded(true)}
          loading="lazy"
          allowFullScreen
          referrerPolicy="no-referrer-when-downgrade"
          className="h-full w-full border-0"
        />
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-corborder-soft px-5 py-2.5 text-[11px] text-text-dim">
        <span className="font-mono tabular">
          {lat.toFixed(4)}, {lon.toFixed(4)} • zoom {zoom}
        </span>
        <span className="text-text-muted">
          Camadas de trânsito e alertas são renderizadas pelo próprio Waze.
        </span>
      </div>
    </div>
  )
}
