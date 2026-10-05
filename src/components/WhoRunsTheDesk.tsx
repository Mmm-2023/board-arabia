/**
 * Named desk lead on About and Apply.
 * No photo: the repo has no public headshot of this person.
 * No LinkedIn: no Marketing or About profile URL is already published.
 */
export function WhoRunsTheDesk() {
  return (
    <section aria-labelledby="who-runs-the-desk" className="mt-10 border-t border-ink/10 pt-8">
      <h2
        id="who-runs-the-desk"
        className="font-display text-[1.45rem] font-semibold tracking-[-0.02em] text-ink"
      >
        Who runs the desk
      </h2>
      <p className="mt-3 text-[1.08rem] leading-relaxed text-ink">Michael Mateer, Co-Founder and CEO</p>
      <p className="mt-3 max-w-xl text-[0.98rem] leading-relaxed text-ink/65">
        A named person reads applications. There is no public booking calendar.
      </p>
    </section>
  )
}
