import { useEffect, useState } from 'react'
import {
  type SponsorCatalog,
  type SponsorRosterRow,
} from '../../lib/sponsorDesk'
import { assignSponsorCategory, assignSponsorPackage, fetchSponsorCatalog } from '../../lib/supabase'

const fieldClass =
  'mt-2 block w-full min-h-11 border border-pearl/20 bg-ink px-3 text-[0.9rem] text-pearl normal-case'
const labelClass = 'block text-[0.68rem] font-semibold tracking-[0.08em] text-pearl/45 uppercase'

export function SponsorSeatPanel() {
  const [catalog, setCatalog] = useState<SponsorCatalog | null>(null)
  const [error, setError] = useState('')
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    let cancelled = false
    void fetchSponsorCatalog().then((result) => {
      if (cancelled) return
      if ('error' in result) {
        setError(result.error)
        setCatalog(null)
        return
      }
      setError('')
      setCatalog(result.catalog)
    })
    return () => {
      cancelled = true
    }
  }, [attempt])

  return (
    <section className="mt-4 border border-pearl/10 px-4 py-5 sm:px-5">
      <h3 className="text-[0.72rem] font-semibold tracking-[0.12em] text-pearl/45 uppercase">Package and category</h3>
      <p className="mt-2 text-[0.9rem] leading-relaxed text-stone/65">
        Each partner seat holds one package and one category. A category stays with one partner until you clear it.
      </p>
      {error ? (
        <p className="mt-3 text-[0.95rem] text-red-300" role="alert">
          {error}{' '}
          <button type="button" className="min-h-11 underline" onClick={() => setAttempt((value) => value + 1)}>
            Retry
          </button>
        </p>
      ) : null}
      {catalog && catalog.sponsors.length === 0 ? (
        <p className="mt-3 text-[0.9rem] text-pearl/45">No partners invited yet.</p>
      ) : null}
      <ul className="mt-4 space-y-3">
        {(catalog?.sponsors ?? []).map((sponsor) => (
          <SeatEditor
            key={`${sponsor.user_id}:${sponsor.package_slug ?? ''}:${sponsor.category_slug ?? ''}:${attempt}`}
            sponsor={sponsor}
            packages={catalog?.packages ?? []}
            categories={catalog?.categories ?? []}
            onSaved={() => setAttempt((value) => value + 1)}
          />
        ))}
      </ul>
    </section>
  )
}

function SeatEditor({
  sponsor,
  packages,
  categories,
  onSaved,
}: {
  sponsor: SponsorRosterRow
  packages: SponsorCatalog['packages']
  categories: SponsorCatalog['categories']
  onSaved: () => void
}) {
  const [packageSlug, setPackageSlug] = useState(sponsor.package_slug ?? '')
  const [categorySlug, setCategorySlug] = useState(sponsor.category_slug ?? '')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const choices = packages.filter((row) => row.active || row.slug === sponsor.package_slug)

  async function onSave() {
    setBusy(true)
    setMessage('')
    const category = await assignSponsorCategory(sponsor.user_id, categorySlug)
    if (category.error) {
      setBusy(false)
      setMessage(category.error)
      return
    }
    const pack = await assignSponsorPackage(sponsor.user_id, packageSlug)
    setBusy(false)
    if (pack.error) {
      setMessage(pack.error)
      return
    }
    onSaved()
  }

  return (
    <li className="border border-pearl/10 px-4 py-4">
      <p className="text-[0.95rem] text-stone/85">{sponsor.label}</p>
      <p className="mt-1 text-[0.8rem] break-all text-pearl/45">
        {sponsor.email || 'No email'} · {sponsor.status}
      </p>
      <div className="mt-3 grid gap-3 md:grid-cols-2">
        <label className={labelClass}>
          Package
          <select className={fieldClass} value={packageSlug} onChange={(input) => setPackageSlug(input.target.value)}>
            <option value="">No package</option>
            {choices.map((row) => (
              <option key={row.slug} value={row.slug}>
                {row.name}
                {row.is_placeholder ? ' (placeholder)' : ''}
              </option>
            ))}
          </select>
        </label>
        <label className={labelClass}>
          Category
          <select className={fieldClass} value={categorySlug} onChange={(input) => setCategorySlug(input.target.value)}>
            <option value="">No category</option>
            {categories.map((row) => (
              <option key={row.slug} value={row.slug}>
                {row.name}
              </option>
            ))}
          </select>
        </label>
      </div>
      {message ? (
        <p className="mt-3 text-[0.95rem] text-red-300" role="alert">
          {message}
        </p>
      ) : null}
      <button
        type="button"
        disabled={busy}
        onClick={() => void onSave()}
        className="ba-primary mt-4 inline-flex min-h-11 items-center px-4 text-[0.72rem] font-semibold tracking-[0.08em] uppercase disabled:opacity-40"
      >
        {busy ? 'Saving' : 'Save seat'}
      </button>
    </li>
  )
}
