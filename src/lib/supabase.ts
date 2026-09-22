import { createClient } from '@supabase/supabase-js'
import type { Database } from './database.types'

const url = import.meta.env.VITE_SUPABASE_URL
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!url || !anonKey) {
  throw new Error(
    'Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY. Copy .env.example to .env.',
  )
}

export const supabase = createClient<Database>(url, anonKey)

export type ApplicationStatus = 'pending' | 'verified' | 'declined'

export type Application = {
  id: string
  created_at: string
  updated_at: string
  turnover: string
  companies: string
  job_titles: string
  linkedin_url: string | null
  calendar_slot: string | null
  status: ApplicationStatus
  notes: string | null
}
