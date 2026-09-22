import { Link } from 'react-router-dom'
import { CtaBand } from '../components/CtaBand'
import { MarketingLayout } from '../components/MarketingLayout'

const AUDIENCES = [
  {
    title: 'Family offices',
    body: 'Principals who govern or deploy their own capital and need a chair or advisor already in the room.',
  },
  {
    title: 'Private equity',
    body: 'Sponsors with a board seat, a chairman search, or a mandate that should not travel as a cold note.',
  },
  {
    title: 'Venture capital',
    body: 'Funds whose companies will need directors, and who would rather be introduced than scrape a list.',
  },
  {
    title: 'Foreign direct investment',
    body: 'Investors establishing a Saudi presence who need judgment on the ground, not a public directory.',
  },
]

const PATH = [
  {
    n: '01',
    title: 'Write the mandate',
    body: 'Intent, sector, scale, and timing. A mandate is a structured note, not a blast.',
  },
  {
    n: '02',
    title: 'Admin reads it',
    body: 'Nothing is delivered because it was submitted. Admin decides whether it belongs in the room.',
  },
  {
    n: '03',
    title: 'Members who fit',
    body: 'It reaches members who are available and whose sector or Vision 2030 tags match. Others are not copied.',
  },
  {
    n: '04',
    title: 'A room, if the work is live',
    body: 'A deal room opens for a process that is actually underway, and it closes when that work ends.',
  },
]

export function ForCapitalPage() {
  return (
    <MarketingLayout title="For capital — Board Arabia">
      <header className="mx-auto max-w-7xl px-5 pt-12 pb-6 md:px-10 md:pt-20">
        <p className="mb-4 font-serif text-[1.2rem] italic text-ink-soft/70">
          For capital
        </p>
        <h1 className="max-w-3xl font-display text-[clamp(2.5rem,5.5vw,4.4rem)] font-bold leading-[1.02] tracking-[-0.04em] text-balance text-ink">
          Capital reaches the room by mandate.
        </h1>
        <p className="mt-6 max-w-2xl text-[1.08rem] leading-relaxed text-ink/65">
          Family offices, private equity, venture, and foreign direct investors
          do not browse Board Arabia. A mandate is written inside the
          membership and read by admin before a member sees it.
        </p>
      </header>

      <section className="mx-auto max-w-7xl px-5 py-12 md:px-10 md:py-16">
        <h2 className="font-display text-[clamp(1.8rem,3vw,2.5rem)] font-bold tracking-[-0.03em] text-ink">
          Who this is for
        </h2>
        <ul className="mt-10 grid gap-8 sm:grid-cols-2">
          {AUDIENCES.map((item) => (
            <li key={item.title} className="border-t border-ink/10 pt-5">
              <h3 className="font-display text-[1.3rem] font-semibold tracking-[-0.02em] text-ink">
                {item.title}
              </h3>
              <p className="mt-3 text-[1rem] leading-relaxed text-ink/65">
                {item.body}
              </p>
            </li>
          ))}
        </ul>
      </section>

      <section id="inbox" className="bg-ink py-20 text-pearl md:py-28">
        <div className="mx-auto max-w-7xl px-5 md:px-10">
          <p className="mb-4 font-serif text-[1.2rem] italic text-brass-bright/90">
            Mandate inbox
          </p>
          <h2 className="max-w-3xl font-display text-[clamp(2rem,4.5vw,3.4rem)] font-bold leading-[1.05] tracking-[-0.035em] text-balance">
            Admin-gated outreach.
          </h2>
          <p className="mt-6 max-w-2xl text-[1.05rem] leading-relaxed text-stone/75">
            The inbox is how a mandate moves. It is not a messaging product
            and it is not a list of inboxes you can export. This page does
            not take mandates. Filing one requires admission.
          </p>
          <ol className="mt-14 grid gap-10 md:grid-cols-2 lg:grid-cols-4">
            {PATH.map((step) => (
              <li key={step.n}>
                <span className="font-display text-[0.8rem] font-semibold tracking-[0.18em] text-brass">
                  {step.n}
                </span>
                <h3 className="mt-3 font-display text-[1.2rem] font-semibold tracking-[-0.02em]">
                  {step.title}
                </h3>
                <p className="mt-3 text-[0.95rem] leading-relaxed text-stone/70">
                  {step.body}
                </p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section id="rooms" className="mx-auto max-w-7xl px-5 py-20 md:px-10 md:py-28">
        <div className="grid gap-10 md:grid-cols-[1fr_1fr] md:gap-20">
          <div>
            <p className="mb-4 font-serif text-[1.2rem] italic text-ink-soft/70">
              Deal rooms
            </p>
            <h2 className="font-display text-[clamp(2rem,4vw,3.2rem)] font-bold leading-[1.05] tracking-[-0.035em] text-balance text-ink">
              Opened for a live process. Closed when it ends.
            </h2>
          </div>
          <div className="space-y-4 text-[1.05rem] leading-relaxed text-ink/70">
            <p>
              A deal room holds one mandate that has already passed admin:
              the people who need to see it, and no one else. It is not a
              standing data room for the whole membership.
            </p>
            <p>
              Warm introductions that lead into a process follow the same
              rule. Admin releases the introduction. The room does not
              message around that gate.
            </p>
            <p>
              <Link to="/for-members#intros" className="border-b border-brass text-ink">
                How introductions work
              </Link>
            </p>
          </div>
        </div>
      </section>

      <section className="border-t border-ink/10 bg-pearl">
        <div className="mx-auto max-w-7xl px-5 py-16 md:px-10 md:py-20">
          <h2 className="font-display text-[clamp(1.8rem,3vw,2.5rem)] font-bold tracking-[-0.03em] text-ink">
            What capital does not receive
          </h2>
          <ul className="mt-8 grid gap-4 md:grid-cols-2">
            {[
              'An export of the member directory.',
              'A scraped contact list.',
              'A direct message that bypasses admin.',
              'A public calendar for a conversation.',
            ].map((item) => (
              <li
                key={item}
                className="border border-ink/10 px-5 py-4 text-[1.02rem] text-ink/75"
              >
                {item}
              </li>
            ))}
          </ul>
          <p className="mt-8 max-w-2xl text-[1rem] leading-relaxed text-ink/60">
            Principals who belong in the room request consideration. Firms
            that want a working seat on the finance rails use the partner
            path — three seats a year, still gated.
          </p>
          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            <Link
              to="/apply"
              className="inline-flex items-center justify-center bg-ink px-7 py-3.5 text-[0.78rem] font-semibold tracking-[0.08em] text-pearl uppercase"
            >
              Request consideration
            </Link>
            <Link
              to="/partners"
              className="inline-flex items-center justify-center border border-ink/20 px-7 py-3.5 text-[0.78rem] font-semibold tracking-[0.08em] text-ink uppercase"
            >
              Partner with us
            </Link>
          </div>
        </div>
      </section>

      <CtaBand
        eyebrow="Principals"
        title="If you belong in the room, ask."
        body="Consideration is the door. A mandate is what you file after you are admitted — not from this page."
      />
    </MarketingLayout>
  )
}
