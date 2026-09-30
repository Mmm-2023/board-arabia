import { Link } from 'react-router-dom'
import { REASON_CODES, ageLabel, roleLabel, slaTone } from '../../../supabase/functions/_shared/membership_steps.ts'

export type QueueRow = {
  userId: string
  name: string
  role: string
  region: string
  company: string
  vouch: string
  submittedAt: string | null
  state: string
  owner: string
  stateChangedAt: string | null
}

const STATES = [
  'submitted',
  'in_review',
  'needs_info',
  'review_call',
  'waitlisted',
  'approved',
  'declined',
  'closed',
] as const

export function stateLabel(state: string) {
  const labels: Record<string, string> = {
    submitted: 'Submitted',
    in_review: 'In review',
    needs_info: 'Needs info',
    review_call: 'Review call',
    waitlisted: 'Waitlisted',
    approved: 'Approved',
    declined: 'Declined',
    closed: 'Closed',
    open: 'Open',
  }
  return labels[state] || state
}

export function MembershipQueueView({
  rows,
  state,
  counts,
  vouchedOnly,
  region,
  owner,
  onState,
  onVouched,
  onRegion,
  onOwner,
  loading,
  error,
  onRetry,
}: {
  rows: QueueRow[]
  state: string
  counts: Record<string, number>
  vouchedOnly: boolean
  region: string
  owner: string
  onState: (value: string) => void
  onVouched: (value: boolean) => void
  onRegion: (value: string) => void
  onOwner: (value: string) => void
  loading: boolean
  error: string
  onRetry: () => void
}) {
  return (
    <div data-screen="membership-queue">
      <h1 className="font-display text-[2rem] font-semibold tracking-[-0.03em]">Membership requests</h1>
      <p className="mt-2 max-w-2xl text-[0.95rem] text-pearl/65">
        The desk decides. Review call is the only action that emails a private link, and that link is never shown here.
      </p>
      <div className="mt-5 flex gap-2 overflow-x-auto pb-1" role="tablist" aria-label="Request state">
        {STATES.map((item) => (
          <button
            key={item}
            type="button"
            role="tab"
            aria-selected={state === item}
            className={`inline-flex min-h-11 shrink-0 items-center border px-3 text-[0.75rem] font-semibold tracking-[0.06em] uppercase ${
              state === item ? 'ba-primary border-transparent' : 'border-pearl/20 text-pearl/70'
            }`}
            onClick={() => onState(item)}
          >
            {stateLabel(item)} {counts[item] ?? 0}
          </button>
        ))}
      </div>
      <div className="mt-4 flex flex-wrap gap-2">
        <button
          type="button"
          aria-pressed={vouchedOnly}
          className="inline-flex min-h-11 items-center border border-pearl/20 px-3 text-[0.85rem]"
          onClick={() => onVouched(!vouchedOnly)}
        >
          {vouchedOnly ? 'Vouched only' : 'All vouches'}
        </button>
        <label className="inline-flex min-h-11 items-center gap-2 text-[0.85rem]">
          Region
          <select className="min-h-11 border border-pearl/20 bg-transparent px-2" value={region} onChange={(event) => onRegion(event.target.value)}>
            <option value="">All</option>
            <option value="ksa_gcc">KSA</option>
            <option value="intl">Intl</option>
          </select>
        </label>
        <label className="inline-flex min-h-11 items-center gap-2 text-[0.85rem]">
          Owner
          <select className="min-h-11 border border-pearl/20 bg-transparent px-2" value={owner} onChange={(event) => onOwner(event.target.value)}>
            <option value="">All</option>
            <option value="mine">Mine</option>
            <option value="none">Unassigned</option>
          </select>
        </label>
      </div>
      {loading ? <p className="mt-6 text-pearl/60">Loading the queue.</p> : null}
      {error ? (
        <div className="mt-6" role="alert">
          <p>{error}</p>
          <button type="button" className="mt-3 inline-flex min-h-11 items-center underline" onClick={onRetry}>
            Retry
          </button>
        </div>
      ) : null}
      {!loading && !error && rows.length === 0 ? (
        <p className="mt-6 text-pearl/70">No requests in this view.</p>
      ) : null}
      <div className="mt-4 hidden md:block">
        <table className="w-full text-left text-[0.92rem]">
          <thead className="text-[0.72rem] tracking-[0.08em] text-pearl/45 uppercase">
            <tr>
              {['Name', 'Role', 'Region', 'Company', 'Vouched by', 'Submitted', 'Age vs SLA', 'Owner', 'State'].map((heading) => (
                <th key={heading} className="px-2 py-2 font-semibold">{heading}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.userId} className="border-t border-white/10">
                <td className="px-2 py-3">
                  <Link to={`/admin/review/${row.userId}`} className="underline">{row.name}</Link>
                </td>
                <td className="px-2 py-3">{roleLabel(row.role) || row.role}</td>
                <td className="px-2 py-3">{row.region === 'ksa_gcc' ? 'KSA' : 'Intl'}</td>
                <td className="px-2 py-3">{row.company || 'Not listed'}</td>
                <td className="px-2 py-3">{row.vouch || 'None'}</td>
                <td className="px-2 py-3">{row.submittedAt ? ageLabel(row.submittedAt).replace('Today', 'Today') : 'Not submitted'}</td>
                <td className={`px-2 py-3 ${toneClass(slaTone(row.state, row.stateChangedAt, row.submittedAt))}`}>{ageLabel(row.stateChangedAt || row.submittedAt)}</td>
                <td className="px-2 py-3">{row.owner || 'Unassigned'}</td>
                <td className="px-2 py-3">{stateLabel(row.state)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <ul className="mt-4 space-y-3 md:hidden">
        {rows.map((row) => (
          <li key={row.userId} className="border border-white/10 px-4 py-4">
            <Link to={`/admin/review/${row.userId}`} className="font-display text-[1.15rem] font-semibold underline">
              {row.name}
            </Link>
            <p className="mt-1 text-[0.95rem] text-pearl/70">{roleLabel(row.role) || row.role}</p>
            <p className="text-[0.95rem] text-pearl/70">{row.company || 'Company not listed'}</p>
            <p className="mt-2 text-[0.85rem]">
              {stateLabel(row.state)} · {ageLabel(row.stateChangedAt || row.submittedAt)}
            </p>
          </li>
        ))}
      </ul>
    </div>
  )
}

function toneClass(tone: 'ok' | 'attention' | 'late') {
  if (tone === 'late') return 'text-[var(--ba-copper-deep)]'
  if (tone === 'attention') return 'text-[var(--ba-copper)]'
  return ''
}

export type DeskDetail = {
  userId: string
  name: string
  email: string
  role: string
  region: string
  company: string
  title: string
  website: string
  linkedin: string
  statement: string
  crNumber: string
  referral: string
  phone: string
  vouch: string
  state: string
  domainMatch: boolean
  linkedinChecked: boolean
  crChecked: boolean
  seatsLeft: string
  events: { id: string; label: string }[]
  notes: { id: string; body: string; at: string }[]
  firstTouch?: string | null
  firstTouchPaid?: boolean
}

export function MembershipDetailView({
  detail,
  seat,
  tier,
  reason,
  note,
  question,
  busy,
  error,
  confirm,
  onSeat,
  onTier,
  onReason,
  onNote,
  onQuestion,
  onAction,
  onTick,
  onConfirm,
  onCancelConfirm,
}: {
  detail: DeskDetail
  seat: 'ksa' | 'intl'
  tier: 'founding' | 'member'
  reason: string
  note: string
  question: string
  busy: boolean
  error: string
  confirm: 'decline' | 'close' | null
  onSeat: (value: 'ksa' | 'intl') => void
  onTier: (value: 'founding' | 'member') => void
  onReason: (value: string) => void
  onNote: (value: string) => void
  onQuestion: (value: string) => void
  onAction: (action: string) => void
  onTick: (field: 'linkedin_checked' | 'cr_checked', value: boolean) => void
  onConfirm: () => void
  onCancelConfirm: () => void
}) {
  return (
    <div data-screen="membership-detail" className="pb-28">
      <Link to="/admin/review" className="text-[0.95rem] underline">Back to the queue</Link>
      <h1 className="mt-3 font-display text-[2rem] font-semibold tracking-[-0.03em]">{detail.name}</h1>
      <p className="mt-1 text-pearl/65">{stateLabel(detail.state)} · {detail.region === 'ksa_gcc' ? 'KSA' : 'Intl'}</p>
      {detail.firstTouch ? (
        <p className="mt-3" data-chip="first-touch">
          <span className="inline-flex min-h-11 items-center gap-2 border border-white/20 px-3 text-[0.95rem]">
            <span>First touch {detail.firstTouch}</span>
            {detail.firstTouchPaid ? <span className="text-[var(--ba-copper)]">Paid</span> : null}
          </span>
        </p>
      ) : null}
      <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <section className="border border-white/10 px-4 py-4">
          <h2 className="text-[0.72rem] font-semibold tracking-[0.12em] uppercase text-pearl/45">Credentials</h2>
          <dl className="mt-3 space-y-3 text-[0.95rem]">
            <Row label="Role" value={roleLabel(detail.role)} />
            <Row label="Company" value={`${detail.company || 'Not listed'}, ${detail.title || 'Title not listed'}`} />
            <Row label="Website" value={detail.website || 'Not listed'} />
            <Row label="Domain" value={detail.domainMatch ? 'Domain matches' : 'No domain match'} />
            <Row label="LinkedIn" value={detail.linkedin || 'Not listed'} />
            <Row label="Statement" value={detail.statement || 'Not listed'} />
            <Row label="CR number" value={detail.crNumber || 'Not listed'} />
            <Row label="Vouched by" value={detail.vouch || detail.referral || 'None'} />
            <Row label="Phone" value={detail.phone || 'Not listed'} />
          </dl>
          <label className="mt-4 flex min-h-11 items-center gap-2">
            <input type="checkbox" checked={detail.linkedinChecked} onChange={(event) => onTick('linkedin_checked', event.target.checked)} />
            LinkedIn checked
          </label>
          <label className="flex min-h-11 items-center gap-2">
            <input type="checkbox" checked={detail.crChecked} onChange={(event) => onTick('cr_checked', event.target.checked)} />
            CR checked on registry
          </label>
          <h2 className="mt-6 text-[0.72rem] font-semibold tracking-[0.12em] uppercase text-pearl/45">Internal notes</h2>
          <ul className="mt-2 space-y-2">
            {detail.notes.length === 0 ? <li className="text-pearl/55">No notes yet.</li> : null}
            {detail.notes.map((item) => (
              <li key={item.id} className="border border-white/10 px-3 py-2">
                <p>{item.body}</p>
                <p className="mt-1 text-[0.8rem] text-pearl/45">{item.at}</p>
              </li>
            ))}
          </ul>
          <label className="mt-3 block">
            <span className="text-[0.72rem] font-semibold tracking-[0.08em] uppercase text-pearl/45">Add a note</span>
            <textarea className="mt-2 min-h-24 w-full border border-white/15 bg-transparent px-3 py-2" value={note} onChange={(event) => onNote(event.target.value)} />
          </label>
          <button type="button" className="mt-2 inline-flex min-h-11 items-center underline" disabled={busy} onClick={() => onAction('note')}>
            Save note
          </button>
          <h2 className="mt-6 text-[0.72rem] font-semibold tracking-[0.12em] uppercase text-pearl/45">Audit</h2>
          <ul className="mt-2 space-y-1 text-[0.92rem] text-pearl/70">
            {detail.events.length === 0 ? <li>No state changes yet.</li> : null}
            {detail.events.map((item) => (
              <li key={item.id}>{item.label}</li>
            ))}
          </ul>
        </section>
        <section className="border border-white/10 px-4 py-4" data-screen="membership-actions">
          <h2 className="font-display text-[1.3rem] font-semibold">Decision</h2>
          <p className="mt-2 text-[0.95rem] text-pearl/70">{detail.seatsLeft}</p>
          <fieldset className="mt-4">
            <legend className="text-[0.72rem] font-semibold tracking-[0.08em] uppercase text-pearl/45">Seat</legend>
            <label className="mt-2 flex min-h-11 items-center gap-2"><input type="radio" name="seat" checked={seat === 'ksa'} onChange={() => onSeat('ksa')} /> Saudi Arabia</label>
            <label className="flex min-h-11 items-center gap-2"><input type="radio" name="seat" checked={seat === 'intl'} onChange={() => onSeat('intl')} /> International</label>
          </fieldset>
          <fieldset className="mt-3">
            <legend className="text-[0.72rem] font-semibold tracking-[0.08em] uppercase text-pearl/45">Tier</legend>
            <label className="mt-2 flex min-h-11 items-center gap-2"><input type="radio" name="tier" checked={tier === 'founding'} onChange={() => onTier('founding')} /> Founding Member</label>
            <label className="flex min-h-11 items-center gap-2"><input type="radio" name="tier" checked={tier === 'member'} onChange={() => onTier('member')} /> Member</label>
          </fieldset>
          <label className="mt-3 block">
            <span className="text-[0.72rem] font-semibold tracking-[0.08em] uppercase text-pearl/45">Reason</span>
            <select className="mt-2 min-h-11 w-full border border-white/15 bg-transparent px-2" value={reason} onChange={(event) => onReason(event.target.value)}>
              {REASON_CODES.map((item) => (
                <option key={item.id} value={item.id}>{item.label}</option>
              ))}
            </select>
          </label>
          <label className="mt-3 block">
            <span className="text-[0.72rem] font-semibold tracking-[0.08em] uppercase text-pearl/45">Note to the candidate</span>
            <textarea className="mt-2 min-h-20 w-full border border-white/15 bg-transparent px-3 py-2" value={note} onChange={(event) => onNote(event.target.value)} />
          </label>
          <label className="mt-3 block">
            <span className="text-[0.72rem] font-semibold tracking-[0.08em] uppercase text-pearl/45">Question, for Needs info</span>
            <textarea className="mt-2 min-h-20 w-full border border-white/15 bg-transparent px-3 py-2" value={question} onChange={(event) => onQuestion(event.target.value)} />
          </label>
          {error ? <p className="mt-3 text-[0.95rem] text-[var(--ba-copper)]" role="alert">{error}</p> : null}
          <button type="button" className="ba-primary mt-4 inline-flex min-h-11 w-full items-center justify-center px-4 text-[0.75rem] font-semibold tracking-[0.08em] uppercase" disabled={busy} onClick={() => onAction('approve')}>
            Approve
          </button>
          <div className="mt-3 grid gap-2">
            <button type="button" className="inline-flex min-h-11 items-center justify-center border border-pearl/25 px-3" disabled={busy} onClick={() => onAction('needs_info')}>Needs info</button>
            <button type="button" className="inline-flex min-h-11 items-center justify-center border border-pearl/25 px-3" disabled={busy} onClick={() => onAction('review_call')}>Review call</button>
            <button type="button" className="inline-flex min-h-11 items-center justify-center border border-pearl/25 px-3" disabled={busy} onClick={() => onAction('waitlist')}>Waitlist</button>
          </div>
          <p className="mt-3 text-[0.85rem] text-pearl/50">Review call emails a private link. The link is not shown on this page.</p>
          <div className="mt-6 grid gap-2">
            <button type="button" className="inline-flex min-h-11 items-center justify-center border border-[var(--ba-copper)] px-3 text-[var(--ba-copper)]" disabled={busy} onClick={() => onAction('decline')}>Decline</button>
            <button type="button" className="inline-flex min-h-11 items-center justify-center border border-[var(--ba-copper)] px-3 text-[var(--ba-copper)]" disabled={busy} onClick={() => onAction('close')}>Close</button>
          </div>
        </section>
      </div>
      {confirm ? (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-ink/55 p-4 sm:items-center" role="presentation">
          <div role="dialog" aria-modal="true" className="w-full max-w-md border border-white/15 bg-ink px-5 py-5 text-pearl">
            <h2 className="font-display text-[1.4rem] font-semibold">{confirm === 'decline' ? 'Decline this request?' : 'Close this request?'}</h2>
            <p className="mt-3 text-[0.95rem] text-pearl/70">The candidate keeps their sign-in. Decline allows another request after 180 days.</p>
            <div className="mt-5 flex gap-3">
              <button type="button" className="inline-flex min-h-11 items-center px-3 underline" onClick={onCancelConfirm}>Cancel</button>
              <button type="button" className="ba-primary inline-flex min-h-11 items-center px-4 text-[0.75rem] font-semibold tracking-[0.08em] uppercase" onClick={onConfirm}>
                Confirm
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-pearl/40">{label}</dt>
      <dd className="mt-0.5 whitespace-pre-wrap">{value}</dd>
    </div>
  )
}
