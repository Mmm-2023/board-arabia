import { useEffect, useState } from 'react'
import { SignedAvatar } from '../../components/SignedAvatar'
import { suggestionPortrait } from './suggestionPortrait'
import { fetchIntroContacts, fetchIntroQuota, fetchMyIntroSuggestions, fetchMyIntros, recordIntroMeet, requestMemberIntro, respondMemberIntro } from '../../lib/demoFetch'
import type { IntroSuggestion } from '../../lib/introSuggestions'
import { introQuotaHint, outgoingMemberStatus, type IntroContact, type IntroQuota, type IntroRow, type MeetOutcome } from '../../lib/memberIntros'
import { useNoIndex } from '../../lib/usePageTitle'
import { CardSkeleton, ErrorBanner } from '../../shell/ViewState'
import { MEMBER_VIEWS } from '../../shell/viewCopy'
import { IntroBoard } from './IntroBoard'
import { IntroSuggestions } from './IntroSuggestions'

type ListState =
  | { status: 'loading' }
  | { status: 'error' }
  | { status: 'ready'; rows: IntroRow[] }

export function IntrosPage() {
  const [list, setList] = useState<ListState>({ status: 'loading' })
  const [attempt, setAttempt] = useState(0)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [error, setError] = useState('')
  const [contacts, setContacts] = useState<Record<string, IntroContact>>({})
  const [quota, setQuota] = useState<IntroQuota | null>(null)
  const [suggestions, setSuggestions] = useState<IntroSuggestion[]>([])
  const [suggestError, setSuggestError] = useState(false)
  const [requestBusy, setRequestBusy] = useState<string | null>(null)
  const [requestErrorId, setRequestErrorId] = useState<string | null>(null)
  const [requestError, setRequestError] = useState('')
  useNoIndex('Intros | Board Arabia')

  useEffect(() => {
    let cancelled = false
    void fetchMyIntros().then((result) => {
      if (cancelled) return
      if (result.status === 'error') {
        setList({ status: 'error' })
        return
      }
      setList({ status: 'ready', rows: result.status === 'ready' ? result.rows : [] })
    })
    void fetchIntroContacts().then((result) => {
      if (cancelled) return
      setContacts(result.status === 'ready' ? result.rows : {})
    })
    void fetchIntroQuota().then((result) => {
      if (!cancelled) setQuota(result)
    })
    void fetchMyIntroSuggestions().then((result) => {
      if (cancelled) return
      if (result.status === 'error') {
        setSuggestError(true)
        setSuggestions([])
        return
      }
      setSuggestError(false)
      setSuggestions(result.status === 'ready' ? result.rows : [])
    })
    return () => {
      cancelled = true
    }
  }, [attempt])

  async function onRequestSuggestion(id: string, reason: string, askDesk: boolean) {
    setRequestError('')
    setRequestErrorId(null)
    setRequestBusy(id)
    const message = await requestMemberIntro(id, reason, askDesk)
    setRequestBusy(null)
    if (message) {
      setRequestErrorId(id)
      setRequestError(message)
      return
    }
    setList({ status: 'loading' })
    setAttempt((value) => value + 1)
  }

  async function onMeet(id: string, outcome: MeetOutcome) {
    const row = list.status === 'ready' ? list.rows.find((item) => item.id === id) : null
    if (row?.is_demo || !row?.meet_due) return
    setError('')
    setBusyId(id)
    const message = await recordIntroMeet(id, outcome)
    setBusyId(null)
    if (message) {
      setError(message)
      return
    }
    setList({ status: 'loading' })
    setAttempt((value) => value + 1)
  }

  async function onRespond(id: string, decision: 'accepted' | 'declined') {
    const row = list.status === 'ready' ? list.rows.find((item) => item.id === id) : null
    if (row?.is_demo) return
    setError('')
    setBusyId(id)
    const message = await respondMemberIntro(id, decision)
    setBusyId(null)
    if (message) {
      setError(message)
      return
    }
    setList({ status: 'loading' })
    setAttempt((value) => value + 1)
  }

  return (
    <div className="max-w-3xl">
      <h1 className="font-display text-[2.2rem] font-bold tracking-[-0.03em]">Intros</h1>
      <p className="mt-3 max-w-xl text-[1rem] leading-relaxed text-ink/65">
        Requests you sent, and requests sent to you. Mandate and real estate unlocks are in this list too.
      </p>
      <p className="mt-3 max-w-xl text-[1rem] leading-relaxed text-ink/65">
        After someone accepts, you both see email, LinkedIn, and phone when it is set. Before that, those stay private.
      </p>
      {quota ? (
        <p className="mt-3 text-[1rem] text-ink/70">{introQuotaHint(quota.remaining, quota.allowance)} this month.</p>
      ) : null}
      {suggestError ? (
        <div className="mt-6">
          <ErrorBanner
            tone="member"
            message={MEMBER_VIEWS.network.error}
            retryLabel={MEMBER_VIEWS.network.retry}
            onRetry={() => {
              setSuggestError(false)
              setAttempt((value) => value + 1)
            }}
          />
        </div>
      ) : (
        <IntroSuggestions
          rows={suggestions}
          quota={quota}
          introStatus={(id) => (list.status === 'ready' ? outgoingMemberStatus(list.rows, id) : null)}
          busyId={requestBusy}
          errorId={requestErrorId}
          error={requestError}
          showEmpty={list.status === 'ready'}
          portrait={suggestionPortrait}
          onRequest={(id, reason, askDesk) => void onRequestSuggestion(id, reason, askDesk)}
        />
      )}
      <div className="mt-8">
        {list.status === 'loading' ? <CardSkeleton tone="member" label="Loading intros" /> : null}
        {list.status === 'error' ? (
          <ErrorBanner
            tone="member"
            message={MEMBER_VIEWS.network.error}
            retryLabel={MEMBER_VIEWS.network.retry}
            onRetry={() => {
              setList({ status: 'loading' })
              setAttempt((value) => value + 1)
            }}
          />
        ) : null}
        {list.status === 'ready' ? (
          <IntroBoard
            tone="member"
            rows={list.rows}
            busyId={busyId}
            error={error}
            contacts={contacts}
            onRespond={(id, decision) => void onRespond(id, decision)}
            onMeet={(id, outcome) => void onMeet(id, outcome)}
            portrait={(row) => (
              <SignedAvatar path={row.avatar_path ?? null} avatarStyle={row.avatar_style} size={48} alt="" />
            )}
          />
        ) : null}
      </div>
    </div>
  )
}
