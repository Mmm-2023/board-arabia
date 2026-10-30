import type { DirectoryCard } from '../../lib/demoRows'
import { directoryLanguageLine, matchingAsks } from '../../lib/focusCard.ts'

export function DirectoryFocus({
  card,
  expanded,
  viewerLookingFor = [],
  self = false,
}: {
  card: DirectoryCard
  expanded: boolean
  viewerLookingFor?: readonly string[]
  self?: boolean
}) {
  const help = card.can_help_with ?? []
  const looking = card.looking_for ?? []
  const languageLine = directoryLanguageLine(card.languages ?? [])
  const asks = self ? [] : matchingAsks(viewerLookingFor, help)
  if (help.length === 0 && looking.length === 0 && !languageLine && asks.length === 0) return null
  return (
    <div className="mt-3 space-y-3">
      <ChipRow label="Can help with" chips={help} tone="help" line={expanded ? card.can_help_line : ''} />
      <ChipRow label="Looking for" chips={looking} tone="ask" line={expanded ? card.looking_for_line : ''} />
      {languageLine ? <p className="text-[1rem] leading-relaxed text-ink">{languageLine}</p> : null}
      {asks.map((ask) => (
        <p key={ask} className="flex items-start gap-2 text-[1rem] leading-relaxed text-ink">
          <svg viewBox="0 0 16 16" className="mt-0.5 size-4 shrink-0 text-[var(--ba-copper-deep)]" aria-hidden="true">
            <path
              d="M3.5 8.5 6.5 11.5 12.5 4.5"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
          <span>Matches what you are looking for: {ask}</span>
        </p>
      ))}
    </div>
  )
}

function ChipRow({
  label,
  chips,
  tone,
  line,
}: {
  label: string
  chips: readonly string[]
  tone: 'help' | 'ask'
  line?: string
}) {
  const text = (line ?? '').trim()
  if (chips.length === 0 && !text) return null
  const chipClass =
    tone === 'help'
      ? 'bg-[var(--ba-lavender)] text-ink'
      : 'border border-[var(--ba-indigo)] bg-white text-ink'
  return (
    <div>
      {chips.length > 0 ? (
        <>
          <p className="text-[1rem] font-semibold text-ink">{label}</p>
          <ul className="mt-2 flex flex-wrap gap-2">
            {chips.map((chip) => (
              <li key={chip} data-chip="" className={`inline-flex min-h-11 max-w-full items-center px-3 text-[1rem] ${chipClass}`}>
                {chip}
              </li>
            ))}
          </ul>
        </>
      ) : null}
      {text ? (
        <p className={`${chips.length > 0 ? 'mt-2' : ''} border-s-[3px] border-s-[var(--ba-indigo)] ps-3 text-[1rem] leading-relaxed text-ink`}>
          {text}
        </p>
      ) : null}
    </div>
  )
}
