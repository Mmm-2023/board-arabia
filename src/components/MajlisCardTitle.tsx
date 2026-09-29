import { PresentedBy } from './PresentedBy'

export function MajlisCardTitle({
  title,
  featured,
  presentedBy,
  description,
}: {
  title: string
  featured: boolean
  presentedBy: string | null
  description: string
}) {
  return (
    <>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <h3 className="font-display text-[1.15rem] font-semibold">{title}</h3>
        {featured ? (
          <p className="text-[0.72rem] font-semibold tracking-[0.08em] text-[var(--ba-copper-deep)] uppercase">Featured</p>
        ) : null}
      </div>
      <PresentedBy label={presentedBy} />
      <p className="mt-2 text-[0.95rem] leading-relaxed text-[var(--ba-muted)]">{description}</p>
    </>
  )
}
