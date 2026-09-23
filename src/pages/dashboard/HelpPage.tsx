import { Link } from 'react-router-dom'
import { useNoIndex } from '../../lib/usePageTitle'

export function HelpPage() {
  useNoIndex('Help | Board Arabia')
  return (
    <div className="max-w-xl">
      <p className="text-[0.72rem] font-semibold tracking-[0.14em] text-brass uppercase">Help</p>
      <h1 className="mt-3 font-display text-[2.2rem] font-bold tracking-[-0.03em]">Help</h1>
      <p className="mt-4 text-[1.02rem] leading-relaxed text-ink/65">
        Profile holds your details and password. Network holds your two peer invites. If a seat
        looks wrong, sign out and write to the membership from the address on your invitation.
      </p>
      <ul className="mt-6 space-y-2">
        <li>
          <Link to="/dashboard/profile" className="inline-flex min-h-11 items-center text-ink/75">
            Profile
          </Link>
        </li>
        <li>
          <Link to="/dashboard/network" className="inline-flex min-h-11 items-center text-ink/75">
            Network
          </Link>
        </li>
      </ul>
    </div>
  )
}
