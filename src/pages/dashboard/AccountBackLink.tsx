import { Link } from 'react-router-dom'

/** Top back link for account pages. Digest returns Home. The others return to Profile. */
export function AccountBackLink({
  to = '/dashboard/profile',
  label = 'Back to account',
}: {
  to?: string
  label?: string
}) {
  return (
    <p className="mb-4">
      <Link
        to={to}
        data-account-back=""
        className="inline-flex min-h-11 items-center text-[0.95rem] font-semibold underline"
      >
        {label}
      </Link>
    </p>
  )
}
