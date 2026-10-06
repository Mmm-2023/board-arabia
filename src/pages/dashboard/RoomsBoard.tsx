import { ExampleMark } from '../../components/ExampleMark'
import { SampleAction } from '../../components/SampleAction'
import type { RoomCard } from '../../lib/demoRows'

export function RoomsBoard({ rooms, embedded = false }: { rooms: RoomCard[]; embedded?: boolean }) {
  const hasExamples = rooms.some((room) => room.is_demo)
  const intro = hasExamples
    ? 'Deal rooms opened by our admin team. Cards marked Example are samples.'
    : 'Deal rooms opened by our admin team.'
  const cards = (
    <ul className={embedded ? 'mt-4 grid gap-3' : 'mt-8 grid gap-3'}>
      {rooms.map((room) => (
        <li key={room.id}>
          <article className="border border-[var(--ba-line)] bg-white px-5 py-5">
            <div className="flex items-start justify-between gap-4">
              <p className="text-[0.72rem] font-semibold tracking-[0.12em] text-brass uppercase">
                {room.sector}
              </p>
              <div className="text-end">
                {room.is_demo ? <ExampleMark /> : null}
                <p className="mt-1 text-[0.85rem] text-ink/55">{room.stage}</p>
              </div>
            </div>
            <h2 className="mt-3 font-display text-[1.45rem] font-semibold tracking-[-0.03em]">
              {room.name}
            </h2>
            <p className="mt-3 text-[1rem] leading-relaxed text-ink/75">{room.summary}</p>
            <p className="mt-4 text-[0.92rem] text-ink/60">
              {room.member_count} {room.member_count === 1 ? 'member' : 'members'}
              {room.host_name ? ` · Host ${room.host_name}` : ''}
            </p>
            {room.is_demo ? <SampleAction label="Open room" /> : null}
          </article>
        </li>
      ))}
    </ul>
  )
  if (embedded) {
    return (
      <div>
        <p className="max-w-xl text-[1rem] leading-relaxed text-ink/65">{intro}</p>
        {cards}
      </div>
    )
  }
  return (
    <div className="max-w-3xl">
      <h1 className="font-display text-[2.2rem] font-bold tracking-[-0.03em]">Rooms</h1>
      <p className="mt-3 max-w-xl text-[1rem] leading-relaxed text-ink/65">{intro}</p>
      {cards}
    </div>
  )
}
