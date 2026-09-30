import { joinCardMeta } from '../lib/cardMeta'
import { RePlace } from './RePlace'

export function CardMeta({
  parts,
  className,
}: {
  parts: readonly (string | null | undefined)[]
  className?: string
}) {
  const items = joinCardMeta(parts)
  if (items.length === 0) return null
  return (
    <p className={className}>
      {items.map((item, index) => (
        <span key={`${index}:${item}`}>
          {index > 0 ? (
            <>
              <span aria-hidden="true"> · </span>
              <span className="sr-only">, </span>
            </>
          ) : null}
          {item}
        </span>
      ))}
    </p>
  )
}

/** Region mapping plus any later fields. Empty fields do not leave a separator. */
export function PlaceMeta({
  city,
  hint = '',
  trailing,
  className,
}: {
  city: string
  hint?: string
  trailing: readonly (string | null | undefined)[]
  className?: string
}) {
  const place = city.trim()
  const items = joinCardMeta(trailing)
  if (!place && items.length === 0) return null
  return (
    <p className={className}>
      {place ? <RePlace city={place} hint={hint} /> : null}
      {items.map((item, index) => (
        <span key={`${index}:${item}`}>
          {place || index > 0 ? (
            <>
              <span aria-hidden="true"> · </span>
              <span className="sr-only">, </span>
            </>
          ) : null}
          {item}
        </span>
      ))}
    </p>
  )
}
