import { useNoIndex } from '../../lib/usePageTitle'
import { MEMBER_VIEWS } from '../../shell/viewCopy'
import { InvitesPage } from './InvitesPage'

export function NetworkPage() {
  useNoIndex('Network | Board Arabia')
  return (
    <div className="max-w-3xl">
      <p className="text-[0.72rem] font-semibold tracking-[0.14em] text-brass uppercase">
        Network
      </p>
      <h1 className="mt-3 font-display text-[2.2rem] font-bold tracking-[-0.03em]">Network</h1>
      <p className="mt-3 max-w-xl text-[1.02rem] leading-relaxed text-ink/60">
        Peer invites and introduction requests live here.
      </p>
      <div className="mt-8">
        <InvitesPage embedded />
      </div>
      <section className="mt-10 border border-ink/10 px-5 py-6" aria-label="Introductions">
        <h2 className="text-[0.72rem] font-semibold tracking-[0.14em] text-ink/40 uppercase">
          Introductions
        </h2>
        <p className="mt-3 text-[1.02rem] leading-relaxed text-ink/65">{MEMBER_VIEWS.network.intros}</p>
        <p className="mt-2 text-[0.95rem] text-ink/45">
          Request intro opens when this desk turns introductions on.
        </p>
      </section>
    </div>
  )
}
