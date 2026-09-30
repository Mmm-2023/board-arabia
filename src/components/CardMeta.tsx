import { joinCardMeta } from '../lib/cardMeta'

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
