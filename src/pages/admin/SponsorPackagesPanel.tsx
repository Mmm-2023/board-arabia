import { useEffect, useState, type FormEvent } from 'react'
import { parsePackageSave, type SponsorPackageRow } from '../../lib/sponsorDesk'
import { fetchSponsorCatalog, saveSponsorPackage } from '../../lib/supabase'
import { toneClasses } from '../../shell/ViewState'

const fieldClass =
  'mt-2 block w-full min-h-11 border border-pearl/20 bg-ink px-3 text-[0.9rem] text-pearl normal-case'
const labelClass = 'block text-[0.68rem] font-semibold tracking-[0.08em] text-pearl/45 uppercase'

export function SponsorPackagesPanel() {
  const styles = toneClasses('staff')
  const [packages, setPackages] = useState<SponsorPackageRow[] | null>(null)
  const [error, setError] = useState('')
  const [attempt, setAttempt] = useState(0)
  const [revision, setRevision] = useState(0)

  useEffect(() => {
    let cancelled = false
    void fetchSponsorCatalog().then((result) => {
      if (cancelled) return
      if ('error' in result) {
        setError(result.error)
        setPackages([])
        return
      }
      setError('')
      setPackages(result.catalog.packages)
    })
    return () => {
      cancelled = true
    }
  }, [attempt])

  async function reload() {
    setRevision((value) => value + 1)
    setAttempt((value) => value + 1)
  }

  return (
    <section className={`${styles.panel} mt-4 px-5 py-5`}>
      <h2 className={`text-[0.72rem] font-semibold tracking-[0.12em] uppercase ${styles.quiet}`}>Sponsor packages</h2>
      <p className="mt-3 text-[1rem] leading-relaxed text-pearl/80">
        Package names, prices, and entitlements. Sponsors see the name and the price label. A placeholder is not a locked price.
      </p>
      {error ? (
        <p className="mt-3 text-[0.95rem] text-red-300" role="alert">
          {error}{' '}
          <button type="button" className="min-h-11 underline" onClick={() => setAttempt((value) => value + 1)}>
            Retry
          </button>
        </p>
      ) : null}
      {packages == null ? <p className={`mt-4 ${styles.muted}`}>Loading packages.</p> : null}
      <div className="mt-4 space-y-4">
        {(packages ?? []).map((row) => (
          <PackageForm key={`${row.slug}-${revision}`} row={row} lockedSlug onSaved={() => void reload()} />
        ))}
        <PackageForm
          key={`new-${revision}`}
          row={null}
          lockedSlug={false}
          onSaved={() => void reload()}
        />
      </div>
    </section>
  )
}

function PackageForm({
  row,
  lockedSlug,
  onSaved,
}: {
  row: SponsorPackageRow | null
  lockedSlug: boolean
  onSaved: () => void
}) {
  const [slug, setSlug] = useState(row?.slug ?? '')
  const [name, setName] = useState(row?.name ?? '')
  const [price, setPrice] = useState(row?.price_label ?? '')
  const [slots, setSlots] = useState(row ? String(row.majlis_slots) : '0')
  const [intro, setIntro] = useState(row ? String(row.intro_credits) : '0')
  const [rooms, setRooms] = useState(row ? String(row.room_credits) : '0')
  const [active, setActive] = useState(row?.active ?? true)
  const [placeholder, setPlaceholder] = useState(row?.is_placeholder ?? true)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const [saved, setSaved] = useState(false)

  async function onSubmit(event: FormEvent) {
    event.preventDefault()
    setSaved(false)
    const parsed = parsePackageSave({
      slug,
      name,
      priceLabel: price,
      majlisSlots: slots,
      introCredits: intro,
      roomCredits: rooms,
      active,
      isPlaceholder: placeholder,
    })
    if (!parsed.ok) {
      setMessage(parsed.error)
      return
    }
    setBusy(true)
    setMessage('')
    const result = await saveSponsorPackage(parsed.value)
    setBusy(false)
    if (result.error) {
      setMessage(result.error)
      return
    }
    setSaved(true)
    if (!lockedSlug) {
      setSlug('')
      setName('')
      setPrice('')
      setSlots('0')
      setIntro('0')
      setRooms('0')
      setActive(true)
      setPlaceholder(true)
    }
    onSaved()
  }

  return (
    <form onSubmit={(event) => void onSubmit(event)} className="border border-white/10 px-4 py-4">
      <div className="grid gap-3 md:grid-cols-2">
        <label className={labelClass}>
          Key
          <input
            className={fieldClass}
            value={slug}
            readOnly={lockedSlug}
            onChange={(input) => setSlug(input.target.value)}
            autoComplete="off"
          />
        </label>
        <label className={labelClass}>
          Name
          <input className={fieldClass} value={name} onChange={(input) => setName(input.target.value)} autoComplete="off" />
        </label>
        <label className={labelClass}>
          Price label
          <input className={fieldClass} value={price} onChange={(input) => setPrice(input.target.value)} autoComplete="off" />
        </label>
        <label className={labelClass}>
          Majlis slots
          <input className={fieldClass} inputMode="numeric" value={slots} onChange={(input) => setSlots(input.target.value)} />
        </label>
        <label className={labelClass}>
          Intro credits
          <input className={fieldClass} inputMode="numeric" value={intro} onChange={(input) => setIntro(input.target.value)} />
        </label>
        <label className={labelClass}>
          Room credits
          <input className={fieldClass} inputMode="numeric" value={rooms} onChange={(input) => setRooms(input.target.value)} />
        </label>
      </div>
      <div className="mt-3 flex flex-wrap gap-4">
        <label className="flex min-h-11 items-center gap-2 text-[0.9rem] text-pearl/80 normal-case">
          <input type="checkbox" checked={active} onChange={(input) => setActive(input.target.checked)} />
          Active
        </label>
        <label className="flex min-h-11 items-center gap-2 text-[0.9rem] text-pearl/80 normal-case">
          <input type="checkbox" checked={placeholder} onChange={(input) => setPlaceholder(input.target.checked)} />
          Placeholder
        </label>
      </div>
      {message ? (
        <p className="mt-3 text-[0.95rem] text-red-300" role="alert">
          {message}
        </p>
      ) : null}
      {saved ? <p className="mt-3 text-[0.95rem] text-pearl/70">Saved.</p> : null}
      <button
        type="submit"
        disabled={busy}
        className="ba-primary mt-4 inline-flex min-h-11 items-center px-4 text-[0.72rem] font-semibold tracking-[0.08em] uppercase disabled:opacity-40"
      >
        {busy ? 'Saving' : lockedSlug ? 'Save package' : 'Add package'}
      </button>
    </form>
  )
}
