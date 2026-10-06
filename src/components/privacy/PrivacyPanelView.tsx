import { Link } from 'react-router-dom'
import { LEAVE_BOARD_PATH } from '../../lib/leaveBoard'

const section = 'border-t border-ink/10 pt-8'
const heading = 'font-display text-[1.35rem] font-semibold tracking-[-0.02em]'
const body = 'mt-2 max-w-xl text-[1rem] leading-relaxed text-ink/75'
const choice =
  'inline-flex min-h-11 items-center border px-3 text-[0.75rem] font-semibold tracking-[0.06em] uppercase'

export function PrivacyPanelView({
  hidden,
  twoStepOn,
  analyticsOn,
  privacyContact,
  downloadState,
  busy,
  onHidden,
  onDownload,
}: {
  hidden: boolean
  twoStepOn: boolean
  analyticsOn: boolean
  privacyContact: string | null
  downloadState: 'idle' | 'ready' | 'limited' | 'error'
  busy?: boolean
  onHidden: (hidden: boolean) => void
  onDownload: () => void
}) {
  return (
    <div className="max-w-xl" data-screen="your-privacy" data-directory={hidden ? 'hidden' : 'visible'}>
      <p className="text-[0.72rem] font-semibold tracking-[0.14em] text-brass uppercase">Account</p>
      <h1 className="mt-3 font-display text-[2rem] font-semibold tracking-[-0.03em]">Your privacy</h1>

      <section className="mt-8" aria-labelledby="privacy-visibility">
        <h2 id="privacy-visibility" className={heading}>
          Who can see my profile
        </h2>
        <p className={body}>{hidden ? 'Hidden from the directory. Admin can still introduce you.' : 'Visible to members'}</p>
        <div className="mt-4 flex flex-wrap gap-2" role="group" aria-label="Directory visibility">
          <button
            type="button"
            className={`${choice} ${hidden ? 'border-ink/20 text-ink/70' : 'ba-primary border-transparent'}`}
            aria-pressed={!hidden}
            onClick={() => onHidden(false)}
          >
            Visible to members
          </button>
          <button
            type="button"
            className={`${choice} ${hidden ? 'ba-primary border-transparent' : 'border-ink/20 text-ink/70'}`}
            aria-pressed={hidden}
            onClick={() => onHidden(true)}
          >
            Hidden from the directory
          </button>
        </div>
        <p className="mt-3 max-w-xl text-[0.95rem] leading-relaxed text-ink/65">
          Your email, phone and turnover band are never shown in the directory.
        </p>
      </section>

      <section className={section} aria-labelledby="privacy-two-step">
        <h2 id="privacy-two-step" className={heading}>
          Two-step sign-in
        </h2>
        <p className={body}>
          <Link to="/dashboard/two-step" className="font-semibold underline">
            Two-step sign-in
          </Link>{' '}
          is {twoStepOn ? 'on' : 'off'}.
        </p>
      </section>

      <section className={section} aria-labelledby="privacy-files">
        <h2 id="privacy-files" className={heading}>
          My files and AI results
        </h2>
        <p className={body}>See and delete your uploads and AI results. Share status sits on each result.</p>
        <p className="mt-3 flex flex-wrap gap-x-4 gap-y-2">
          <Link to="/dashboard/ai" className="inline-flex min-h-11 items-center text-[0.95rem] font-semibold underline">
            AI tools
          </Link>
          <Link
            to="/dashboard/ai/due-diligence"
            className="inline-flex min-h-11 items-center text-[0.95rem] font-semibold underline"
          >
            Due diligence
          </Link>
        </p>
      </section>

      <section className={section} aria-labelledby="privacy-download">
        <h2 id="privacy-download" className={heading}>
          Download my data
        </h2>
        <p className={body}>Get a copy of your profile, introductions and activity as a file.</p>
        <button
          type="button"
          className="ba-primary mt-4 inline-flex min-h-11 items-center px-4 text-[0.75rem] font-semibold tracking-[0.08em] uppercase disabled:opacity-40"
          disabled={busy}
          onClick={onDownload}
        >
          {busy ? 'Preparing…' : 'Download my data'}
        </button>
        {downloadState === 'ready' ? (
          <p className="mt-3 text-[1rem] text-ink" role="status" data-download="ready">
            Your file is ready. It contains only your records.
          </p>
        ) : null}
        {downloadState === 'limited' ? (
          <p className="mt-3 text-[0.95rem] text-ink/70" role="status">
            You can download again in an hour.
          </p>
        ) : null}
        {downloadState === 'error' ? (
          <p className="mt-3 text-[0.95rem] text-[var(--ba-error)]" role="alert">
            Could not prepare your file. Retry.
          </p>
        ) : null}
      </section>

      <section className={section} aria-labelledby="privacy-close">
        <h2 id="privacy-close" className={heading}>
          Close my membership
        </h2>
        <p className={body}>
          Ask admin to close your membership. Your data is then deleted or anonymised as set out in the Privacy Notice.
        </p>
        <Link to={LEAVE_BOARD_PATH} className="mt-3 inline-flex min-h-11 items-center text-[0.95rem] font-semibold underline">
          Leave Board Arabia
        </Link>
      </section>

      {analyticsOn ? (
        <section className={section} aria-labelledby="privacy-cookies">
          <h2 id="privacy-cookies" className={heading}>
            Cookies and analytics
          </h2>
          <p className={body}>Analytics cookies are set only after you choose Accept. Reject is just as easy.</p>
          <button
            type="button"
            className="mt-3 inline-flex min-h-11 items-center text-[0.95rem] font-semibold underline"
            onClick={() => window.dispatchEvent(new Event('ba-open-consent'))}
          >
            Cookie choices
          </button>
        </section>
      ) : null}

      <section className={section} aria-labelledby="privacy-contact">
        <h2 id="privacy-contact" className={heading}>
          Questions about your data
        </h2>
        {privacyContact ? (
          <p className={body}>{privacyContact}</p>
        ) : (
          <p className={body}>
            <Link to="/privacy" className="font-semibold underline">
              Privacy Notice
            </Link>
          </p>
        )}
      </section>
    </div>
  )
}
