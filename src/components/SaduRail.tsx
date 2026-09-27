import { useId } from 'react'
import tileSvg from '../../public/brand/ba-sadu-rail.svg?raw'

const viewBox = tileSvg.match(/viewBox="0 0 (\d+) (\d+)"/)
const TILE_W = Number(viewBox?.[1] ?? 16)
const TILE_H = Number(viewBox?.[2] ?? 64)

/** Hero width. Quiet marketing edges use half of this. */
const FULL_W = 64
const QUIET_W = 32

const tileInner = tileSvg
  .replace(/<\?xml[^?]*\?>/, '')
  .replace(/<!--[\s\S]*?-->/, '')
  .replace(/<svg[^>]*>/, '')
  .replace(/<\/svg>\s*$/, '')

/**
 * Vertical Sadu strip. Decorative only.
 * `hero` is the landing statement rail. `quiet` is the half-width marketing edge.
 */
export function SaduRail({
  hero = false,
  quiet = false,
}: {
  hero?: boolean
  quiet?: boolean
}) {
  const id = `ba-sadu-${useId().replace(/:/g, '')}`
  const width = quiet ? QUIET_W : FULL_W
  const scale = width / TILE_W
  const tilePxH = TILE_H * scale

  return (
    <div
      className={`ba-sadu-rail${quiet ? ' ba-sadu-rail--quiet' : ''}${hero ? ' ba-sadu-rail--hero' : ''}`}
      aria-hidden="true"
    >
      <svg
        width="100%"
        height="100%"
        preserveAspectRatio="none"
        focusable="false"
        shapeRendering="crispEdges"
      >
        <defs>
          <pattern
            id={id}
            width={width}
            height={tilePxH}
            patternUnits="userSpaceOnUse"
          >
            <g
              transform={`scale(${scale})`}
              dangerouslySetInnerHTML={{ __html: tileInner }}
            />
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill={`url(#${id})`} />
      </svg>
    </div>
  )
}
