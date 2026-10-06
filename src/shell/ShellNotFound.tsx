import { Link } from 'react-router-dom'
import { useNoIndex } from '../lib/usePageTitle'

/** Same words in the member shell and the staff shell. */
export function ShellNotFound({ homeTo }: { homeTo: '/dashboard' | '/admin' }) {
  useNoIndex('Page not found | Board Arabia')
  return (
    <div className="max-w-xl" data-screen="not-found">
      <h1 className="font-display text-[2rem] font-bold tracking-[-0.03em]">Page not found</h1>
      <p className="mt-3 text-[1rem] leading-relaxed">This address is not a Board Arabia page.</p>
      <Link to={homeTo} className="mt-6 inline-flex min-h-11 items-center text-[0.95rem] font-semibold">
        Home
      </Link>
    </div>
  )
}
