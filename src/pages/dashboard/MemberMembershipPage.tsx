import { Link } from 'react-router-dom'
import { membershipLine } from '../../../supabase/functions/_shared/membership_steps.ts'
import { seatLabel } from '../../lib/member'
import { useNoIndex } from '../../lib/usePageTitle'
import { AccountBackLink } from './AccountBackLink'
import { useMember } from './context'

function statusLabel(status: string) {
  if (status === 'invited') return 'Invited'
  if (status === 'suspended') return 'Suspended'
  return 'Active'
}

export function MemberMembershipPage() {
  const { member } = useMember()
  useNoIndex('Membership | Board Arabia')
  const line = membershipLine(member.tier, member.founding_number)

  return (
    <div className="max-w-xl" data-screen="membership">
      <AccountBackLink />
      <p className="text-[0.72rem] font-semibold tracking-[0.14em] text-brass uppercase">Account</p>
      <h1 className="mt-3 font-display text-[2rem] font-semibold tracking-[-0.03em]">Membership</h1>
      <p className="mt-4 max-w-xl text-[1.05rem] leading-relaxed text-ink/75">
        {line || 'Your membership is active.'}
      </p>
      <p className="mt-3 text-[1rem] leading-relaxed text-ink/70">
        {seatLabel(member.seat)}. {statusLabel(member.status)}.
      </p>
      <p className="mt-3 max-w-xl text-[1rem] leading-relaxed text-ink/70">
        Our admin team looks after membership. Profile holds the details other members can see.
      </p>
      <Link to="/dashboard/profile" className="mt-4 inline-flex min-h-11 items-center text-[0.95rem] font-semibold underline">
        Profile
      </Link>
    </div>
  )
}
