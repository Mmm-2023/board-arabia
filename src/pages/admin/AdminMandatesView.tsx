import type { StaffMandateBrief } from '../../lib/mandateMatch'
import type { NewMandateDraft, NewMandateField } from '../../lib/newMandate'
import { EmptyState } from '../../shell/ViewState'
import { STAFF_VIEWS } from '../../shell/viewCopy'
import { MandateDeskCard } from './MandateShortlist'
import { NewMandateForm } from './NewMandateForm'

const copy = STAFF_VIEWS.mandates

export function AdminMandatesView({
  mandates,
  draft,
  field,
  message,
  notice,
  busy,
  onDraft,
  onSubmit,
}: {
  mandates: StaffMandateBrief[]
  draft: NewMandateDraft
  field: NewMandateField | ''
  message: string
  notice: string
  busy: boolean
  onDraft: (draft: NewMandateDraft) => void
  onSubmit: () => void
}) {
  return (
    <div className="max-w-3xl" data-screen="admin-mandates">
      <p className="text-[0.72rem] font-semibold tracking-[0.14em] text-[var(--ba-lavender)] uppercase">Desk</p>
      <h1 className="mt-3 font-display text-[2.1rem] font-bold tracking-[-0.03em]">Mandates</h1>
      <p className="mt-3 max-w-xl text-[1rem] leading-relaxed text-pearl/70">{copy.intro}</p>
      <NewMandateForm
        draft={draft}
        field={field}
        message={message}
        notice={notice}
        busy={busy}
        onDraft={onDraft}
        onSubmit={onSubmit}
      />
      {mandates.length === 0 ? (
        <div className="mt-8">
          <EmptyState tone="staff" message={copy.empty} />
        </div>
      ) : (
        <ul className="mt-8 space-y-3">
          {mandates.map((mandate) => (
            <MandateDeskCard key={mandate.id} mandate={mandate} />
          ))}
        </ul>
      )}
    </div>
  )
}
