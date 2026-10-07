import { useEffect, useState } from 'react'
import { PARTNER_CATEGORIES, presentPartnerCategories, type PartnerCategory } from '../data/partnerCategories.ts'
import { supabase } from './supabase'

/** Seed list first, then the table when it answers. One list for the gallery and filters. */
export function usePartnerCategories(): PartnerCategory[] {
  const [rows, setRows] = useState<PartnerCategory[]>(PARTNER_CATEGORIES)

  useEffect(() => {
    let cancelled = false
    void supabase.rpc('list_partner_categories').then(({ data, error }) => {
      if (cancelled || error) return
      const parsed = presentPartnerCategories(data)
      if (parsed.length > 0) setRows(parsed)
    })
    return () => {
      cancelled = true
    }
  }, [])

  return rows
}
