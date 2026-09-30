import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import {
  parseFunnel,
  readMarketingSearch,
  type ChannelId,
  type FunnelPayload,
  type RangeId,
  type StatsPayload,
  type StatsStatus,
} from '../../lib/marketing'
import { fetchMarketingFunnel, fetchMarketingStats, supabase } from '../../lib/supabase'
import { useNoIndex } from '../../lib/usePageTitle'
import { MarketingView } from './MarketingView'

export function MarketingPage() {
  const [params, setParams] = useSearchParams()
  const query = readMarketingSearch(params)
  const [funnel, setFunnel] = useState<FunnelPayload | null>(null)
  const [previous, setPrevious] = useState<FunnelPayload | null>(null)
  const [stats, setStats] = useState<StatsPayload | null>(null)
  const [statsStatus, setStatsStatus] = useState<StatsStatus>('loading')
  const [lastGoodAt, setLastGoodAt] = useState<string | null>(null)
  const [loadingFunnel, setLoadingFunnel] = useState(true)
  const [funnelError, setFunnelError] = useState('')
  const [denied, setDenied] = useState(false)
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null)
  const [spendSar, setSpendSar] = useState<number | null>(null)
  const [attempt, setAttempt] = useState(0)
  useNoIndex('Marketing | Board Arabia')

  const from = query.window.from.toISOString()
  const to = query.window.to.toISOString()
  const prevFrom = query.previous.from.toISOString()
  const prevTo = query.previous.to.toISOString()

  useEffect(() => {
    let cancelled = false
    setLoadingFunnel(true)
    setFunnelError('')
    setDenied(false)
    void fetchMarketingFunnel(from, to, query.channel).then((result) => {
      if (cancelled) return
      setLoadingFunnel(false)
      if (result.denied) {
        setDenied(true)
        setFunnel(null)
        return
      }
      if (result.error || !result.data) {
        setFunnelError(result.error || 'Marketing counts could not be loaded.')
        setFunnel(null)
        return
      }
      const parsed = parseFunnel(result.data)
      if (!parsed) {
        setFunnelError('Marketing counts could not be loaded.')
        setFunnel(null)
        return
      }
      setFunnel(parsed)
      setUpdatedAt(new Date())
      if (parsed.has_spend) void loadSpend(setSpendSar)
    })
    return () => {
      cancelled = true
    }
  }, [from, to, query.channel, attempt])

  useEffect(() => {
    if (!query.compare) {
      setPrevious(null)
      return
    }
    let cancelled = false
    void fetchMarketingFunnel(prevFrom, prevTo, query.channel).then((result) => {
      if (cancelled) return
      setPrevious(result.data ? parseFunnel(result.data) : null)
    })
    return () => {
      cancelled = true
    }
  }, [prevFrom, prevTo, query.channel, query.compare, attempt])

  useEffect(() => {
    let cancelled = false
    setStatsStatus('loading')
    void fetchMarketingStats(from, to, query.channel).then((result) => {
      if (cancelled) return
      if (result.status === 'ok' && result.body && isStats(result.body)) {
        setStats(result.body)
        setStatsStatus('ok')
        setUpdatedAt(new Date())
        return
      }
      setStats(null)
      setStatsStatus(result.status === 'error' ? 'error' : 'not_live')
      setLastGoodAt(result.lastGoodAt ?? null)
    })
    return () => {
      cancelled = true
    }
  }, [from, to, query.channel, attempt])

  function write(next: { range?: RangeId; channel?: ChannelId; compare?: boolean; from?: string; to?: string }) {
    const paramsNext = new URLSearchParams(params)
    const range = next.range ?? query.range
    const channel = next.channel ?? query.channel
    const compare = next.compare ?? query.compare
    if (range === '30') paramsNext.delete('range')
    else paramsNext.set('range', range)
    if (channel === 'all') paramsNext.delete('channel')
    else paramsNext.set('channel', channel)
    if (compare) paramsNext.set('compare', '1')
    else paramsNext.delete('compare')
    if (next.from) paramsNext.set('from', next.from)
    if (next.to) paramsNext.set('to', next.to)
    setParams(paramsNext)
  }

  return (
    <MarketingView
      range={query.range}
      channel={query.channel}
      compare={query.compare}
      customFrom={query.customFrom}
      customTo={query.customTo}
      onRange={(range) => write({ range })}
      onChannel={(channel) => write({ channel })}
      onCompare={(compare) => write({ compare })}
      onCustom={(fromDate, toDate) => write({ range: 'custom', from: fromDate, to: toDate })}
      funnel={funnelError || denied ? null : funnel}
      previous={previous}
      stats={stats}
      statsStatus={statsStatus}
      lastGoodAt={lastGoodAt}
      loadingFunnel={loadingFunnel}
      funnelError={funnelError}
      denied={denied}
      updatedAt={updatedAt}
      onRetry={() => setAttempt((value) => value + 1)}
      spendSar={spendSar}
    />
  )
}

function isStats(value: unknown): value is StatsPayload {
  if (!value || typeof value !== 'object') return false
  const row = value as { status?: string; visits?: unknown }
  return row.status === 'ok' && (typeof row.visits === 'number' || row.visits === 'lt5')
}

async function loadSpend(setSpend: (value: number | null) => void) {
  const { data, error } = await supabase.from('marketing_campaigns').select('spend_sar')
  if (error || !data) {
    setSpend(null)
    return
  }
  const total = data.reduce((sum, row) => sum + Number(row.spend_sar || 0), 0)
  setSpend(total > 0 ? total : null)
}
