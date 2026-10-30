import type { DirectoryCard } from '../../lib/demoRows'

export function DirectoryBoardroomFace({ card }: { card: DirectoryCard }) {
  const roles = card.board_roles ?? []
  const expertise = card.expertise ?? []
  const open = card.open_to_board_seats === true
  if (roles.length === 0 && expertise.length === 0 && !open) return null
  return (
    <div className="mt-4 space-y-4">
      {roles.length > 0 ? (
        <div>
          <p className="text-[1rem] font-semibold text-ink/70">Boards</p>
          <ul className="mt-2 space-y-2">
            {roles.map((role) => (
              <li key={`${role.role}-${role.orgType}-${role.organisation}`} className="text-[1rem] text-ink/80">
                {role.role}, {role.orgType}, {role.organisation}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      {expertise.length > 0 ? (
        <div>
          <p className="text-[1rem] font-semibold text-ink/70">Expertise</p>
          <ul className="mt-2 flex flex-wrap gap-2">
            {expertise.map((item) => (
              <li
                key={item}
                className="inline-flex min-h-11 items-center border border-[var(--ba-line)] bg-white px-3 text-[1rem] text-ink"
              >
                {item}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      {open ? (
        <p className="inline-flex min-h-11 items-center bg-[var(--ba-indigo)] px-3 text-[1rem] text-[var(--ba-porcelain)]">
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
          <dt className="text-[1rem] font-semibold text-ink/70">Seat types</dt>
          <dd className="mt-1 text-[1rem] text-ink/80">{types.join(', ')}</dd>
        </div>
      ) : null}
      {where.length > 0 ? (
        <div>
          <dt className="text-[1rem] font-semibold text-ink/70">Where</dt>
          <dd className="mt-1 text-[1rem] text-ink/80">{where.join(', ')}</dd>
        </div>
      ) : null}
    </dl>
  )
}
