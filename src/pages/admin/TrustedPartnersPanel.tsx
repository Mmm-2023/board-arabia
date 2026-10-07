import { useEffect, useState, type FormEvent } from 'react'
import { PartnerLogo } from '../../components/TrustedPartners'
import { PARTNER_LOGO_BUCKET, inspectPartnerLogo, monogramFromName } from '../../lib/partnerLogo'
import { schemaMissing } from '../../lib/demoRows'
import { usePartnerCategories } from '../../lib/usePartnerCategories'
import { supabase } from '../../lib/supabase'
import { toneClasses } from '../../shell/ViewState'

type PartnerRow = {
  id: string
  is_demo: boolean
  published: boolean
  name: string
  blurb: string
  monogram: string
  logo_path: string | null
  category_slug: string | null
  offer: string | null
  sponsor_user_id: string | null
  sort_order: number
}

type SponsorOption = { user_id: string; label: string }

const fieldClass = 'mt-2 block w-full min-h-11 border border-pearl/20 bg-ink px-3 text-[0.9rem] text-pearl'
const labelClass = 'block text-[0.68rem] font-semibold tracking-[0.08em] text-pearl/45 uppercase'

export function TrustedPartnersPanel({ previewRows }: { previewRows?: PartnerRow[] } = {}) {
  const styles = toneClasses('staff')
  const categories = usePartnerCategories()
  const [rows, setRows] = useState<PartnerRow[] | null>(previewRows ?? null)
  const [sponsors, setSponsors] = useState<SponsorOption[]>([])
  const [error, setError] = useState('')
  const [editing, setEditing] = useState<PartnerRow | null>(null)
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    if (previewRows) return
    let cancelled = false
    void Promise.all([
      supabase.rpc('staff_list_trusted_partners'),
      supabase.rpc('staff_list_sponsor_options'),
    ]).then(([partners, options]) => {
      if (cancelled) return
      if (partners.error) {
        if (schemaMissing(partners.error.message)) {
          setRows([])
          return
        }
        setError('Could not load trusted partners.')
        setRows([])
        return
      }
      setError('')
      setRows(parsePartners(partners.data))
      setSponsors(options.error ? [] : parseSponsors(options.data))
    })
    return () => {
      cancelled = true
    }
  }, [attempt, previewRows])

  async function reload() {
    setEditing(null)
    setAttempt((value) => value + 1)
  }

  async function publish(row: PartnerRow, next: boolean) {
    setError('')
    const { error: rpcError } = await supabase.rpc('staff_set_trusted_partner_published', {
      p_id: row.id,
      p_published: next,
    })
    if (rpcError) {
      setError('Could not update that partner.')
      return
    }
    await reload()
  }

  async function move(row: PartnerRow, direction: -1 | 1) {
    if (!rows) return
    const index = rows.findIndex((item) => item.id === row.id)
    const target = index + direction
    if (index < 0 || target < 0 || target >= rows.length) return
    const next = rows.slice()
    const swapped = next[target]
    if (!swapped) return
    next[target] = row
    next[index] = swapped
    setError('')
    const { error: rpcError } = await supabase.rpc('staff_reorder_trusted_partners', {
      p_ids: next.map((item) => item.id),
    })
    if (rpcError) {
      setError('Could not reorder partners.')
      return
    }
    await reload()
  }

  return (
    <section id="trusted-partners" className={`${styles.panel} mt-8 px-5 py-5`} data-trusted-partners-editor="">
      <h2 className={`text-[0.72rem] font-semibold tracking-[0.12em] uppercase ${styles.quiet}`}>Trusted partners</h2>
      <p className="mt-3 text-[1rem] leading-relaxed text-pearl/80">
        Add a name, one line, and a logo. The public page stays hidden until a real partner has a logo. Sample rows stay in the member area, and only while no real partner is published.
      </p>
      {error ? (
        <p className="mt-3 text-[0.95rem] text-red-300" role="alert">
          {error}
        </p>
      ) : null}
      {rows == null ? <p className={`mt-4 ${styles.muted}`}>Loading partners.</p> : null}
      <ul className="mt-4 space-y-3">
        {(rows ?? []).map((row, index) => (
          <li key={row.id} className="border border-pearl/15 px-4 py-4">
            <div className="flex items-start gap-3">
              <PartnerLogo name={row.name} monogram={row.monogram} logoPath={row.logo_path} />
              <div className="min-w-0 flex-1">
                <p className="font-display text-[1.15rem] font-semibold">{row.name}</p>
                <p className={`mt-1 ${styles.muted}`}>{row.blurb}</p>
                <p className={`mt-1 text-[0.85rem] ${styles.quiet}`}>
                  {row.published ? 'Published' : 'Hidden'}
                  {row.is_demo ? '. Sample' : ''}
                </p>
              </div>
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              <button type="button" className="inline-flex min-h-11 items-center border border-pearl/30 px-3 text-[0.75rem] font-semibold tracking-[0.08em] text-brass-bright uppercase" onClick={() => setEditing(row)}>
                Edit
              </button>
              <button type="button" className="inline-flex min-h-11 items-center border border-pearl/30 px-3 text-[0.75rem] font-semibold tracking-[0.08em] text-brass-bright uppercase" onClick={() => void publish(row, !row.published)}>
                {row.published ? 'Hide' : 'Publish'}
              </button>
              <button type="button" className="inline-flex min-h-11 items-center border border-pearl/30 px-3 text-[0.75rem] font-semibold tracking-[0.08em] text-pearl uppercase disabled:opacity-40" disabled={index === 0} onClick={() => void move(row, -1)}>
                Move up
              </button>
              <button type="button" className="inline-flex min-h-11 items-center border border-pearl/30 px-3 text-[0.75rem] font-semibold tracking-[0.08em] text-pearl uppercase disabled:opacity-40" disabled={!rows || index === rows.length - 1} onClick={() => void move(row, 1)}>
                Move down
              </button>
              <LogoButton partnerId={row.id} onDone={() => void reload()} onError={setError} />
            </div>
          </li>
        ))}
      </ul>
      <PartnerForm
        key={editing?.id ?? 'new'}
        row={editing}
        categories={categories}
        sponsors={sponsors}
        onSaved={() => void reload()}
        onError={setError}
      />
    </section>
  )
}

function LogoButton({
  partnerId,
  onDone,
  onError,
}: {
  partnerId: string
  onDone: () => void
  onError: (message: string) => void
}) {
  return (
    <label className="relative inline-flex min-h-11 cursor-pointer items-center border border-pearl/30 px-3 text-[0.75rem] font-semibold tracking-[0.08em] text-pearl uppercase">
      Logo
      <input
        type="file"
        accept="image/png,image/jpeg,image/webp"
        className="absolute"
        style={{ width: 1, height: 1, overflow: 'hidden', clip: 'rect(0 0 0 0)' }}
        onChange={(event) => {
          const file = event.target.files?.[0]
          event.target.value = ''
          if (file) void uploadLogo(partnerId, file, onDone, onError)
        }}
      />
    </label>
  )
}

async function uploadLogo(
  partnerId: string,
  file: File,
  onDone: () => void,
  onError: (message: string) => void,
) {
  const bytes = new Uint8Array(await file.arrayBuffer())
  const inspected = inspectPartnerLogo(bytes)
  if (!inspected.ok) {
    onError('Use a PNG, JPEG, or WebP under 512 KB. SVG is not accepted.')
    return
  }
  const path = `${partnerId}/logo`
  const { error: uploadError } = await supabase.storage.from(PARTNER_LOGO_BUCKET).upload(path, bytes, {
    upsert: true,
    contentType: inspected.contentType,
    cacheControl: '3600',
  })
  if (uploadError) {
    onError('Could not upload that logo.')
    return
  }
  const { error: saveError } = await supabase.rpc('staff_set_trusted_partner_logo', {
    p_id: partnerId,
    p_logo_path: path,
  })
  if (saveError) {
    onError('Could not save that logo.')
    return
  }
  onDone()
}

function PartnerForm({
  row,
  categories,
  sponsors,
  onSaved,
  onError,
}: {
  row: PartnerRow | null
  categories: { slug: string; name: string }[]
  sponsors: SponsorOption[]
  onSaved: () => void
  onError: (message: string) => void
}) {
  const [name, setName] = useState(row?.name ?? '')
  const [blurb, setBlurb] = useState(row?.blurb ?? '')
  const [offer, setOffer] = useState(row?.offer ?? '')
  const [category, setCategory] = useState(row?.category_slug ?? '')
  const [sponsor, setSponsor] = useState(row?.sponsor_user_id ?? '')
  const [sample, setSample] = useState(row?.is_demo ?? false)
  const [busy, setBusy] = useState(false)

  async function onSubmit(event: FormEvent) {
    event.preventDefault()
    if (!name.trim() || !blurb.trim()) {
      onError('Name and one line are required.')
      return
    }
    if (blurb.trim().length > 200) {
      onError('The one line can be 200 characters.')
      return
    }
    setBusy(true)
    const { error } = await supabase.rpc('staff_save_trusted_partner', {
      p_id: row?.id ?? null,
      p_name: name.trim(),
      p_blurb: blurb.trim(),
      p_monogram: monogramFromName(name),
      p_is_demo: sample,
      p_category_slug: category || null,
      p_offer: offer.trim() || null,
      p_sponsor_user_id: sample ? null : sponsor || null,
    })
    setBusy(false)
    if (error) {
      onError('Could not save that partner.')
      return
    }
    onError('')
    onSaved()
  }

  return (
    <form onSubmit={(event) => void onSubmit(event)} className="mt-6 space-y-4 border-t border-pearl/15 pt-5">
      <h3 className="font-display text-[1.15rem] font-semibold">{row ? 'Edit partner' : 'Add a partner'}</h3>
      <label className={labelClass}>
        Name
        <input className={fieldClass} value={name} onChange={(event) => setName(event.target.value)} maxLength={120} />
      </label>
      <label className={labelClass}>
        One line
        <input className={fieldClass} value={blurb} onChange={(event) => setBlurb(event.target.value)} maxLength={200} />
      </label>
      <label className={labelClass}>
        What they offer
        <textarea className={fieldClass} value={offer} onChange={(event) => setOffer(event.target.value)} maxLength={400} rows={3} />
      </label>
      <label className={labelClass}>
        Category
        <select className={fieldClass} value={category} onChange={(event) => setCategory(event.target.value)}>
          <option value="">No category</option>
          {categories.map((item) => (
            <option key={item.slug} value={item.slug}>
              {item.name}
            </option>
          ))}
        </select>
      </label>
      <label className={labelClass}>
        Partner account
        <select className={fieldClass} value={sponsor} onChange={(event) => setSponsor(event.target.value)} disabled={sample}>
          <option value="">None</option>
          {sponsors.map((item) => (
            <option key={item.user_id} value={item.user_id}>
              {item.label}
            </option>
          ))}
        </select>
      </label>
      <label className="flex min-h-11 items-center gap-3 text-[0.95rem] text-pearl">
        <input type="checkbox" checked={sample} onChange={(event) => setSample(event.target.checked)} />
        Sample. Members see it only when no real partner is published.
      </label>
      <button type="submit" disabled={busy} className="ba-primary inline-flex min-h-11 items-center px-4 text-[0.75rem] font-semibold tracking-[0.08em] uppercase disabled:opacity-40">
        Save partner
      </button>
    </form>
  )
}

function parsePartners(raw: unknown): PartnerRow[] {
  if (!Array.isArray(raw)) return []
  const rows: PartnerRow[] = []
  for (const item of raw) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) continue
    const row = item as Record<string, unknown>
    const id = typeof row.id === 'string' ? row.id : ''
    const name = typeof row.name === 'string' ? row.name : ''
    const blurb = typeof row.blurb === 'string' ? row.blurb : ''
    const monogram = typeof row.monogram === 'string' ? row.monogram : ''
    if (!id || !name || !blurb || !monogram) continue
    rows.push({
      id,
      is_demo: row.is_demo === true,
      published: row.published === true,
      name,
      blurb,
      monogram,
      logo_path: typeof row.logo_path === 'string' ? row.logo_path : null,
      category_slug: typeof row.category_slug === 'string' ? row.category_slug : null,
      offer: typeof row.offer === 'string' ? row.offer : null,
      sponsor_user_id: typeof row.sponsor_user_id === 'string' ? row.sponsor_user_id : null,
      sort_order: typeof row.sort_order === 'number' ? row.sort_order : 0,
    })
  }
  return rows
}

function parseSponsors(raw: unknown): SponsorOption[] {
  if (!Array.isArray(raw)) return []
  const rows: SponsorOption[] = []
  for (const item of raw) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) continue
    const row = item as Record<string, unknown>
    const userId = typeof row.user_id === 'string' ? row.user_id : ''
    const label = typeof row.label === 'string' ? row.label : ''
    if (!userId || !label || label.includes('@')) continue
    rows.push({ user_id: userId, label })
  }
  return rows
}
