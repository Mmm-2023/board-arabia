import { rePlace } from '../lib/reRegions'

export function RePlace({
  city,
  hint = '',
  className = '',
}: {
  city: string
  hint?: string
  className?: string
}) {
  const place = rePlace(city, hint)
  return (
    <span className={className}>
      {place.region}
      {place.tag ? (
        <span className="ms-2 inline-flex items-center border border-current/25 px-1.5 text-[0.75rem] font-semibold">
          {place.tag}
        </span>
      ) : null}
    </span>
  )
}
