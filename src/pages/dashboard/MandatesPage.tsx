import { useNoIndex } from '../../lib/usePageTitle'
import { renderStubStatus } from '../../shell/ViewState'
import { MEMBER_VIEWS } from '../../shell/viewCopy'

export function MandatesPage() {
  useNoIndex('Mandates | Board Arabia')
  return (
    <div className="max-w-3xl">
      <p className="text-[0.72rem] font-semibold tracking-[0.14em] text-brass uppercase">
        Mandates
      </p>
      <h1 className="mt-3 font-display text-[2.2rem] font-bold tracking-[-0.03em]">Mandates</h1>
      <p className="mt-3 max-w-xl text-[1rem] leading-relaxed text-ink/60">
        Admin-gated capital briefs land here after they are approved.
      </p>
      <div className="mt-8">
        {renderStubStatus({
          status: 'empty',
          tone: 'member',
          empty: MEMBER_VIEWS.mandates.empty,
          error: MEMBER_VIEWS.mandates.error,
          denied: MEMBER_VIEWS.mandates.denied,
          filtered: MEMBER_VIEWS.mandates.filtered,
          retryLabel: MEMBER_VIEWS.mandates.retry,
          clearLabel: MEMBER_VIEWS.mandates.clear,
        })}
      </div>
    </div>
  )
}
