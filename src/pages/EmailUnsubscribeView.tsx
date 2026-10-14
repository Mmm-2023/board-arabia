import { Link } from 'react-router-dom'
import { Footer } from '../components/Footer'
import { Nav } from '../components/Nav'
import { UNSUBSCRIBE_BUTTON } from '../lib/emailCampaign'

export function UnsubscribeConfirm({
  tokenPresent,
  done,
  busy = false,
  onConfirm,
}: {
  tokenPresent: boolean
  done: boolean
  busy?: boolean
  onConfirm: () => void
}) {
  return (
    <div className="min-h-dvh bg-pearl text-ink" data-screen="unsubscribe" data-unsubscribe={done ? 'done' : 'confirm'}>
      <Nav />
      <main className="mx-auto max-w-xl px-5 pt-28 pb-16">
        <p className="text-[0.72rem] font-semibold tracking-[0.14em] text-brass uppercase">Email</p>
        <h1 className="mt-3 font-display text-[2rem] font-semibold tracking-[-0.03em]">Unsubscribe</h1>
        {done ? (
          <p className="mt-4 text-[1.05rem] leading-relaxed" role="status">
            You are unsubscribed. You can turn emails back on in{' '}
            <Link to="/dashboard/privacy" className="font-semibold underline">
              Your privacy
            </Link>
            .
          </p>
        ) : (
          <>
            <p className="mt-4 text-[1.05rem] leading-relaxed text-ink/75">
              {tokenPresent
                ? 'This stops Board Arabia email for this link. It does not delete your account.'
                : 'This link is missing a token. Nothing has been changed.'}
            </p>
            <button
              type="button"
              className="ba-primary mt-6 inline-flex min-h-11 items-center px-4 text-[0.75rem] font-semibold tracking-[0.08em] uppercase disabled:opacity-40"
              disabled={!tokenPresent || busy}
              onClick={onConfirm}
            >
              {UNSUBSCRIBE_BUTTON}
            </button>
          </>
        )}
      </main>
      <Footer />
    </div>
  )
}
