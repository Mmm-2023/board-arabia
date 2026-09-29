import { useEffect, useState } from 'react'
import { ExampleMark } from '../../components/ExampleMark'
import { seatLabel, type DirectoryCard } from '../../lib/demoRows'
import { progressLine } from '../../lib/directoryGate'
import { AvatarCircle } from './AvatarCircle'
import type { SeatCountState } from './DirectoryEmpty'
import { supabase } from '../../lib/supabase'

export function DirectoryBoard({
  cards,
  seat,
}: {
  cards: DirectoryCard[]
  seat: SeatCountState
}) {
  const photos = useSignedPortraits(cards)
  const hasExamples = cards.some((card) => card.is_demo)

  return (
    <div className="max-w-3xl">
      <p className="text-[0.72rem] font-semibold tracking-[0.14em] text-brass uppercase">Directory</p>
      <h1 className="mt-3 font-display text-[2.2rem] font-bold tracking-[-0.03em]">Directory</h1>
      <p className="mt-3 max-w-xl text-[1rem] leading-relaxed text-ink/65">
        {hasExamples
          ? 'Admitted members. Cards marked Example are samples and step aside once enough real members are here.'
          : 'Admitted members.'}
      </p>
      {seat.status === 'ready' ? (
        <p className="mt-4 font-display text-[1.25rem] font-semibold tracking-[-0.03em]">
          {progressLine(seat.admitted)}
        </p>
      ) : null}
      <ul className="mt-8 grid gap-3 lg:grid-cols-2">
        {cards.map((card) => (
          <li key={card.id}>
            <article className="h-full border border-[var(--ba-line)] bg-white px-5 py-5">
              <div className="flex items-start justify-between gap-4">
                <Portrait card={card} src={photos[card.id] ?? card.portrait_asset} />
                <div className="text-end">
                  {card.is_demo ? <ExampleMark /> : null}
                  <p className="mt-1 text-[0.85rem] text-ink/55">{seatLabel(card.seat)}</p>
                </div>
              </div>
              <h2 className="mt-4 font-display text-[1.35rem] font-semibold tracking-[-0.03em]">
                {card.full_name}
              </h2>
              {card.headline ? <p className="mt-1 text-[0.95rem] text-ink/70">{card.headline}</p> : null}
              <dl className="mt-4 space-y-2">
                {card.sector ? <Field label="Sector" value={card.sector} /> : null}
                {card.location ? <Field label="City" value={card.location} /> : null}
                {card.company ? <Field label="Firm" value={card.company} /> : null}
              </dl>
            </article>
          </li>
        ))}
      </ul>
    </div>
  )
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-[0.68rem] font-semibold tracking-[0.12em] text-ink/40 uppercase">{label}</dt>
      <dd className="mt-0.5 text-[0.95rem] text-ink/80">{value}</dd>
    </div>
  )
}

function Portrait({ card, src }: { card: DirectoryCard; src: string | null }) {
  const [failedSrc, setFailedSrc] = useState<string | null>(null)
  const mark = card.full_name
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0] ?? '')
    .join('')
    .toUpperCase()
  const photo = src && failedSrc !== src ? src : null
  return (
    <AvatarCircle
      src={photo}
      initials={mark}
      size={56}
      alt=""
      onError={() => {
        if (src) setFailedSrc(src)
      }}
    />
  )
}

function useSignedPortraits(cards: DirectoryCard[]) {
  const [photos, setPhotos] = useState<Record<string, string>>({})
  const key = cards
    .filter((card) => card.avatar_path)
    .map((card) => `${card.id}:${card.avatar_path}`)
    .join('|')

  useEffect(() => {
    const pending = cards.filter((card) => card.avatar_path && !card.portrait_asset)
    if (pending.length === 0) return
    let cancelled = false
    void Promise.all(
      pending.map(async (card) => {
        const path = card.avatar_path
        if (!path) return null
        const { data, error } = await supabase.storage.from('member-avatars').createSignedUrl(path, 600)
        if (error || !data?.signedUrl) return null
        return [card.id, data.signedUrl] as const
      }),
    ).then((pairs) => {
      if (cancelled) return
      const next: Record<string, string> = {}
      for (const pair of pairs) {
        if (pair) next[pair[0]] = pair[1]
      }
      setPhotos(next)
    })
    return () => {
      cancelled = true
    }
  }, [cards, key])

  return photos
}
