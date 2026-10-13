import {
  DIGEST_SECTION_ORDER,
  type DigestDiaryItem,
  type DigestNewsItem,
  type DigestSectionId,
  type DigestSourceLink,
} from '../../../supabase/functions/_shared/weekly_digest_copy.ts'
import { DIGEST_AUDIENCE_OPTIONS, digestAudienceLabel } from '../../lib/digestAudience'
import type { MembershipTierId } from '../../lib/membershipTiers'
import { digestHidden, type WeeklyDigestModel } from '../../lib/weeklyDigest'

export type DigestPickLists = {
  members: WeeklyDigestModel['newMembers']
  mandates: WeeklyDigestModel['newMandates']
  events: WeeklyDigestModel['upcomingEvents']
}

const field = 'mt-2 w-full min-w-0 border border-ink/15 bg-white px-3 py-2 text-[0.95rem] text-ink'
const small =
  'inline-flex min-h-11 min-w-11 items-center text-[0.75rem] font-semibold tracking-[0.06em] text-brass uppercase'

function blankNews(): DigestNewsItem {
  return {
    headline: 'Example headline',
    sentences: ['Example sentence one for members.', 'Example sentence two for members.'],
    boardLens: '',
    sources: [{ label: 'Example source', url: 'https://example.org/source' }],
    people: [],
  }
}

function blankDiary(): DigestDiaryItem {
  return {
    title: 'Example diary date',
    when: '20 Oct 2026',
    sources: [{ label: 'Example diary', url: 'https://example.org/diary' }],
  }
}

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

  function patch(next: Partial<WeeklyDigestModel>) {
    onChange({ ...digest, ...next }, audience)
  }

  function toggleHidden(id: DigestSectionId) {
    const current = digest.hiddenSections ?? []
    const hiddenSections = current.includes(id) ? current.filter((item) => item !== id) : [...current, id]
    patch({ hiddenSections })
  }

  return (
    <div className="mt-6 border border-pearl/10 px-4 py-4 text-pearl" data-digest-editor="">
      <h3 className="text-[0.72rem] font-semibold tracking-[0.14em] text-pearl/45 uppercase">Edit this draft</h3>
      <p className="mt-2 text-[0.95rem] text-stone/80">Section order is fixed.</p>
      <fieldset className="mt-4" data-audience-picker="">
        <legend className="text-[0.95rem] text-stone/80">Who receives this issue</legend>
        <div className="mt-3 flex flex-col gap-2">
          {DIGEST_AUDIENCE_OPTIONS.map((id) => (
            <label key={id} className="inline-flex min-h-11 items-center gap-3 text-[0.95rem]">
              <input type="checkbox" checked={audience.includes(id)} onChange={() => toggleTier(id)} />
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

      <div className="mt-6 grid gap-3">
        <label className="text-[0.95rem] text-stone/80">
          Issue number
          <input
            className={field}
            aria-label="Issue number"
            maxLength={20}
            value={digest.issueNumber ?? ''}
            onChange={(event) => patch({ issueNumber: event.target.value })}
          />
        </label>
        <label className="text-[0.95rem] text-stone/80">
          Issue date
          <input
            className={field}
            aria-label="Issue date"
            maxLength={40}
            value={digest.issueDate ?? ''}
            onChange={(event) => patch({ issueDate: event.target.value })}
          />
        </label>
        <label className="text-[0.95rem] text-stone/80">
          Opening
          <textarea
            className={field}
            aria-label="Opening"
            maxLength={500}
            value={digest.opening ?? ''}
            onChange={(event) => patch({ opening: event.target.value })}
          />
        </label>
      </div>

      <div className="mt-6 flex flex-col gap-6">
        {DIGEST_SECTION_ORDER.map((section) => (
          <fieldset key={section.id} className="border border-pearl/10 px-3 py-3" data-section-editor={section.id}>
            <legend className="px-1 text-[0.95rem] text-stone/80">
              {section.number} {section.title}
            </legend>
            <label className="mt-2 inline-flex min-h-11 items-center gap-3 text-[0.95rem]">
              <input
                type="checkbox"
                checked={digestHidden(digest, section.id)}
                data-hide-section={section.id}
                onChange={() => toggleHidden(section.id)}
              />
              Hide section
            </label>
            {section.id === 'boardroom' ? (
              <NewsEditor items={digest.boardroom ?? []} onChange={(items) => patch({ boardroom: items })} />
            ) : null}
            {section.id === 'deals' ? (
              <NewsEditor items={digest.deals ?? []} onChange={(items) => patch({ deals: items })} />
            ) : null}
            {section.id === 'platform' ? <PlatformEditor digest={digest} patch={patch} /> : null}
            {section.id === 'database' ? <DatabaseEditor digest={digest} sources={sources} patch={patch} /> : null}
            {section.id === 'majlis' ? <MajlisEditor digest={digest} sources={sources} patch={patch} /> : null}
            {section.id === 'partner' ? <PartnerEditor digest={digest} patch={patch} /> : null}
          </fieldset>
        ))}
      </div>
    </div>
  )
}

function NewsEditor({
  items,
  onChange,
}: {
  items: DigestNewsItem[]
  onChange: (items: DigestNewsItem[]) => void
}) {
  return (
    <div className="mt-3 flex flex-col gap-4">
      {items.map((item, index) => (
        <div key={`${item.headline}-${index}`} className="border border-pearl/10 px-3 py-3">
          <input
            className={field}
            aria-label="Headline"
            maxLength={160}
            value={item.headline}
            onChange={(event) => updateNews(items, index, { headline: event.target.value }, onChange)}
          />
          {item.sentences.map((sentence, sentenceIndex) => (
            <textarea
              key={sentenceIndex}
              className={field}
              aria-label={`Sentence ${sentenceIndex + 1}`}
              maxLength={280}
              value={sentence}
              onChange={(event) => {
                const sentences = item.sentences.slice()
                sentences[sentenceIndex] = event.target.value
                updateNews(items, index, { sentences }, onChange)
              }}
            />
          ))}
          {item.sentences.length < 3 ? (
            <button
              type="button"
              className={small}
              onClick={() => updateNews(items, index, { sentences: [...item.sentences, ''] }, onChange)}
            >
              Add a sentence
            </button>
          ) : null}
          <input
            className={field}
            aria-label="Board lens"
            maxLength={280}
            value={item.boardLens}
            placeholder="Board lens"
            onChange={(event) => updateNews(items, index, { boardLens: event.target.value }, onChange)}
          />
          {item.sources.map((source, sourceIndex) => (
            <SourceFields
              key={`${source.url}-${sourceIndex}`}
              source={source}
              onChange={(next) => {
                const sources = item.sources.slice()
                sources[sourceIndex] = next
                updateNews(items, index, { sources }, onChange)
              }}
            />
          ))}
          {item.sources.length < 4 ? (
            <button
              type="button"
              className={small}
              onClick={() =>
                updateNews(
                  items,
                  index,
                  { sources: [...item.sources, { label: 'Example source', url: 'https://example.org/source' }] },
                  onChange,
                )
              }
            >
              Add a source
            </button>
          ) : null}
          {item.people.map((person, personIndex) => (
            <div key={`${person.name}-${personIndex}`}>
              <input
                className={field}
                aria-label="Person name"
                maxLength={200}
                value={person.name}
                onChange={(event) => {
                  const people = item.people.slice()
                  people[personIndex] = { ...person, name: event.target.value }
                  updateNews(items, index, { people }, onChange)
                }}
              />
              <input
                className={field}
                aria-label="LinkedIn URL"
                maxLength={300}
                value={person.linkedinUrl ?? ''}
                placeholder="https://www.linkedin.com/"
                onChange={(event) => {
                  const people = item.people.slice()
                  people[personIndex] = { ...person, linkedinUrl: event.target.value }
                  updateNews(items, index, { people }, onChange)
                }}
              />
            </div>
          ))}
          {item.people.length < 4 ? (
            <button
              type="button"
              className={small}
              onClick={() =>
                updateNews(items, index, { people: [...item.people, { name: 'Example Director', linkedinUrl: null }] }, onChange)
              }
            >
              Add a person
            </button>
          ) : null}
          <button
            type="button"
            className={small}
            onClick={() => onChange(items.filter((_, itemIndex) => itemIndex !== index))}
          >
            Remove item
          </button>
        </div>
      ))}
      {items.length < 4 ? (
        <button type="button" className={small} onClick={() => onChange([...items, blankNews()])}>
          Add a news item
        </button>
      ) : null}
    </div>
  )
}

function updateNews(
  items: DigestNewsItem[],
  index: number,
  next: Partial<DigestNewsItem>,
  onChange: (items: DigestNewsItem[]) => void,
) {
  const copy = items.slice()
  copy[index] = { ...items[index], ...next }
  onChange(copy)
}

function SourceFields({
  source,
  onChange,
}: {
  source: DigestSourceLink
  onChange: (source: DigestSourceLink) => void
}) {
  return (
    <div>
      <input
        className={field}
        aria-label="Source label"
        maxLength={120}
        value={source.label}
        onChange={(event) => onChange({ ...source, label: event.target.value })}
      />
      <input
        className={field}
        aria-label="Source link"
        maxLength={300}
        value={source.url}
        onChange={(event) => onChange({ ...source, url: event.target.value })}
      />
    </div>
  )
}

function PlatformEditor({
  digest,
  patch,
}: {
  digest: WeeklyDigestModel
  patch: (next: Partial<WeeklyDigestModel>) => void
}) {
  const bullets = digest.platformBullets ?? []
  return (
    <div className="mt-3 flex flex-col gap-3">
      {bullets.map((bullet, index) => (
        <div key={`${bullet}-${index}`}>
          <input
            className={field}
            aria-label="Platform line"
            maxLength={200}
            value={bullet}
            onChange={(event) => {
              const platformBullets = bullets.slice()
              platformBullets[index] = event.target.value
              patch({ platformBullets })
            }}
          />
          <button
            type="button"
            className={small}
            onClick={() => patch({ platformBullets: bullets.filter((_, item) => item !== index) })}
          >
            Remove line
          </button>
        </div>
      ))}
      {bullets.length < 3 ? (
        <button type="button" className={small} onClick={() => patch({ platformBullets: [...bullets, 'Example line'] })}>
          Add a line
        </button>
      ) : null}
      <textarea
        className={field}
        aria-label="Feature tip"
        maxLength={280}
        value={digest.featureTip ?? ''}
        placeholder="Optional tip"
        onChange={(event) => patch({ featureTip: event.target.value })}
      />
      {digest.notes.map((note, index) => (
        <textarea
          key={`${note.text}-${index}`}
          className={field}
          aria-label="Note"
          maxLength={500}
          value={note.text}
          onChange={(event) => {
            const notes = digest.notes.slice()
            notes[index] = { text: event.target.value }
            patch({ notes })
          }}
        />
      ))}
      <button type="button" className={small} onClick={() => patch({ notes: [...digest.notes, { text: 'Example note' }] })}>
        Add a note
      </button>
    </div>
  )
}

function DatabaseEditor({
  digest,
  sources,
  patch,
}: {
  digest: WeeklyDigestModel
  sources: DigestPickLists
  patch: (next: Partial<WeeklyDigestModel>) => void
}) {
  return (
    <div className="mt-3 flex flex-col gap-4">
      {digest.newMembers.map((member, index) => (
        <div key={`${member.fullName}-${index}`} className="border border-pearl/10 px-3 py-3">
          <input
            className={field}
            aria-label="Member name"
            maxLength={200}
            value={member.fullName}
            onChange={(event) => {
              const newMembers = digest.newMembers.slice()
              newMembers[index] = { ...member, fullName: event.target.value }
              patch({ newMembers })
            }}
          />
          <input
            className={field}
            aria-label="Company"
            maxLength={200}
            value={member.company}
            onChange={(event) => {
              const newMembers = digest.newMembers.slice()
              newMembers[index] = { ...member, company: event.target.value }
              patch({ newMembers })
            }}
          />
          <div className="mt-2 flex flex-wrap gap-3">
            <button
              type="button"
              className={small}
              onClick={() => {
                const newMembers = digest.newMembers.slice()
                newMembers[index] = { ...member, company: '' }
                patch({ newMembers })
              }}
            >
              Remove company
            </button>
            <button
              type="button"
              className={small}
              onClick={() => patch({ newMembers: digest.newMembers.filter((_, item) => item !== index) })}
            >
              Remove member
            </button>
          </div>
        </div>
      ))}
      {(digest.keyMembers ?? []).map((member, index) => (
        <div key={`key-${member.fullName}-${index}`} className="border border-pearl/10 px-3 py-3">
          <p className="text-[0.75rem] tracking-[0.08em] text-pearl/50 uppercase">Key</p>
          <input
            className={field}
            aria-label="Key member name"
            maxLength={200}
            value={member.fullName}
            onChange={(event) => {
              const keyMembers = (digest.keyMembers ?? []).slice()
              keyMembers[index] = { ...member, fullName: event.target.value, key: true }
              patch({ keyMembers })
            }}
          />
          <button
            type="button"
            className={small}
            onClick={() => patch({ keyMembers: (digest.keyMembers ?? []).filter((_, item) => item !== index) })}
          >
            Remove member
          </button>
        </div>
      ))}
      <div className="flex flex-wrap gap-3">
        {sources.members[0] ? (
          <button
            type="button"
            className={small}
            onClick={() => patch({ newMembers: [...digest.newMembers, sources.members[0]] })}
          >
            Add a member
          </button>
        ) : null}
        {sources.members[0] ? (
          <button
            type="button"
            className={small}
            onClick={() =>
              patch({ keyMembers: [...(digest.keyMembers ?? []), { ...sources.members[0], key: true }] })
            }
          >
            Add a key member
          </button>
        ) : null}
        {sources.mandates[0] ? (
          <button
            type="button"
            className={small}
            onClick={() => patch({ newMandates: [...digest.newMandates, sources.mandates[0]] })}
          >
            Add a mandate
          </button>
        ) : null}
      </div>
    </div>
  )
}

function MajlisEditor({
  digest,
  sources,
  patch,
}: {
  digest: WeeklyDigestModel
  sources: DigestPickLists
  patch: (next: Partial<WeeklyDigestModel>) => void
}) {
  const diary = digest.diary ?? []
  return (
    <div className="mt-3 flex flex-col gap-4">
      {digest.upcomingEvents.map((event, index) => (
        <div key={`${event.title}-${index}`} className="border border-pearl/10 px-3 py-3">
          <input
            className={field}
            aria-label="Gathering title"
            maxLength={160}
            value={event.title}
            onChange={(change) => {
              const upcomingEvents = digest.upcomingEvents.slice()
              upcomingEvents[index] = { ...event, title: change.target.value }
              patch({ upcomingEvents })
            }}
          />
          <input
            className={field}
            aria-label="Region"
            maxLength={80}
            value={event.region}
            onChange={(change) => {
              const upcomingEvents = digest.upcomingEvents.slice()
              upcomingEvents[index] = { ...event, region: change.target.value }
              patch({ upcomingEvents })
            }}
          />
          <button
            type="button"
            className={small}
            onClick={() => {
              const upcomingEvents = digest.upcomingEvents.slice()
              upcomingEvents[index] = { ...event, region: '' }
              patch({ upcomingEvents })
            }}
          >
            Remove region
          </button>
        </div>
      ))}
      {sources.events[0] ? (
        <button
          type="button"
          className={small}
          onClick={() => patch({ upcomingEvents: [...digest.upcomingEvents, sources.events[0]] })}
        >
          Add a gathering
        </button>
      ) : null}
      {diary.map((item, index) => (
        <div key={`${item.title}-${index}`} className="border border-pearl/10 px-3 py-3">
          <input
            className={field}
            aria-label="Diary title"
            maxLength={160}
            value={item.title}
            onChange={(event) => {
              const next = diary.slice()
              next[index] = { ...item, title: event.target.value }
              patch({ diary: next })
            }}
          />
          <input
            className={field}
            aria-label="Diary date"
            maxLength={40}
            value={item.when}
            onChange={(event) => {
              const next = diary.slice()
              next[index] = { ...item, when: event.target.value }
              patch({ diary: next })
            }}
          />
          <SourceFields
            source={item.sources[0] ?? { label: 'Example diary', url: 'https://example.org/diary' }}
            onChange={(source) => {
              const next = diary.slice()
              next[index] = { ...item, sources: [source, ...item.sources.slice(1)] }
              patch({ diary: next })
            }}
          />
          <button
            type="button"
            className={small}
            onClick={() => patch({ diary: diary.filter((_, itemIndex) => itemIndex !== index) })}
          >
            Remove date
          </button>
        </div>
      ))}
      {diary.length < 4 ? (
        <button type="button" className={small} onClick={() => patch({ diary: [...diary, blankDiary()] })}>
          Add a diary date
        </button>
      ) : null}
    </div>
  )
}

function PartnerEditor({
  digest,
  patch,
}: {
  digest: WeeklyDigestModel
  patch: (next: Partial<WeeklyDigestModel>) => void
}) {
  const insight = digest.partnerInsight
  const sentences = insight?.sentences ?? ['', '']
  const source = insight?.source ?? { label: 'Example partner note', url: 'https://example.org/partner' }
  function commit(nextSentences: string[], nextSource: DigestSourceLink) {
    const filled = nextSentences.map((sentence) => sentence.trim()).filter(Boolean)
    if (filled.length === 0 && !nextSource.url.trim()) {
      patch({ partnerInsight: null })
      return
    }
    patch({
      partnerInsight: {
        label: 'Partner content',
        sentences: nextSentences,
        source: nextSource,
      },
    })
  }
  return (
    <div className="mt-3">
      <p className="text-[0.75rem] tracking-[0.08em] text-pearl/50 uppercase">Partner content</p>
      {sentences.map((sentence, index) => (
        <textarea
          key={index}
          className={field}
          aria-label={`Partner sentence ${index + 1}`}
          maxLength={280}
          value={sentence}
          onChange={(event) => {
            const next = sentences.slice()
            next[index] = event.target.value
            commit(next, source)
          }}
        />
      ))}
      {sentences.length < 3 ? (
        <button type="button" className={small} onClick={() => commit([...sentences, ''], source)}>
          Add a sentence
        </button>
      ) : null}
      <SourceFields source={source} onChange={(next) => commit(sentences, next)} />
    </div>
  )
}

export function digestPayloadFromModel(digest: WeeklyDigestModel) {
  return {
    opening: digest.opening ?? '',
    issue_number: digest.issueNumber ?? '',
    issue_date: digest.issueDate ?? '',
    read_minutes: digest.readMinutes ?? 0,
    hidden_sections: digest.hiddenSections ?? [],
    boardroom: (digest.boardroom ?? []).map(newsPayload),
    deals: (digest.deals ?? []).map(newsPayload),
    platform_bullets: digest.platformBullets ?? [],
    feature_tip: digest.featureTip ?? '',
    new_members: digest.newMembers.map((member) => ({
      ...(member.id ? { id: member.id } : {}),
      full_name: member.fullName,
      headline: member.headline,
      company: member.company,
    })),
    key_members: (digest.keyMembers ?? []).map((member) => ({
      ...(member.id ? { id: member.id } : {}),
      full_name: member.fullName,
      headline: member.headline,
      company: member.company,
      key: true,
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
    diary: (digest.diary ?? []).map((item) => ({
      title: item.title,
      when: item.when,
      sources: item.sources,
    })),
    partner_insight: digest.partnerInsight
      ? {
          sentences: digest.partnerInsight.sentences,
          source: digest.partnerInsight.source,
        }
      : null,
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

function newsPayload(item: DigestNewsItem) {
  return {
    headline: item.headline,
    sentences: item.sentences,
    board_lens: item.boardLens,
    sources: item.sources,
    people: item.people.map((person) => ({
      name: person.name,
      linkedin_url: person.linkedinUrl ?? '',
    })),
  }
}
