import { useNoIndex } from '../../lib/usePageTitle'
import { CardSkeleton, EmptyState } from '../../shell/ViewState'
import { PanelNotice } from './bits'
import { useAdmin } from './context'

export function EmailPage() {
  const room = useAdmin()
  useNoIndex('Email | Board Arabia')

  if (room.loading && room.events.length === 0 && !room.listError) {
    return <CardSkeleton tone="staff" label="Loading email" />
  }

  return (
    <div className="max-w-3xl">
      <h1 className="font-display text-[2rem] font-semibold tracking-[-0.03em]">Email</h1>
      <p className="mt-2 text-[0.95rem] text-stone/65">Kind, recipient, subject, and status only.</p>
      {room.panelFailed.email ? (
        <div className="mt-6 border border-pearl/10 px-5 py-4">
          <PanelNotice />
        </div>
      ) : null}
      {room.events.length === 0 && !room.panelFailed.email ? (
        <div className="mt-6">
          <EmptyState tone="staff" message="No email events yet." />
        </div>
      ) : null}
      {room.events.length > 0 ? (
        <ul className="mt-6 space-y-3">
          {room.events.map((event) => (
            <li key={event.id} className="border border-pearl/10 px-5 py-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <p className="text-[0.7rem] font-semibold tracking-[0.1em] text-pearl/40 uppercase">
                  {new Date(event.created_at).toLocaleString()}
                </p>
                <span className="border border-pearl/20 px-2 py-1 text-[0.68rem] font-semibold tracking-[0.08em] text-brass-bright uppercase">
                  {event.status}
                </span>
              </div>
              <p className="mt-2 text-[0.95rem] text-stone/85">{event.subject}</p>
              {event.kind === 'desk_note' && event.detail ? (
                <p className="mt-2 whitespace-pre-wrap text-[0.95rem] leading-relaxed text-pearl/80">{event.detail}</p>
              ) : null}
              <p className="mt-1 text-[0.85rem] text-pearl/50">
                {event.kind} · {event.recipient}
              </p>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  )
}
