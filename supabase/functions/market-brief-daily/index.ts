import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1'
import { completeAiToolPrompt } from '../_shared/ai_tool_provider.ts'
import {
  MARKET_BRIEF_DAILY_SECRET,
  MARKET_BRIEF_SEARCH_SECRET,
  canReplaceBriefDay,
  handleDailyMarketBrief,
  type DayWrite,
} from '../_shared/daily_market_brief.ts'
import { bareHostname, barePathPrefix, type OutletRule } from '../_shared/outlet_allowlist.ts'

type OutletRow = {
  name?: unknown
  domain?: unknown
  path_prefix?: unknown
  enabled?: unknown
}

function edgeEnv(name: string): string {
  return Deno.env.get(name) ?? ''
}

function store() {
  const supabaseUrl = edgeEnv('SUPABASE_URL')
  const serviceKey = edgeEnv('SUPABASE_SERVICE_ROLE_KEY')
  if (!supabaseUrl || !serviceKey) return null
  const admin = createClient(supabaseUrl, serviceKey)
  return {
    async loadOutlets(): Promise<OutletRule[] | null> {
      const { data, error } = await admin
        .from('market_brief_outlets')
        .select('name, domain, path_prefix, enabled')
        .order('sort_order', { ascending: true })
      if (error || !Array.isArray(data)) return null
      const outlets: OutletRule[] = []
      for (const row of data as OutletRow[]) {
        if (typeof row.name !== 'string' || typeof row.domain !== 'string') continue
        const domain = bareHostname(row.domain)
        const prefix = barePathPrefix(typeof row.path_prefix === 'string' ? row.path_prefix : null)
        if (!domain || prefix === 'invalid') continue
        outlets.push({
          name: row.name.trim(),
          domain,
          pathPrefix: prefix,
          enabled: row.enabled === true,
        })
      }
      return outlets
    },
    async writeDay(row: DayWrite): Promise<boolean> {
      const current = await admin
        .from('market_brief_days')
        .select('publish_status')
        .eq('brief_date', row.briefDate)
        .maybeSingle()
      if (current.error) return false
      const publishStatus =
        current.data && typeof current.data.publish_status === 'string' ? current.data.publish_status : null
      if (!canReplaceBriefDay(publishStatus)) return false
      const { error } = await admin.from('market_brief_days').upsert(
        {
          brief_date: row.briefDate,
          status: row.status,
          items: row.items,
          generated_at: row.generatedAt,
          model_id: row.modelId,
        },
        { onConflict: 'brief_date' },
      )
      return !error
    },
    async purgeBefore(briefDate: string): Promise<boolean> {
      const { error } = await admin.from('market_brief_days').delete().lt('brief_date', briefDate)
      return !error
    },
  }
}

Deno.serve((req) =>
  handleDailyMarketBrief(req, {
    secret: edgeEnv(MARKET_BRIEF_DAILY_SECRET),
    searchKey: edgeEnv(MARKET_BRIEF_SEARCH_SECRET),
    now: () => new Date(),
    complete: (system, user) => completeAiToolPrompt(system, user),
    loadOutlets: async () => {
      const ready = store()
      return ready ? ready.loadOutlets() : null
    },
    writeDay: async (row) => {
      const ready = store()
      return ready ? ready.writeDay(row) : false
    },
    purgeBefore: async (briefDate) => {
      const ready = store()
      return ready ? ready.purgeBefore(briefDate) : false
    },
  }),
)
