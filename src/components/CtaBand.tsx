import { Link } from 'react-router-dom'
import { Reveal } from './Reveal'
import { Eyebrow } from './Type'
import { trackApplyClick, trackLoginClick } from '../lib/tracking/browser'

export function CtaBand({
  eyebrow = 'Consideration',
  title = 'Apply for consideration.',
  body = 'A pre-vet form. The desk reviews credentials. If you are accepted, the next step arrives by private email.',
  to = '/apply',
  label = 'Apply for consideration',
  memberLogin = false,
  compact = false,
  location = 'closing',
}: {
  eyebrow?: string
  title?: string
  body?: string
  to?: string
  label?: string
  memberLogin?: boolean
  compact?: boolean
  location?: string
}) {
  return (
    <section id={memberLogin ? 'closing' : undefined} className={`relative overflow-hidden bg-stone ${compact ? 'py-8 md:py-12' : 'py-16 md:py-24'}`}>
      <div className="relative mx-auto max-w-3xl px-5 text-center md:px-10">
        <Reveal>
          <Eyebrow>{eyebrow}</Eyebrow>
          <h2 className={`font-display font-bold leading-[1.05] tracking-[-0.04em] text-balance text-ink ${compact ? 'text-[clamp(1.7rem,4vw,2.4rem)]' : 'text-[clamp(2.3rem,5.5vw,4rem)]'}`}>
            {title}
          </h2>
          <p className="ba-quiet mx-auto mt-3 max-w-lg text-[0.9375rem] leading-relaxed">
            {body}
          </p>
          <Link
            to={to}
            className="ba-primary mt-5 inline-flex min-h-12 items-center justify-center px-6 text-[0.9375rem] font-semibold"
            onClick={() => {
              if (to === '/apply') trackApplyClick(location, label)
            }}
          >
            {label}
          </Link>
          {memberLogin ? (
            <p className="mt-3 text-[0.9375rem] text-ink">
              Already a member?{' '}
              <Link
                to="/login"
                className="ba-textlink inline-flex min-h-11 items-center"
                onClick={() => trackLoginClick('closing')}
              >
                Log in
              </Link>
            </p>
          ) : null}
        </Reveal>
      </div>
    </section>
  )
}
