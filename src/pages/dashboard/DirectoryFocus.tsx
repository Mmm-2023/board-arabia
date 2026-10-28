import type { DirectoryCard } from '../../lib/demoRows'

export function DirectoryFocusFace({ card }: { card: DirectoryCard }) {
  const help = card.can_help_with ?? []
  const looking = card.looking_for ?? []
  const languages = card.languages ?? []
  if (help.length === 0 && looking.length === 0 && languages.length === 0) return null
  return (
    <div className="mt-3 space-y-3">
      <ChipRow label="Can help with" chips={help} />
      <ChipRow label="Looking for" chips={looking} />
      <ChipRow label="Languages" chips={languages} />
    </div>
  )
}

export function DirectoryFocusLines({ card }: { card: DirectoryCard }) {
  const help = (card.can_help_line ?? '').trim()
  const looking = (card.looking_for_line ?? '').trim()
  if (!help && !looking) return null
  return (
    <div className="mt-3 space-y-3">
      {help ? <Line label="Can help with" value={help} /> : null}
      {looking ? <Line label="Looking for" value={looking} /> : null}
    </div>
  )
}

function ChipRow({ label, chips }: { label: string; chips: readonly string[] }) {
  if (chips.length === 0) return null
  return (
    <div>
      <p className="text-[0.68rem] font-semibold tracking-[0.12em] text-ink/40 uppercase">{label}</p>
      <ul className="mt-1 flex flex-wrap gap-2">
        {chips.map((chip) => (
          <li
            key={chip}
            className="inline-flex min-h-8 items-center border border-[var(--ba-line)] bg-white px-2 text-[0.85rem] text-ink"
          >
            {chip}
          </li>
        ))}
      </ul>
    </div>
  )
}

function Line({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[0.68rem] font-semibold tracking-[0.12em] text-ink/40 uppercase">{label}</p>
      <p className="mt-0.5 text-[0.95rem] leading-relaxed text-ink/80">{value}</p>
    </div>
  )
}
