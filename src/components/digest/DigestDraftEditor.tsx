import { DIGEST_AUDIENCE_OPTIONS, digestAudienceLabel } from '../../lib/digestAudience'
import type { MembershipTierId } from '../../lib/membershipTiers'
import type { WeeklyDigestModel } from '../../lib/weeklyDigest'

export type DigestPickLists = {
  members: WeeklyDigestModel['newMembers']
  mandates: WeeklyDigestModel['newMandates']
  events: WeeklyDigestModel['upcomingEvents']
}

const field = 'mt-2 w-full border border-ink/15 bg-white px-3 py-2 text-[0.95rem] text-ink'
const small =
  'inline-flex min-h-11 min-w-11 items-center text-[0.75rem] font-semibold tracking-[0.06em] text-brass uppercase'

export function DigestDraftEditor({
  digest,
  audience,
  sources,
  onChange,
}: {
  digest: WeeklyDigestModel
  audience: string[]
  sources: DigestPickLists
  onChange: (digest: WeeklyDigestModel, audience: string[]) => void
}) {
  function toggleTier(id: MembershipTierId) {
    const next = audience.includes(id) ? audience.filter((item) => item !== id) : [...audience, id]
    onChange(digest, next)
  }

  return (
    <div className="mt-6 border border-pearl/10 px-4 py-4 text-pearl" data-digest-editor="">
      <h3 className="text-[0.72rem] font-semibold tracking-[0.14em] text-pearl/45 uppercase">Edit this draft</h3>
      <fieldset className="mt-4" data-audience-picker="">
        <legend className="text-[0.95rem] text-stone/80">Who receives this issue</legend>
        <div className="mt-3 flex flex-col gap-2">
          {DIGEST_AUDIENCE_OPTIONS.map((id) => (
            <label key={id} className="inline-flex min-h-11 items-center gap-3 text-[0.95rem]">
              <input
                type="checkbox"
                checked={audience.includes(id)}
                onChange={() => toggleTier(id)}
              />
              {digestAudienceLabel(id)}
            </label>
          ))}
        </div>
        {audience.length === 0 ? (
          <p className="mt-3 text-[0.95rem] text-pearl/70" data-approve-block="">
            Choose at least one tier before you approve.
          </p>
        ) : null}
      </fieldset>

      <div className="mt-6 flex flex-col gap-4">
        {digest.newMembers.map((member, index) => (
          <div key={`${member.fullName}-${index}`} className="border border-pearl/10 px-3 py-3">
            <input
              className={field}
              aria-label="Member name"
              value={member.fullName}
              onChange={(event) => {
                const newMembers = digest.newMembers.slice()
                newMembers[index] = { ...member, fullName: event.target.value }
                onChange({ ...digest, newMembers }, audience)
              }}
            />
            <input
              className={field}
              aria-label="Company"
              value={member.company}
              onChange={(event) => {
                const newMembers = digest.newMembers.slice()
                newMembers[index] = { ...member, company: event.target.value }
                onChange({ ...digest, newMembers }, audience)
              }}
            />
            <div className="mt-2 flex flex-wrap gap-3">
              <button
                type="button"
                className={small}
                onClick={() => {
                  const newMembers = digest.newMembers.slice()
                  newMembers[index] = { ...member, company: '' }
                  onChange({ ...digest, newMembers }, audience)
                }}
              >
                Remove company
              </button>
              <button
                type="button"
                className={small}
                onClick={() => onChange({ ...digest, newMembers: digest.newMembers.filter((_, item) => item !== index) }, audience)}
              >
                Remove member
              </button>
            </div>
          </div>
        ))}
        {digest.upcomingEvents.map((event, index) => (
          <div key={`${event.title}-${index}`} className="border border-pearl/10 px-3 py-3">
            <input
              className={field}
              aria-label="Gathering title"
              value={event.title}
              onChange={(change) => {
                const upcomingEvents = digest.upcomingEvents.slice()
                upcomingEvents[index] = { ...event, title: change.target.value }
                onChange({ ...digest, upcomingEvents }, audience)
              }}
            />
            <input
              className={field}
              aria-label="Region"
              value={event.region}
              onChange={(change) => {
                const upcomingEvents = digest.upcomingEvents.slice()
                upcomingEvents[index] = { ...event, region: change.target.value }
                onChange({ ...digest, upcomingEvents }, audience)
              }}
            />
            <button
              type="button"
              className={small}
              onClick={() => {
                const upcomingEvents = digest.upcomingEvents.slice()
                upcomingEvents[index] = { ...event, region: '' }
                onChange({ ...digest, upcomingEvents }, audience)
              }}
            >
              Remove region
            </button>
          </div>
        ))}
        {digest.notes.map((note, index) => (
          <div key={`${note.text}-${index}`} className="border border-pearl/10 px-3 py-3">
            <textarea
              className={field}
              aria-label="Note"
              value={note.text}
              onChange={(event) => {
                const notes = digest.notes.slice()
                notes[index] = { text: event.target.value }
                onChange({ ...digest, notes }, audience)
              }}
            />
          </div>
        ))}
      </div>

      <div className="mt-4 flex flex-wrap gap-3">
        <button
          type="button"
          className={small}
          onClick={() => onChange({ ...digest, notes: [...digest.notes, { text: 'Example note' }] }, audience)}
        >
          Add a note
        </button>
        {sources.members[0] ? (
          <button
            type="button"
            className={small}
            onClick={() => onChange({ ...digest, newMembers: [...digest.newMembers, sources.members[0]] }, audience)}
          >
            Add a member
          </button>
        ) : null}
        {sources.mandates[0] ? (
          <button
            type="button"
            className={small}
            onClick={() =>
              onChange({ ...digest, newMandates: [...digest.newMandates, sources.mandates[0]] }, audience)
            }
          >
            Add a mandate
          </button>
        ) : null}
        {sources.events[0] ? (
          <button
            type="button"
            className={small}
            onClick={() =>
              onChange({ ...digest, upcomingEvents: [...digest.upcomingEvents, sources.events[0]] }, audience)
            }
          >
            Add a gathering
          </button>
        ) : null}
      </div>
    </div>
  )
}

export function digestPayloadFromModel(digest: WeeklyDigestModel) {
  return {
    new_members: digest.newMembers.map((member) => ({
      ...(member.id ? { id: member.id } : {}),
      full_name: member.fullName,
      headline: member.headline,
      company: member.company,
    })),
    new_mandates: digest.newMandates.map((mandate) => ({
      sector: mandate.sector,
      deal_type: mandate.dealType,
      ticket_band: mandate.ticketBand,
      geography: mandate.geography,
      stage: mandate.stage,
      one_liner: mandate.oneLiner,
    })),
    upcoming_events: digest.upcomingEvents.map((event) => ({
      title: event.title,
      starts_at: event.when,
      region: event.region,
      host_name: event.hostName,
      venue_address: event.venueAddress,
    })),
    introductions: digest.introductions
      .filter((intro) => intro.example !== true)
      .map((intro) => ({
        full_name: intro.fullName,
        headline: intro.headline,
        company: intro.company,
        reason: intro.reason,
      })),
    notes: digest.notes,
  }
}
