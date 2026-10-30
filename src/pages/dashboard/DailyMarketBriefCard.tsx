import { Link } from 'react-router-dom'
import {
  DAILY_BRIEF_AI_LABEL,
  DAILY_BRIEF_OPEN,
  DAILY_BRIEF_PATH,
  DAILY_BRIEF_TITLE,
  briefUpdatedLabel,
  calendarLabel,
  riyadhTodayKey,
  type MemberBrief,
} from '../../lib/dailyMarketBrief'

export function DailyMarketBriefCard({ brief, now = new Date() }: { brief: MemberBrief; now?: Date }) {
  const top = brief.items.slice(0, 3)
  const older = brief.briefDate !== riyadhTodayKey(now)
  const updated = briefUpdatedLabel(brief.generatedAt)
  const dateLine = older
    ? `Brief from ${calendarLabel(brief.briefDate, false)}`
    : calendarLabel(brief.briefDate, false)
  return (
    <Link
      to={DAILY_BRIEF_PATH}
      data-daily-brief-card=""
      className="mb-8 block max-w-3xl border border-[var(--ba-line)] bg-white px-5 py-4 text-base text-ink"
    >
      <p className="text-[0.9375rem] font-semibold text-ink/70">{DAILY_BRIEF_TITLE}</p>
      <p className="mt-2 text-[0.9375rem] font-semibold text-[var(--ba-indigo)]">{DAILY_BRIEF_AI_LABEL}</p>
      <p className="mt-2 text-[0.9375rem] text-ink/80">{dateLine}</p>
      {updated ? <p className="text-[0.9375rem] text-ink/80">{updated}</p> : null}
      <ul className="mt-3 space-y-2">
        {top.map((item) => (
          <li key={item.url} className="text-base leading-snug">
            {item.headline}
          </li>
        ))}
      </ul>
      <span className="mt-3 inline-flex min-h-11 items-center text-[1.0625rem] font-semibold text-[var(--ba-indigo)] underline">
        {DAILY_BRIEF_OPEN}
      </span>
    </Link>
  )
}
