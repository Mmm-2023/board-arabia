import { Link } from 'react-router-dom'
import { FAQ } from '../content/seo'
import { DisplayHeading, Eyebrow } from './Type'

export function FaqList() {
  return (
    <section id="faq" aria-labelledby="faq-heading" className="bg-pearl py-24 md:py-32">
      <div className="mx-auto max-w-3xl px-5 md:px-10">
        <Eyebrow>Answers</Eyebrow>
        <DisplayHeading id="faq-heading">Before you write.</DisplayHeading>
        <p className="mt-6 text-[1.05rem] leading-relaxed text-ink/65">
          Board Arabia, in short: a founding membership for chairpersons and
          NEDs in Saudi Arabia and the GCC. Consideration first. No public
          calendar.
        </p>
        <div className="mt-12 border-t border-ink/10">
          {FAQ.map((item) => (
            <article key={item.question} className="border-b border-ink/10 py-8">
              <h3 className="font-display text-[1.35rem] font-semibold tracking-[-0.03em] text-ink">
                {item.question}
              </h3>
              <p className="mt-3 text-[1.05rem] leading-relaxed text-ink/70">
                {item.answer}
              </p>
              {item.to && item.toLabel && (
                <Link
                  to={item.to}
                  className="mt-4 inline-block border-b border-brass text-[0.95rem] text-ink"
                >
                  {item.toLabel}
                </Link>
              )}
            </article>
          ))}
        </div>
      </div>
    </section>
  )
}
