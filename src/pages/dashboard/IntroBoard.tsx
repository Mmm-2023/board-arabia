import { useState } from 'react'
import { Link } from 'react-router-dom'
import { ExampleMark } from '../../components/ExampleMark'
import { SAMPLE_NOTE } from '../../lib/sampleAction'
import {
  filterIntros,
  INTRO_KINDS,
  INTRO_KIND_LABEL,
  introDirectionLabel,
  introStatusLabel,
  type IntroKind,
  type IntroRow,
} from '../../lib/memberIntros'
import { formatActivityWhen } from '../../lib/homeSnapshot'
import type { ShellTone } from '../../shell/destinations'
import { ConfirmDialog } from '../../shell/ConfirmDialog'
import { EmptyState, FilteredZero } from '../../shell/ViewState'
import { MEMBER_VIEWS } from '../../shell/viewCopy'
import { Chip } from './MemberFilters'

const KIND_OPTIONS = INTRO_KINDS.map((kind) => ({ value: kind, label: INTRO_KIND_LABEL[kind] }))

export function IntroBoard({
  tone,
  rows,
  busyId,
  error,
  onRespond,
  onDecide,
}: {
  tone: ShellTone
  rows: IntroRow[]
  busyId: string | null
  error: string
  onRespond?: (id: string, decision: 'accepted' | 'declined') => void
  onDecide?: (id: string, kind: 'mandate' | 'real_estate' | 'partner', decision: 'approved' | 'declined') => void
}) {
  const [kind, setKind] = useState<IntroKind | null>(null)
  const [decline, setDecline] = useState<IntroRow | null>(null)
  const visible = filterIntros(rows, kind)
  const member = tone === 'member'

  return (
    <div>
      <div role="group" aria-label="Type">
        <p className={`text-[0.72rem] font-semibold tracking-[0.12em] uppercase ${member ? 'text-ink/45' : 'text-pearl/45'}`}>
          Type
        </p>
        <div className="mt-2 flex flex-wrap gap-2">
          <Chip pressed={kind == null} onClick={() => setKind(null)}>
            All
          </Chip>
          {KIND_OPTIONS.map((option) => (
            <Chip
              key={option.value}
              pressed={kind === option.value}
              onClick={() => setKind(kind === option.value ? null : option.value)}
            >
              {option.label}
            </Chip>
          ))}
        </div>
      </div>
      {visible.length === 0 ? (
        <div className="mt-4">
          {rows.length === 0 ? (
            <EmptyState
              tone={tone}
              message={MEMBER_VIEWS.network.intros}
              action={member ? { label: 'Directory', to: '/dashboard/people/directory' } : undefined}
            />
          ) : (
            <FilteredZero
              tone={tone}
              message={MEMBER_VIEWS.network.filtered}
              clearLabel={MEMBER_VIEWS.network.clear}
              onClear={() => setKind(null)}
            />
          )}
        </div>
      ) : (
        <ul className="mt-4 space-y-3">
          {visible.map((row) => (
            <li key={`${row.kind}-${row.id}`}>
              <IntroCard
                tone={tone}
                row={row}
                busy={busyId === row.id}
                onRespond={onRespond}
                onDecide={onDecide}
                onDecline={() => setDecline(row)}
              />
            </li>
          ))}
        </ul>
      )}
      {error ? (
        <p className={`mt-3 text-[0.95rem] ${member ? 'text-[var(--ba-error)]' : 'text-red-300'}`} role="alert">
          {error}
        </p>
      ) : null}
      {decline ? (
        <ConfirmDialog
          tone={tone}
          title={decline.kind === 'member' ? 'Decline this introduction?' : 'Decline this intro?'}
          body={declineBody(decline, member)}
          busy={busyId === decline.id}
          onCancel={() => setDecline(null)}
          onConfirm={() => {
            if (decline.kind === 'member') onRespond?.(decline.id, 'declined')
            else onDecide?.(decline.id, decline.kind, 'declined')
            setDecline(null)
          }}
        />
      ) : null}
    </div>
  )
}

function IntroCard({
  tone,
  row,
  busy,
  onRespond,
  onDecide,
  onDecline,
}: {
  tone: ShellTone
  row: IntroRow
  busy: boolean
  onRespond?: (id: string, decision: 'accepted' | 'declined') => void
  onDecide?: (id: string, kind: 'mandate' | 'real_estate' | 'partner', decision: 'approved' | 'declined') => void
  onDecline: () => void
}) {
  const member = tone === 'member'
  const panel = member ? 'border border-[var(--ba-line)] bg-white' : 'border border-white/15 bg-white/[0.04]'
  const muted = member ? 'text-ink/65' : 'text-pearl/80'
  const when = formatActivityWhen(row.created_at)
  const canAnswer = member && row.kind === 'member' && row.direction === 'incoming' && row.status === 'pending' && !row.is_demo
  const canDecide =
    !member &&
    row.status === 'pending' &&
    !row.is_demo &&
    (row.kind === 'mandate' || row.kind === 'real_estate' || row.kind === 'partner')

  return (
    <article className={`${panel} px-5 py-5`} data-intro-kind={row.kind} data-intro-status={row.status}>
      <div className="flex items-start justify-between gap-4">
        <p className="text-[0.72rem] font-semibold tracking-[0.12em] text-brass uppercase">
          {INTRO_KIND_LABEL[row.kind]}
          <span className="sr-only">. </span>
          <span aria-hidden="true"> · </span>
          {introDirectionLabel(row.direction)}
        </p>
        <div className="text-end">
          {row.is_demo ? <ExampleMark /> : null}
          <p className={`mt-1 text-[0.85rem] ${muted}`}>{introStatusLabel(row.status)}</p>
        </div>
      </div>
      <h2 className={`mt-3 font-display text-[1.35rem] font-semibold tracking-[-0.03em] ${member ? '' : 'text-pearl'}`}>
        {row.title}
      </h2>
      {row.detail ? <p className={`mt-1 text-[0.95rem] ${muted}`}>{row.detail}</p> : null}
      {row.reason ? <p className={`mt-3 text-[1rem] leading-relaxed ${member ? 'text-ink/80' : 'text-pearl/85'}`}>{row.reason}</p> : null}
      {when ? <p className={`mt-3 text-[0.85rem] ${muted}`}>{when}</p> : null}
      {row.is_demo ? <p className={`mt-3 text-[0.92rem] ${muted}`}>{SAMPLE_NOTE}</p> : null}
      {member && row.kind !== 'member' ? (
        <p className="mt-3">
          <Link
            to={row.kind === 'mandate' ? '/dashboard/deals/mandates' : '/dashboard/deals/real-estate'}
            className={`inline-flex min-h-11 items-center underline ${member ? 'text-ink' : 'text-brass-bright'}`}
          >
            {row.kind === 'mandate' ? 'Mandates' : 'Real estate'}
          </Link>
        </p>
      ) : null}
      {canAnswer && onRespond ? (
        <div className="mt-4 flex flex-wrap gap-3">
          <button
            type="button"
            disabled={busy}
            onClick={() => onRespond(row.id, 'accepted')}
            className="ba-primary inline-flex min-h-11 items-center px-4 text-[0.75rem] font-semibold tracking-[0.08em] uppercase disabled:opacity-40"
          >
            Accept
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={onDecline}
            className="inline-flex min-h-11 items-center border border-[var(--ba-line)] bg-white px-4 text-[0.75rem] font-semibold tracking-[0.08em] text-ink uppercase disabled:opacity-40"
          >
            Decline
          </button>
        </div>
      ) : null}
      {canDecide && onDecide ? (
        <div className="mt-4 flex flex-wrap gap-3">
          <button
            type="button"
            disabled={busy}
            onClick={() => onDecide(row.id, row.kind as 'mandate' | 'real_estate' | 'partner', 'approved')}
            className="ba-primary inline-flex min-h-11 items-center px-4 text-[0.75rem] font-semibold tracking-[0.08em] uppercase disabled:opacity-40"
          >
            Approve intro
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={onDecline}
            className="inline-flex min-h-11 items-center border border-white/25 px-4 text-[0.75rem] font-semibold tracking-[0.08em] text-pearl uppercase disabled:opacity-40"
          >
            Decline intro
          </button>
        </div>
      ) : null}
    </article>
  )
}

function declineBody(row: IntroRow, member: boolean): string {
  if (row.kind === 'member') {
    return 'They will see that you declined. Email and phone stay private.'
  }
  if (member) return 'This request stays declined.'
  if (row.kind === 'mandate') return 'The member keeps the general brief. The company, price, and contacts stay locked.'
  if (row.kind === 'real_estate') return 'The member keeps the general brief. The counterparty and terms stay locked.'
  return 'The member keeps the public firm card. Contact details stay off the page.'
}
