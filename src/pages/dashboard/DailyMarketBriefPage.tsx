import { useEffect, useState } from 'react'
import {
  DAILY_BRIEF_AI_LABEL,
  DAILY_BRIEF_EMPTY,
  DAILY_BRIEF_FOOTER,
  DAILY_BRIEF_GROUP_LABEL,
  DAILY_BRIEF_TITLE,
  briefDateLabel,
  readMemberDailyBrief,
  type MemberBrief,
} from '../../lib/dailyMarketBrief'
import { useNoIndex } from '../../lib/usePageTitle'
import { CardSkeleton } from '../../shell/ViewState'

export function DailyMarketBriefPage() {
  const [brief, setBrief] = useState<MemberBrief | null>(null)
  const [loaded, setLoaded] = useState(false)
  useNoIndex(`${DAILY_BRIEF_TITLE} | Board Arabia`)

  useEffect(() => {
    let cancelled = false
    void readMemberDailyBrief().then((next) => {
      if (cancelled) return
      setBrief(next)
      setLoaded(true)
    })
    return () => {
      cancelled = true
    }
  }, [])

  if (!loaded) return <CardSkeleton tone="member" label="Loading brief" />
  return <DailyMarketBriefView brief={brief} />
}

export function DailyMarketBriefView({ brief }: { brief: MemberBrief | null }) {
  if (!brief || brief.items.length === 0) {
    return (
      <div className="max-w-3xl" data-daily-brief-page="" data-daily-brief-empty="">
        <h1 className="font-display text-[2rem] font-semibold tracking-[-0.03em]">{DAILY_BRIEF_TITLE}</h1>
        <p className="mt-3 text-[1rem] leading-relaxed text-ink/70">{DAILY_BRIEF_EMPTY}</p>
      </div>
    )
  }
  return (
    <div className="max-w-3xl" data-daily-brief-page="">
      <h1 className="font-display text-[2rem] font-semibold tracking-[-0.03em]">{DAILY_BRIEF_TITLE}</h1>
      <p className="mt-2 text-[0.95rem] text-ink/70">{briefDateLabel(brief.briefDate)}</p>
      <ul className="mt-6 space-y-3">
        {brief.items.map((item) => (
          <li key={item.url} className="border border-[var(--ba-line)] bg-white px-4 py-4">
            <p className="text-[0.72rem] font-semibold tracking-[0.12em] text-ink/50 uppercase">
              {DAILY_BRIEF_GROUP_LABEL[item.group]}
            </p>
            <p className="mt-2 text-[0.72rem] font-semibold tracking-[0.08em] text-[var(--ba-indigo)] uppercase">
              {DAILY_BRIEF_AI_LABEL}
            </p>
            <p className="mt-1 text-[1rem] leading-relaxed text-ink">{item.summary}</p>
            <p className="mt-3 text-[0.95rem] text-ink/80">{item.outlet}</p>
            <p className="text-[0.95rem] text-ink/70">{briefDateLabel(item.dated)}</p>
            <a
              href={item.url}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-1 inline-flex min-h-11 items-center text-[0.95rem] font-semibold text-[var(--ba-indigo)] underline"
            >
              Source
            </a>
          </li>
        ))}
      </ul>
      <p className="mt-6 text-[0.95rem] leading-relaxed text-ink/70">{DAILY_BRIEF_FOOTER}</p>
    </div>
  )
}
