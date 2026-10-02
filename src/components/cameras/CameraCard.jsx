import { useState } from 'react'
import { Cctv, MapPin, Play, RefreshCw } from 'lucide-react'
import { CameraStatusBadge } from './CameraStatusBadge'
import { cn } from '../../utils/cn'

export function CameraCard({ camera }) {
  const [streamEnabled, setStreamEnabled] = useState(false)
  const [streamFailed, setStreamFailed] = useState(false)

  const canStream = !!camera.streamUrl

  return (
    <div className="group overflow-hidden rounded-2xl border border-corborder bg-corpanel/80 transition-all duration-300 card-glow">
      {/* Área do stream */}
      <div className="relative aspect-video w-full overflow-hidden bg-cordeep">
        {streamEnabled && canStream ? (
          <img
            src={camera.streamUrl}
            alt={`Stream da câmera ${camera.code}`}
            className="h-full w-full object-cover"
            onError={() => setStreamFailed(true)}
          />
        ) : (
          <div className="flex h-full w-full flex-col items-center justify-center gap-3 bg-[radial-gradient(ellipse_at_center,rgba(0,168,255,0.08),transparent_70%)]">
            <span
              className={cn(
                'grid size-12 place-items-center rounded-full transition-colors',
                streamFailed ? 'bg-danger/15 text-danger' : 'bg-primary/10 text-primary',
              )}
            >
              <Cctv size={24} />
            </span>
            {streamFailed ? (
              <span className="text-xs font-medium text-danger">Falha ao carregar o stream</span>
            ) : (
              <span className="text-xs text-text-muted">Pré-visualização disponível</span>
            )}
          </div>
        )}

        {/* Overlay de status */}
        <div className="absolute left-2 top-2">
          <CameraStatusBadge statusRaw={camera.statusRaw} />
        </div>

        {/* Botão de play */}
        {canStream && !streamEnabled && (
          <button
            type="button"
            onClick={() => {
              setStreamFailed(false)
              setStreamEnabled(true)
            }}
            className="absolute inset-0 m-auto grid size-14 place-items-center rounded-full border border-white/20 bg-cordeep/70 text-white backdrop-blur-sm transition-all duration-300 hover:scale-110 hover:bg-primary/40"
            aria-label={`Abrir stream da câmera ${camera.code}`}
          >
            <Play size={22} fill="currentColor" />
          </button>
        )}
      </div>

      {/* Rodapé do card */}
      <div className="flex items-start justify-between gap-2 px-3.5 py-3">
        <div className="min-w-0">
          <p className="truncate text-xs font-semibold text-text-main" title={camera.name}>
            {camera.name}
          </p>
          <p className="mt-0.5 flex items-center gap-1 font-mono text-[10px] text-text-dim tabular">
            <MapPin size={10} className="shrink-0" />
            #{camera.code}
            {camera.latitude != null && (
              <>
                {' '}
                • {camera.latitude.toFixed(4)}, {camera.longitude.toFixed(4)}
              </>
            )}
          </p>
        </div>
        {streamEnabled && (
          <button
            type="button"
            onClick={() => {
              setStreamEnabled(false)
              setStreamFailed(false)
            }}
            className="grid size-7 shrink-0 place-items-center rounded-lg border border-corborder text-text-muted transition-colors hover:text-primary"
            aria-label="Reiniciar stream"
          >
            <RefreshCw size={13} />
          </button>
        )}
      </div>
    </div>
  )
}
