import { Link } from 'react-router-dom'
import { Reveal } from './Reveal'
import { Eyebrow } from './Type'

export function CtaBand({
  eyebrow = 'Consideration',
  title = 'Request consideration.',
  body = 'A pre-vet form. A human review. If you are accepted, the next step arrives by private email.',
  to = '/apply',
  label = 'Request consideration',
}: {
  eyebrow?: string
  title?: string
  body?: string
  to?: string
  label?: string
}) {
  return (
    <section className="relative overflow-hidden bg-stone py-24 md:py-32">
      <div
        aria-hidden
        className="pointer-events-none absolute left-1/2 top-0 h-[22rem] w-[22rem] -translate-x-1/2 rounded-full bg-brass/15 blur-3xl"
      />
      <div className="relative mx-auto max-w-3xl px-5 text-center md:px-10">
        <Reveal>
          <Eyebrow>{eyebrow}</Eyebrow>
          <h2 className="font-display text-[clamp(2.3rem,5.5vw,4rem)] font-bold leading-[1.02] tracking-[-0.04em] text-balance text-ink">
            {title}
          </h2>
          <p className="mx-auto mt-6 max-w-lg text-[1.05rem] leading-relaxed text-ink/65">
            {body}
          </p>
          <Link
            to={to}
            className="mt-10 inline-flex items-center justify-center bg-ink px-8 py-4 text-[0.78rem] font-semibold tracking-[0.08em] text-pearl uppercase transition-colors hover:bg-ink-soft"
          >
            {label}
          </Link>
        </Reveal>
      </div>
    </section>
  )
}
