import { Bike, Bus, Car, Truck } from 'lucide-react'
import { speedByClass } from '../../data/mockData'
import { formatDecimal } from '../../utils/format'

const icons = { Car, Bike, Bus, Truck }

export function SpeedByClass() {
  const max = Math.max(...speedByClass.map((s) => s.speed))

  return (
    <div className="flex flex-col gap-4 p-5">
      {speedByClass.map((s) => {
        const Icon = icons[s.icon] || Car
        return (
          <div key={s.key} className="group flex items-center gap-3">
            <span
              className="grid size-9 shrink-0 place-items-center rounded-lg"
              style={{ backgroundColor: `${s.color}1f`, color: s.color }}
            >
              <Icon size={17} />
            </span>
            <div className="min-w-0 flex-1">
              <div className="mb-1 flex items-baseline justify-between">
                <span className="text-xs font-medium text-text-main">{s.label}</span>
                <span className="font-mono text-sm font-bold tabular" style={{ color: s.color }}>
                  {formatDecimal(s.speed)}{' '}
                  <span className="text-[10px] font-medium text-text-dim">km/h</span>
                </span>
              </div>
              <div className="h-1.5 w-full overflow-hidden rounded-full bg-cordeep">
                <div
                  className="h-full rounded-full transition-all duration-500 group-hover:brightness-125"
                  style={{
                    width: `${(s.speed / max) * 100}%`,
                    backgroundColor: s.color,
                  }}
                />
              </div>
            </div>
          </div>
        )
      })}
    </div>
  )
}
