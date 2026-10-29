import type { DirectoryCard } from '../../lib/demoRows'

export function DirectoryBoardroomFace({ card }: { card: DirectoryCard }) {
  const roles = card.board_roles ?? []
  const expertise = card.expertise ?? []
  const open = card.open_to_board_seats === true
  if (roles.length === 0 && expertise.length === 0 && !open) return null
  return (
    <div className="mt-3 space-y-3">
      {roles.length > 0 ? (
        <div>
          <p className="text-[0.68rem] font-semibold tracking-[0.12em] text-ink/40 uppercase">Boards</p>
          <ul className="mt-1 space-y-1">
            {roles.map((role) => (
              <li key={`${role.role}-${role.orgType}-${role.organisation}`} className="text-[0.95rem] text-ink/80">
                {role.role}, {role.orgType}, {role.organisation}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      {expertise.length > 0 ? (
        <div>
          <p className="text-[0.68rem] font-semibold tracking-[0.12em] text-ink/40 uppercase">Expertise</p>
          <ul className="mt-1 flex flex-wrap gap-2">
            {expertise.map((item) => (
              <li
                key={item}
                className="inline-flex min-h-8 items-center border border-[var(--ba-line)] bg-white px-2 text-[0.85rem] text-ink"
              >
                {item}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      {open ? (
        <p className="inline-flex min-h-8 items-center bg-[var(--ba-indigo)] px-3 text-[0.85rem] text-[var(--ba-porcelain)]">
          Open to board seats
        </p>
      ) : null}
    </div>
  )
}

export function DirectoryBoardroomDetail({ card }: { card: DirectoryCard }) {
  if (card.open_to_board_seats !== true) return null
  const types = card.seat_types ?? []
  const where = card.seat_where ?? []
  if (types.length === 0 && where.length === 0) return null
  return (
    <dl className="mt-3 space-y-2">
      {types.length > 0 ? (
        <div>
          <dt className="text-[0.68rem] font-semibold tracking-[0.12em] text-ink/40 uppercase">Seat types</dt>
          <dd className="mt-0.5 text-[0.95rem] text-ink/80">{types.join(', ')}</dd>
        </div>
      ) : null}
      {where.length > 0 ? (
        <div>
          <dt className="text-[0.68rem] font-semibold tracking-[0.12em] text-ink/40 uppercase">Where</dt>
          <dd className="mt-0.5 text-[0.95rem] text-ink/80">{where.join(', ')}</dd>
        </div>
      ) : null}
    </dl>
  )
}
