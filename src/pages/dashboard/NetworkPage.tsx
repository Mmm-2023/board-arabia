import { useNoIndex } from '../../lib/usePageTitle'
import { InvitesPage } from './InvitesPage'

export function NetworkPage() {
  useNoIndex('Invites | Board Arabia')
  return (
    <div className="max-w-3xl">
      <h1 className="font-display text-[2.2rem] font-bold tracking-[-0.03em]">Invites</h1>
      <p className="mt-3 max-w-xl text-[1.02rem] leading-relaxed text-ink/60">
        Peer invites live here. People you invite are still reviewed.
      </p>
      <div className="mt-8">
        <InvitesPage embedded />
      </div>
    </div>
  )
}
