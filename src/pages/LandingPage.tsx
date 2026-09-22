import { motion, useScroll, useTransform } from 'motion/react'
import { useRef } from 'react'
import { Link } from 'react-router-dom'
import { Footer } from '../components/Footer'
import { Nav } from '../components/Nav'
import { Reveal } from '../components/Reveal'

const HERO_IMAGE =
  'https://images.unsplash.com/photo-1586724237569-f3d0c1dee8c6?auto=format&fit=crop&w=2400&q=80'

const CREDENTIAL_PATHS = [
  'Chairpersons',
  'Board advisors',
  'Aspiring NEDs',
]

export function LandingPage() {
  return (
    <>
      <Nav />
      <main>
        <Hero />
        <PathsStrip />
        <AboutSection />
        <ProcessSection />
        <BookCtaSection />
      </main>
      <Footer />
    </>
  )
}

function Hero() {
  const ref = useRef<HTMLElement | null>(null)
  const { scrollYProgress } = useScroll({
    target: ref,
    offset: ['start start', 'end start'],
  })
  const imageY = useTransform(scrollYProgress, [0, 1], ['0%', '14%'])
  const contentY = useTransform(scrollYProgress, [0, 1], ['0%', '6%'])
  const opacity = useTransform(scrollYProgress, [0, 0.7], [1, 0.45])

  return (
    <section id="top" ref={ref} className="relative min-h-dvh overflow-hidden bg-ink">
      <motion.div style={{ y: imageY }} className="absolute inset-0">
        <img
          src={HERO_IMAGE}
          alt="Modern skyline over Riyadh at dusk"
          className="h-[120%] w-full object-cover object-[center_30%]"
        />
        <div className="absolute inset-0 bg-gradient-to-b from-ink/45 via-ink/35 to-ink/90" />
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_30%_40%,transparent_0%,rgba(6,42,40,0.55)_75%)]" />
      </motion.div>

      <motion.div
        style={{ y: contentY, opacity }}
        className="relative z-10 mx-auto flex min-h-dvh max-w-7xl flex-col px-5 pb-12 pt-28 sm:px-6 md:px-10 md:pb-16 md:pt-32"
      >
        <div className="mt-auto max-w-4xl pb-2 md:pb-4">
          <motion.p
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 0.1, ease: [0.22, 1, 0.36, 1] }}
            className="mb-4 font-serif text-[1.1rem] italic text-stone/85 md:text-[1.25rem]"
          >
            Private membership
          </motion.p>

          <motion.h1
            initial={{ opacity: 0, y: 36 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{
              duration: 1.05,
              delay: 0.18,
              ease: [0.22, 1, 0.36, 1],
            }}
            className="font-display text-[clamp(3.4rem,11vw,8.5rem)] font-extrabold leading-[0.88] tracking-[-0.045em] text-pearl"
          >
            Board
            <br />
            Arabia
          </motion.h1>

          <motion.div
            initial={{ opacity: 0, y: 22 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.9, delay: 0.4, ease: [0.22, 1, 0.36, 1] }}
            className="mt-7 flex max-w-3xl flex-col gap-7 md:mt-9 md:flex-row md:items-end md:justify-between md:gap-12"
          >
            <p className="max-w-md text-[1.05rem] leading-relaxed text-stone/90 md:text-[1.15rem]">
              A selective circle for Saudi and GCC chairpersons, board advisors,
              and aspiring NEDs. Book a conversation, then complete verification.
            </p>

            <div className="flex shrink-0 flex-col gap-3 sm:flex-row">
              <Link
                to="/book"
                className="inline-flex items-center justify-center bg-brass px-6 py-3.5 text-[0.78rem] font-semibold tracking-[0.08em] text-ink uppercase transition-colors hover:bg-brass-bright"
              >
                Book a conversation
              </Link>
              <a
                href="#process"
                className="inline-flex items-center justify-center border border-pearl/35 px-6 py-3.5 text-[0.78rem] font-semibold tracking-[0.08em] text-pearl uppercase transition-colors hover:border-pearl hover:bg-pearl/5"
              >
                See the process
              </a>
            </div>
          </motion.div>
        </div>
      </motion.div>
    </section>
  )
}

function PathsStrip() {
  return (
    <section className="border-b border-ink/8 bg-pearl py-9 md:py-11">
      <div className="mx-auto max-w-7xl px-5 md:px-10">
        <p className="text-center text-[0.7rem] font-semibold tracking-[0.16em] text-ink/40 uppercase">
          Built for
        </p>
        <ul className="mt-4 flex flex-wrap items-center justify-center gap-x-3 gap-y-2 md:mt-5 md:gap-x-2">
          {CREDENTIAL_PATHS.map((label, i) => (
            <li key={label} className="flex items-center gap-3 md:gap-4">
              {i > 0 && (
                <span aria-hidden className="hidden h-3 w-px bg-ink/15 sm:block" />
              )}
              <span className="font-display text-[0.9rem] font-semibold tracking-[-0.02em] text-ink/70 md:text-[1rem]">
                {label}
              </span>
            </li>
          ))}
        </ul>
      </div>
    </section>
  )
}

function AboutSection() {
  return (
    <section id="about" className="grain relative overflow-hidden bg-pearl py-24 md:py-32">
      <div className="relative mx-auto max-w-7xl px-5 md:px-10">
        <Reveal>
          <p className="mb-4 font-serif text-[1.2rem] italic text-ink-soft/70">
            The club
          </p>
          <h2 className="max-w-3xl font-display text-[clamp(2.2rem,5vw,3.85rem)] font-bold leading-[1.05] tracking-[-0.035em] text-balance text-ink">
            Prestige through credentials, not open signup.
          </h2>
          <p className="mt-5 max-w-xl text-[1.05rem] leading-relaxed text-ink/60">
            Board Arabia is a reviewed membership. You book a conversation first,
            then submit the details we need to verify fit. Acceptance is earned.
          </p>
        </Reveal>
      </div>
    </section>
  )
}

function ProcessSection() {
  return (
    <section id="process" className="relative bg-ink py-24 text-pearl md:py-32">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-[0.07]"
        style={{
          backgroundImage:
            'linear-gradient(to right, #e6e2da 1px, transparent 1px), linear-gradient(to bottom, #e6e2da 1px, transparent 1px)',
          backgroundSize: '72px 72px',
          maskImage:
            'radial-gradient(ellipse at center, black 20%, transparent 75%)',
        }}
      />
      <div className="relative mx-auto max-w-7xl px-5 md:px-10">
        <Reveal>
          <p className="mb-4 font-serif text-[1.2rem] italic text-brass-bright/90">
            How it works
          </p>
          <h2 className="max-w-3xl font-display text-[clamp(2.2rem,5vw,3.85rem)] font-bold leading-[1.05] tracking-[-0.035em] text-balance">
            Book. Verify. Review.
          </h2>
          <p className="mt-6 max-w-xl text-[1.05rem] leading-relaxed text-stone/75">
            No open signup. A calendar hold comes first; your verification form
            follows. We review credentials and respond.
          </p>
        </Reveal>

        <ol className="mt-16 grid gap-10 md:mt-20 md:grid-cols-3 md:gap-8">
          {[
            {
              step: '01',
              title: 'Book a conversation',
              body: 'Choose a Google Calendar slot. We soft-hold the time until your form arrives.',
            },
            {
              step: '02',
              title: 'Complete verification',
              body: 'Share turnover, companies involved with, and job titles. LinkedIn URL is optional.',
            },
            {
              step: '03',
              title: 'Credential review',
              body: 'Michael reviews every submission. Status moves from pending to verified when cleared.',
            },
          ].map((item, i) => (
            <Reveal key={item.step} delay={0.08 * i}>
              <li className="flex flex-col">
                <span className="font-display text-[0.85rem] font-semibold tracking-[0.2em] text-brass">
                  {item.step}
                </span>
                <h3 className="mt-4 font-display text-[1.3rem] font-semibold tracking-[-0.02em]">
                  {item.title}
                </h3>
                <p className="mt-3 text-[0.95rem] leading-relaxed text-stone/70">
                  {item.body}
                </p>
              </li>
            </Reveal>
          ))}
        </ol>
      </div>
    </section>
  )
}

function BookCtaSection() {
  return (
    <section className="relative overflow-hidden bg-stone py-24 md:py-32">
      <div
        aria-hidden
        className="pointer-events-none absolute left-1/2 top-0 h-[22rem] w-[22rem] -translate-x-1/2 rounded-full bg-brass/15 blur-3xl"
      />
      <div className="relative mx-auto max-w-3xl px-5 text-center md:px-10">
        <Reveal>
          <p className="mb-4 font-serif text-[1.25rem] italic text-ink-soft/70">
            Begin
          </p>
          <h2 className="font-display text-[clamp(2.3rem,5.5vw,4rem)] font-bold leading-[1.02] tracking-[-0.04em] text-balance text-ink">
            Book first. Verify after.
          </h2>
          <p className="mx-auto mt-6 max-w-lg text-[1.05rem] leading-relaxed text-ink/65">
            Reserve a conversation slot, then return here to submit your
            verification details.
          </p>
          <Link
            to="/book"
            className="mt-10 inline-flex items-center justify-center bg-ink px-8 py-4 text-[0.78rem] font-semibold tracking-[0.08em] text-pearl uppercase transition-colors hover:bg-ink-soft"
          >
            Book a conversation
          </Link>
        </Reveal>
      </div>
    </section>
  )
}
