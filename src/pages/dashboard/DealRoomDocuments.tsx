import { useState } from 'react'

const fieldClass =
  'mt-2 w-full min-h-11 border border-ink/15 bg-white px-4 py-3 text-[1rem] text-ink outline-none focus:border-brass'

export type DealDocumentItem = {
  id: string
  fileName: string
  downloadAllowed: boolean
  expiresAt: string | null
  sharedWithAdmin: boolean
  uploadedByMe: boolean
  expired: boolean
}

export type DealDocumentLog = {
  id: string
  fileName: string
  memberName: string
  action: string
  at: string
}

export type DealDocumentView = {
  fileName: string
  stamp: string
  src: string
  downloadAllowed: boolean
}

export type DealDocumentPerson = {
  memberId: string
  fullName: string
}

const noop = () => {}

export function DealRoomDocuments({
  roomOpen,
  isOwner,
  documents,
  events,
  view,
  participants,
  busy = false,
  error = '',
  onUpload = noop,
  onView = noop,
  onDownload = noop,
  onSetDownload = noop,
  onSetFileExpiry = noop,
  onSetMemberExpiry = noop,
  onRevoke = noop,
  onDelete = noop,
  onShare = noop,
  onCloseView = noop,
}: {
  roomOpen: boolean
  isOwner: boolean
  documents: DealDocumentItem[]
  events: DealDocumentLog[]
  view: DealDocumentView | null
  participants: DealDocumentPerson[]
  busy?: boolean
  error?: string
  onUpload?: (file: File) => void
  onView?: (id: string) => void
  onDownload?: (id: string) => void
  onSetDownload?: (id: string, allowed: boolean) => void
  onSetFileExpiry?: (id: string, expiresAt: string | null) => void
  onSetMemberExpiry?: (memberId: string, expiresAt: string | null) => void
  onRevoke?: (memberId: string) => void
  onDelete?: (id: string) => void
  onShare?: (id: string) => void
  onCloseView?: () => void
}) {
  return (
    <section aria-label="Documents" data-deal-documents="" className="mt-8 max-w-xl">
      <h2 className="font-display text-[1.25rem] font-semibold tracking-[-0.02em]">Documents</h2>
      <p className="mt-2 text-[0.95rem] leading-relaxed text-ink/60">
        Viewing is watermarked and logged.
      </p>
      {error ? (
        <p className="mt-4 text-[0.98rem] text-[var(--ba-error)]" role="alert">
          {error}
        </p>
      ) : null}
      {roomOpen ? (
        <label className="mt-4 block">
          <span className="text-[0.72rem] font-semibold tracking-[0.08em] text-ink/45 uppercase">
            Upload a PDF, PNG, or JPEG
          </span>
          <input
            type="file"
            accept="application/pdf,image/png,image/jpeg,.pdf,.png,.jpg,.jpeg"
            disabled={busy}
            className={`${fieldClass} file:me-3 file:border-0 file:bg-transparent file:text-[0.85rem] file:font-semibold`}
            onChange={(event) => {
              const file = event.target.files?.[0]
              event.target.value = ''
              if (file) onUpload(file)
            }}
          />
          <span className="mt-2 block text-[0.85rem] text-ink/50">20 MB maximum. Downloads stay off until you turn them on.</span>
        </label>
      ) : (
        <p className="mt-4 text-[0.95rem] text-ink/60">This room is closed. Document access has ended.</p>
      )}

      {documents.length === 0 ? (
        <p className="mt-6 text-[1rem] text-ink/70" data-deal-documents-empty="">
          No documents yet.
        </p>
      ) : (
        <ul className="mt-6 grid gap-3" data-deal-documents-files="">
          {documents.map((doc) => (
            <DocumentRow
              key={doc.id}
              doc={doc}
              isOwner={isOwner}
              busy={busy}
              onView={onView}
              onDownload={onDownload}
              onSetDownload={onSetDownload}
              onSetFileExpiry={onSetFileExpiry}
              onDelete={onDelete}
              onShare={onShare}
            />
          ))}
        </ul>
      )}

      {view ? (
        <div className="mt-6 border border-[var(--ba-line)] bg-white px-4 py-4" data-deal-viewer="">
          <div className="flex items-start justify-between gap-3">
            <h3 className="font-display text-[1.1rem] font-semibold">{view.fileName}</h3>
            <button
              type="button"
              onClick={onCloseView}
              className="inline-flex min-h-11 items-center px-3 text-[0.75rem] font-semibold tracking-[0.08em] uppercase"
            >
              Close
            </button>
          </div>
          <p className="mt-2 text-[0.95rem] text-ink/70">Viewing is watermarked and logged.</p>
          <div className="relative mt-4 min-h-48 border border-[var(--ba-line)] bg-white">
            {view.src ? <iframe title={view.fileName} src={view.src} className="h-[28rem] w-full bg-white" /> : null}
            <p
              data-deal-watermark=""
              className="pointer-events-none absolute inset-x-0 bottom-0 bg-white/90 px-4 py-3 text-[0.85rem] text-[#7a2430]"
            >
              {view.stamp}
            </p>
          </div>
          {view.downloadAllowed ? (
            <p className="mt-3 text-[0.92rem] text-ink/60" data-deal-download-on="">
              Download is on for this file. The watermark above is the one on the viewed pages.
            </p>
          ) : (
            <p className="mt-3 text-[0.92rem] text-ink/60" data-deal-download-off="">
              Download is off. There is no save button for this file.
            </p>
          )}
        </div>
      ) : null}

      {isOwner ? (
        <MemberExpiry
          participants={participants}
          busy={busy}
          onSetMemberExpiry={onSetMemberExpiry}
          onRevoke={onRevoke}
        />
      ) : null}

      {isOwner ? (
        <div className="mt-8" data-deal-access-log="">
          <h3 className="text-[0.72rem] font-semibold tracking-[0.14em] text-ink/40 uppercase">Access log</h3>
          {events.length === 0 ? (
            <p className="mt-3 text-[0.95rem] text-ink/60">No views or downloads yet.</p>
          ) : (
            <ul className="mt-3 grid gap-2">
              {events.map((event) => (
                <li key={event.id} className="border border-[var(--ba-line)] bg-white px-4 py-3 text-[0.95rem]">
                  <p className="text-ink">{event.fileName}</p>
                  <p className="mt-1 text-ink/60">
                    {event.memberName} · {event.action} · {formatWhen(event.at)}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : null}
    </section>
  )
}

function DocumentRow({
  doc,
  isOwner,
  busy,
  onView,
  onDownload,
  onSetDownload,
  onSetFileExpiry,
  onDelete,
  onShare,
}: {
  doc: DealDocumentItem
  isOwner: boolean
  busy: boolean
  onView: (id: string) => void
  onDownload: (id: string) => void
  onSetDownload: (id: string, allowed: boolean) => void
  onSetFileExpiry: (id: string, expiresAt: string | null) => void
  onDelete: (id: string) => void
  onShare: (id: string) => void
}) {
  const [expiry, setExpiry] = useState(toLocalInput(doc.expiresAt))
  const canManageDownload = isOwner || doc.uploadedByMe
  return (
    <li className="border border-[var(--ba-line)] bg-white px-4 py-4" data-deal-document={doc.id}>
      <p className="text-[1rem] text-ink">{doc.fileName}</p>
      {doc.expired ? (
        <p className="mt-2 text-[0.95rem] text-ink/70" data-deal-expired="">
          Access expired
        </p>
      ) : (
        <div className="mt-3 flex flex-wrap gap-2">
          <button
            type="button"
            disabled={busy}
            onClick={() => onView(doc.id)}
            className="ba-primary inline-flex min-h-11 items-center px-4 text-[0.75rem] font-semibold tracking-[0.08em] uppercase disabled:opacity-40"
          >
            View
          </button>
          {doc.downloadAllowed ? (
            <button
              type="button"
              disabled={busy}
              data-deal-download-on=""
              onClick={() => onDownload(doc.id)}
              className="inline-flex min-h-11 items-center border border-[var(--ba-line)] bg-white px-4 text-[0.75rem] font-semibold tracking-[0.08em] uppercase disabled:opacity-40"
            >
              Download
            </button>
          ) : (
            <p className="inline-flex min-h-11 items-center text-[0.92rem] text-ink/55" data-deal-download-off="">
              Download off
            </p>
          )}
        </div>
      )}
      {canManageDownload ? (
        <button
          type="button"
          disabled={busy}
          onClick={() => onSetDownload(doc.id, !doc.downloadAllowed)}
          className="mt-3 inline-flex min-h-11 items-center text-[0.75rem] font-semibold tracking-[0.08em] text-ink/60 uppercase disabled:opacity-40"
        >
          {doc.downloadAllowed ? 'Turn download off' : 'Turn download on'}
        </button>
      ) : null}
      {doc.uploadedByMe ? (
        <button
          type="button"
          disabled={busy || doc.sharedWithAdmin}
          onClick={() => onShare(doc.id)}
          className="mt-1 block min-h-11 text-[0.75rem] font-semibold tracking-[0.08em] text-ink/60 uppercase disabled:opacity-40"
        >
          {doc.sharedWithAdmin ? 'Shared with admin' : 'Share with admin'}
        </button>
      ) : null}
      {isOwner || doc.uploadedByMe ? (
        <button
          type="button"
          disabled={busy}
          onClick={() => onDelete(doc.id)}
          className="mt-1 block min-h-11 text-[0.75rem] font-semibold tracking-[0.08em] text-ink/60 uppercase disabled:opacity-40"
        >
          Delete
        </button>
      ) : null}
      {isOwner ? (
        <form
          className="mt-3"
          data-deal-expiry=""
          onSubmit={(event) => {
            event.preventDefault()
            onSetFileExpiry(doc.id, expiry ? new Date(expiry).toISOString() : null)
          }}
        >
          <label className="block">
            <span className="text-[0.72rem] font-semibold tracking-[0.08em] text-ink/45 uppercase">
              File access ends
            </span>
            <input
              type="datetime-local"
              value={expiry}
              onChange={(event) => setExpiry(event.target.value)}
              className={fieldClass}
            />
          </label>
          <button
            type="submit"
            disabled={busy}
            className="mt-2 inline-flex min-h-11 items-center text-[0.75rem] font-semibold tracking-[0.08em] text-brass uppercase disabled:opacity-40"
          >
            Save file expiry
          </button>
        </form>
      ) : null}
    </li>
  )
}

function MemberExpiry({
  participants,
  busy,
  onSetMemberExpiry,
  onRevoke,
}: {
  participants: DealDocumentPerson[]
  busy: boolean
  onSetMemberExpiry: (memberId: string, expiresAt: string | null) => void
  onRevoke: (memberId: string) => void
}) {
  const members = participants.filter((person) => person.memberId)
  const [memberId, setMemberId] = useState(members[0]?.memberId ?? '')
  const [expiry, setExpiry] = useState('')
  if (members.length === 0) return null
  return (
    <form
      className="mt-8 border border-[var(--ba-line)] bg-white px-4 py-4"
      data-deal-member-expiry=""
      onSubmit={(event) => {
        event.preventDefault()
        if (!memberId) return
        onSetMemberExpiry(memberId, expiry ? new Date(expiry).toISOString() : null)
      }}
    >
      <h3 className="font-display text-[1.1rem] font-semibold">Member access</h3>
      <label className="mt-3 block">
        <span className="text-[0.72rem] font-semibold tracking-[0.08em] text-ink/45 uppercase">Member</span>
        <select value={memberId} onChange={(event) => setMemberId(event.target.value)} className={fieldClass}>
          {members.map((person) => (
            <option key={person.memberId} value={person.memberId}>
              {person.fullName}
            </option>
          ))}
        </select>
      </label>
      <label className="mt-3 block">
        <span className="text-[0.72rem] font-semibold tracking-[0.08em] text-ink/45 uppercase">
          Access ends
        </span>
        <input
          type="datetime-local"
          value={expiry}
          onChange={(event) => setExpiry(event.target.value)}
          className={fieldClass}
        />
      </label>
      <div className="mt-3 flex flex-wrap gap-3">
        <button
          type="submit"
          disabled={busy || !memberId}
          className="inline-flex min-h-11 items-center text-[0.75rem] font-semibold tracking-[0.08em] text-brass uppercase disabled:opacity-40"
        >
          Save member expiry
        </button>
        <button
          type="button"
          disabled={busy || !memberId}
          onClick={() => onRevoke(memberId)}
          className="inline-flex min-h-11 items-center text-[0.75rem] font-semibold tracking-[0.08em] text-ink/60 uppercase disabled:opacity-40"
        >
          Revoke access
        </button>
      </div>
    </form>
  )
}

function toLocalInput(iso: string | null): string {
  if (!iso) return ''
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return ''
  const pad = (value: number) => String(value).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`
}

function formatWhen(iso: string): string {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return ''
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Riyadh',
    year: 'numeric',
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).format(date)
}
