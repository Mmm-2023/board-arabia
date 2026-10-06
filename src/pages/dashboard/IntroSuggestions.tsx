import { type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { Avatar } from '../../components/Avatar'
import { suggestionDetail, WEEKLY_INTRO_SUGGESTION_LINE, type IntroSuggestion } from '../../lib/introSuggestions'
import type { IntroQuota, IntroStatus } from '../../lib/memberIntros'
import { EmptyState } from '../../shell/ViewState'
import { DirectoryIntroAction } from './DirectoryIntroAction'

export function IntroSuggestions({
  rows,
  quota,
  introStatus,
  busyId,
  errorId,
  error,
  showEmpty = false,
  portrait,
  onRequest,
}: {
  rows: IntroSuggestion[]
  quota: IntroQuota | null
  introStatus: (id: string) => IntroStatus | null
  busyId: string | null
  errorId: string | null
  error: string
  showEmpty?: boolean
  portrait?: (row: IntroSuggestion) => ReactNode
  onRequest: (id: string, reason: string, askDesk: boolean) => void
}) {
  if (rows.length === 0 && !showEmpty) return null

  return (
    <section aria-label="Suggested introductions" className="mt-5" data-intro-suggestions="">
      <h2 className="text-[0.72rem] font-semibold tracking-[0.14em] text-ink/40 uppercase">Suggested introductions</h2>
      <p className="mt-2 text-[0.95rem] leading-relaxed text-ink/55">{WEEKLY_INTRO_SUGGESTION_LINE}</p>
      {rows.length === 0 ? (
        <div className="mt-3">
          <EmptyState tone="member" message="No suggested introductions this week." />
        </div>
      ) : (
        <ul className="mt-3 space-y-3">
          {rows.map((row) => (
            <li key={row.id} className="min-w-0 border border-[var(--ba-line)] bg-white px-5 py-5">
              <div className="flex min-w-0 items-center gap-3">
                {portrait ? (
                  portrait(row)
                ) : (
                  <Avatar src={null} avatarStyle={row.avatar_style} size={48} alt="" />
                )}
                <div className="min-w-0">
                  <h3 className="truncate font-display text-[1.35rem] font-semibold tracking-[-0.03em]">{row.full_name}</h3>
                  {suggestionDetail(row) ? (
                    <p className="mt-1 truncate text-[0.95rem] text-ink/65">{suggestionDetail(row)}</p>
                  ) : null}
                </div>
              </div>
              <p className="mt-3 text-[1rem] leading-relaxed break-words text-ink/80">{row.reason}</p>
              <DirectoryIntroAction
                sample={false}
                self={false}
                status={introStatus(row.suggested_id)}
                busy={busyId === row.suggested_id}
                error={errorId === row.suggested_id ? error : ''}
                quota={quota}
                initialReason={row.reason}
                onRequest={(reason, askDesk) => onRequest(row.suggested_id, reason, askDesk)}
              />
            </li>
          ))}
        </ul>
      )}
      {rows.length === 0 ? null : (
        <p className="mt-3">
          <Link to="/dashboard/people/directory" className="inline-flex min-h-11 items-center text-ink underline">
            Directory
          </Link>
        </p>
      )}
    </section>
  )
}
