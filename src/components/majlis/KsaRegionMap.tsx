import { MAJLIS_REGIONS, REGION_GEOTAG, type MajlisRegion } from '../../../supabase/functions/_shared/majlis.ts'

const BOUNDS = { minLng: 34.2, maxLng: 55.8, minLat: 16, maxLat: 32.6 }

const NUDGE: Partial<Record<MajlisRegion, { dx: number; dy: number }>> = {
  Jazan: { dx: -28, dy: 4 },
  Najran: { dx: 36, dy: 8 },
  Asir: { dx: 6, dy: -4 },
  'Al Bahah': { dx: -42, dy: 2 },
  Makkah: { dx: -18, dy: 6 },
  Madinah: { dx: -36, dy: 0 },
  Tabuk: { dx: -8, dy: 4 },
  'Al Jawf': { dx: -8, dy: -4 },
  'Northern Borders': { dx: 8, dy: -6 },
  'Eastern Province': { dx: 24, dy: 4 },
  Hail: { dx: 4, dy: -2 },
  Qassim: { dx: 10, dy: -4 },
  Riyadh: { dx: 0, dy: 8 },
}

function project(lat: number, lng: number) {
  const x = 48 + ((lng - BOUNDS.minLng) / (BOUNDS.maxLng - BOUNDS.minLng)) * 540
  const y = 36 + ((BOUNDS.maxLat - lat) / (BOUNDS.maxLat - BOUNDS.minLat)) * 390
  return { x, y }
}

function linesFor(name: string): string[] {
  if (name === 'Eastern Province') return ['Eastern', 'Province']
  if (name === 'Northern Borders') return ['Northern', 'Borders']
  return [name]
}

export function KsaRegionMap({
  counts,
  selected,
  onSelect,
}: {
  counts: Record<string, number>
  selected: string | null
  onSelect: (region: string | null) => void
}) {
  return (
    <div className="overflow-x-auto border border-[var(--ba-line)] bg-[var(--ba-porcelain)] p-3">
      <svg
        viewBox="0 0 640 480"
        role="group"
        aria-label="Map of the 13 regions of Saudi Arabia"
        className="h-auto min-h-[280px] w-full"
      >
        <path
          d="M90 150 L150 70 L250 48 L360 70 L470 110 L520 180 L490 280 L400 360 L300 420 L220 400 L160 340 L90 240 Z"
          fill="var(--ba-lavender-mist)"
          stroke="var(--ba-indigo)"
          strokeWidth="1.5"
        />
        {MAJLIS_REGIONS.map((name) => {
          const geo = REGION_GEOTAG[name]
          const point = project(geo.lat, geo.lng)
          const nudge = NUDGE[name] ?? { dx: 0, dy: 0 }
          const count = counts[name] ?? 0
          const active = selected === name
          const label = linesFor(name)
          return (
            <g
              key={name}
              role="button"
              tabIndex={0}
              aria-pressed={active}
              aria-label={`${name}, ${count} published`}
              className="cursor-pointer"
              onClick={() => onSelect(active ? null : name)}
              onKeyDown={(event) => {
                if (event.key !== 'Enter' && event.key !== ' ') return
                event.preventDefault()
                onSelect(active ? null : name)
              }}
            >
              <circle
                cx={point.x}
                cy={point.y}
                r={26}
                fill={active ? 'var(--ba-indigo)' : count > 0 ? 'var(--ba-indigo-mid)' : 'var(--ba-white)'}
                stroke={active ? 'var(--ba-copper)' : 'var(--ba-indigo)'}
                strokeWidth={active ? 3 : 1.5}
              />
              <text
                x={point.x}
                y={point.y + 4}
                textAnchor="middle"
                fill={count > 0 || active ? 'var(--ba-porcelain)' : 'var(--ba-indigo)'}
                fontSize="13"
                fontWeight="700"
              >
                {count}
              </text>
              <text
                x={point.x + nudge.dx}
                y={point.y + 40 + nudge.dy}
                textAnchor="middle"
                fill="var(--ba-indigo-deep)"
                fontSize="11"
              >
                {label.map((line, index) => (
                  <tspan key={line} x={point.x + nudge.dx} dy={index === 0 ? 0 : 12}>
                    {line}
                  </tspan>
                ))}
              </text>
            </g>
          )
        })}
      </svg>
    </div>
  )
}
