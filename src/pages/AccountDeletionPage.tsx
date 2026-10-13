import { Link } from 'react-router-dom'
import { MarketingLayout } from '../components/MarketingLayout'
import { LEGAL_PENDING, legalField } from '../config/legal'
import { deletionContact } from '../lib/deletionContact'

export function AccountDeletionPage() {
  const contact = deletionContact(legalField('contactEmail'), LEGAL_PENDING.en)
  return (
    <MarketingLayout path="/account-deletion">
      <article className="mx-auto max-w-3xl px-5 pt-12 pb-16 md:px-10 md:pt-20" data-page="account-deletion">
        <p className="mb-4 font-serif text-[1.2rem] italic text-ink-soft/70">Privacy</p>
        <h1 className="font-display text-[clamp(2.5rem,5.5vw,4.2rem)] font-bold leading-[1.02] tracking-[-0.04em] text-balance text-ink">
          Delete your account
        </h1>
        <p className="mt-6 text-[1.08rem] leading-relaxed text-ink/75">
          A member deletes an account from inside Board Arabia. Sign in, open Your privacy, then choose Delete account.
        </p>
        <h2 className="mt-10 font-display text-[1.55rem] font-semibold tracking-[-0.03em] text-ink">In the app</h2>
        <ol className="mt-3 list-decimal space-y-3 pl-5 text-[1.05rem] leading-relaxed text-ink/75">
          <li>Sign in and open Your privacy.</li>
          <li>Read what is deleted and what is kept, then continue.</li>
          <li>Enter the code sent to the email on the account. The account closes after the code matches.</li>
        </ol>
        <h2 className="mt-10 font-display text-[1.55rem] font-semibold tracking-[-0.03em] text-ink">What is deleted</h2>
        <ul className="mt-3 list-disc space-y-2 pl-5 text-[1.05rem] leading-relaxed text-ink/75">
          <li>Profile and directory card</li>
          <li>Directory listing</li>
          <li>Introductions</li>
          <li>Notifications</li>
          <li>Event replies</li>
        </ul>
        <h2 className="mt-10 font-display text-[1.55rem] font-semibold tracking-[-0.03em] text-ink">What is kept</h2>
        <p className="mt-3 text-[1.05rem] leading-relaxed text-ink/75">
          Legal records and consent logs stay for the period in the retention rules. The account reference on those rows
          is removed, unless a legal hold applies. Deal room files you uploaded stay in the room. AI tool uploads follow
          their own schedule. Contact details already shared with another member through an accepted introduction cannot
          be recalled from that member. Admin sees a notice in the app.
        </p>
        <h2 className="mt-10 font-display text-[1.55rem] font-semibold tracking-[-0.03em] text-ink">
          If you cannot sign in
        </h2>
        <p className="mt-3 text-[1.05rem] leading-relaxed text-ink/75" data-deletion-contact="">
          Write to{' '}
          {contact ? (
            <a href={`mailto:${contact}`}>{contact}</a>
          ) : (
            legalField('contactEmail')
          )}{' '}
          and ask us to delete the account.
        </p>
        <p className="mt-8">
          <Link to="/privacy/" className="border-b border-brass text-ink">
            Privacy Notice
          </Link>
        </p>
      </article>
    </MarketingLayout>
  )
}
