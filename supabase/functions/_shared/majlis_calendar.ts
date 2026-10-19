import { canonicalMeetUrl } from './majlis.ts'

/** Least privilege. Secondary calendars this app creates, and events on those calendars. */
export const MAJLIS_CALENDAR_SCOPE = 'https://www.googleapis.com/auth/calendar.app.created'
export const MAJLIS_CALENDAR_NAME = 'Board Arabia Majlis'
const TOKEN_URL = 'https://oauth2.googleapis.com/token'
const CALENDAR_API = 'https://www.googleapis.com/calendar/v3'

export type MajlisGoogleSecrets = {
  clientId: string
  clientSecret: string
  refreshToken: string
  calendarId: string
}

export type MajlisSyncOp = 'upsert' | 'cancel'

export type MajlisCalendarEvent = {
  id: string
  title: string
  description: string
  region: string
  starts_at: string
  ends_at: string
  format: string
  status: string
  google_event_id: string | null
  google_meet_url: string | null
  meet_fallback_url: string | null
}

export type MajlisSyncStatus = 'skipped' | 'not_connected' | 'synced' | 'failed' | 'cancelled'

export type MajlisSyncResult = {
  status: MajlisSyncStatus
  detail: string
  googleEventId: string | null
  meetUrl: string | null
  calendarId: string | null
}

type FetchImpl = (input: string, init: RequestInit) => Promise<Response>

type GoogleEvent = {
  id?: string
  hangoutLink?: string
  conferenceData?: {
    entryPoints?: Array<{ entryPointType?: string; uri?: string }>
  }
}

export function readMajlisGoogleSecrets(
  read: (name: string) => string | undefined,
): MajlisGoogleSecrets | null {
  const clientId = read('GOOGLE_MAJLIS_CLIENT_ID')?.trim() || ''
  const clientSecret = read('GOOGLE_MAJLIS_CLIENT_SECRET')?.trim() || ''
  const refreshToken = read('GOOGLE_MAJLIS_REFRESH_TOKEN')?.trim() || ''
  if (!clientId || !clientSecret || !refreshToken) return null
  return {
    clientId,
    clientSecret,
    refreshToken,
    calendarId: read('MAJLIS_CALENDAR_ID')?.trim() || '',
  }
}

/** One-time consent URL. Scope is calendar.app.created only. The secret is not in this URL. */
export function majlisOAuthConsentUrl(clientId: string, redirectUri: string): string {
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: MAJLIS_CALENDAR_SCOPE,
    access_type: 'offline',
    prompt: 'consent',
    include_granted_scopes: 'false',
  })
  return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`
}

export function majlisTokenRequestBody(secrets: MajlisGoogleSecrets): URLSearchParams {
  return new URLSearchParams({
    client_id: secrets.clientId,
    client_secret: secrets.clientSecret,
    refresh_token: secrets.refreshToken,
    grant_type: 'refresh_token',
  })
}

export function buildMajlisGoogleEventBody(event: MajlisCalendarEvent, requestId: string | null): Record<string, unknown> {
  const body: Record<string, unknown> = {
    summary: event.title.slice(0, 160),
    description: `Board Arabia majlis. Region: ${event.region}. The guest list stays on the site.`,
    start: { dateTime: event.starts_at, timeZone: 'Asia/Riyadh' },
    end: { dateTime: event.ends_at, timeZone: 'Asia/Riyadh' },
    guestsCanSeeOtherGuests: false,
    guestsCanInviteOthers: false,
  }
  if (requestId) {
    body.conferenceData = {
      createRequest: {
        requestId,
        conferenceSolutionKey: { type: 'hangoutsMeet' },
      },
    }
  }
  return body
}

export function meetUrlFromGoogleEvent(event: GoogleEvent): string | null {
  const hangout = canonicalMeetUrl(event.hangoutLink || '')
  if (hangout) return hangout
  const video = event.conferenceData?.entryPoints?.find((point) => point.entryPointType === 'video')
  return canonicalMeetUrl(video?.uri || '')
}

function safeDetail(status: number, fallback: string): string {
  if (!Number.isInteger(status) || status < 100) return fallback
  return `${fallback} (${status}).`
}

function assertNoGuestList(body: Record<string, unknown>) {
  if ('attendees' in body) throw new Error('guest_list')
}

export async function performMajlisGoogleSync(input: {
  secrets: MajlisGoogleSecrets | null
  storedCalendarId: string | null
  event: MajlisCalendarEvent
  op: MajlisSyncOp
  fetchImpl?: FetchImpl
}): Promise<MajlisSyncResult> {
  const virtual = input.event.format === 'virtual'
  const existingId = input.event.google_event_id?.trim() || ''
  if (!virtual && input.op === 'upsert' && !existingId) {
    return { status: 'skipped', detail: 'In person majlis. No Google event.', googleEventId: null, meetUrl: null, calendarId: null }
  }
  if (!virtual && input.op === 'cancel' && !existingId) {
    return { status: 'skipped', detail: 'Nothing to cancel on Google.', googleEventId: null, meetUrl: null, calendarId: null }
  }
  if (!input.secrets) {
    return {
      status: 'not_connected',
      detail: 'Google not connected.',
      googleEventId: existingId || null,
      meetUrl: canonicalMeetUrl(input.event.google_meet_url || ''),
      calendarId: null,
    }
  }

  const fetchImpl = input.fetchImpl ?? fetch
  const token = await fetchAccessToken(input.secrets, fetchImpl)
  if ('error' in token) {
    return {
      status: 'failed',
      detail: 'Google refused the sign-in refresh.',
      googleEventId: existingId || null,
      meetUrl: canonicalMeetUrl(input.event.google_meet_url || ''),
      calendarId: null,
    }
  }

  let calendarId = input.secrets.calendarId || input.storedCalendarId || ''
  let createdCalendar: string | null = null
  if (!calendarId) {
    const created = await createMajlisCalendar(token.token, fetchImpl)
    if ('error' in created) {
      return {
        status: 'failed',
        detail: created.error,
        googleEventId: existingId || null,
        meetUrl: canonicalMeetUrl(input.event.google_meet_url || ''),
        calendarId: null,
      }
    }
    calendarId = created.id
    createdCalendar = created.id
  }

  const cancel = input.op === 'cancel' || !virtual
  if (cancel) {
    if (!existingId) {
      return { status: 'cancelled', detail: 'No Google event to cancel.', googleEventId: null, meetUrl: null, calendarId: createdCalendar }
    }
    const removed = await patchEvent(calendarId, existingId, token.token, { status: 'cancelled' }, fetchImpl)
    if ('error' in removed) {
      return {
        status: 'failed',
        detail: removed.error,
        googleEventId: existingId,
        meetUrl: canonicalMeetUrl(input.event.google_meet_url || ''),
        calendarId: createdCalendar,
      }
    }
    return {
      status: 'cancelled',
      detail: 'Google event cancelled.',
      googleEventId: existingId,
      meetUrl: canonicalMeetUrl(input.event.google_meet_url || ''),
      calendarId: createdCalendar,
    }
  }

  if (existingId) {
    const needsConference = !canonicalMeetUrl(input.event.google_meet_url || '')
    const body = buildMajlisGoogleEventBody(input.event, needsConference ? input.event.id.replaceAll('-', '') : null)
    assertNoGuestList(body)
    const updated = await patchEvent(calendarId, existingId, token.token, body, fetchImpl)
    if ('error' in updated) {
      return {
        status: 'failed',
        detail: updated.error,
        googleEventId: existingId,
        meetUrl: canonicalMeetUrl(input.event.google_meet_url || ''),
        calendarId: createdCalendar,
      }
    }
    const link = meetUrlFromGoogleEvent(updated.event) || canonicalMeetUrl(input.event.google_meet_url || '')
    if (!link) {
      return {
        status: 'failed',
        detail: 'Google did not return a Meet link.',
        googleEventId: existingId,
        meetUrl: null,
        calendarId: createdCalendar,
      }
    }
    return {
      status: 'synced',
      detail: 'Meet link saved.',
      googleEventId: existingId,
      meetUrl: link,
      calendarId: createdCalendar,
    }
  }

  const requestId = input.event.id.replaceAll('-', '')
  const body = buildMajlisGoogleEventBody(input.event, requestId)
  assertNoGuestList(body)
  const inserted = await insertEvent(calendarId, token.token, body, fetchImpl)
  if ('error' in inserted) {
    return {
      status: 'failed',
      detail: inserted.error,
      googleEventId: null,
      meetUrl: null,
      calendarId: createdCalendar,
    }
  }
  let link = meetUrlFromGoogleEvent(inserted.event)
  const googleId = inserted.event.id?.trim() || ''
  if (!link && googleId) {
    const fetched = await getEvent(calendarId, googleId, token.token, fetchImpl)
    if (!('error' in fetched)) link = meetUrlFromGoogleEvent(fetched.event)
  }
  if (!googleId || !link) {
    return {
      status: 'failed',
      detail: 'Google did not return a Meet link.',
      googleEventId: googleId || null,
      meetUrl: null,
      calendarId: createdCalendar,
    }
  }
  return {
    status: 'synced',
    detail: 'Meet link saved.',
    googleEventId: googleId,
    meetUrl: link,
    calendarId: createdCalendar,
  }
}

async function fetchAccessToken(
  secrets: MajlisGoogleSecrets,
  fetchImpl: FetchImpl,
): Promise<{ token: string } | { error: string }> {
  let res: Response
  try {
    res = await fetchImpl(TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: majlisTokenRequestBody(secrets),
    })
  } catch {
    return { error: 'Google refused the sign-in refresh.' }
  }
  const parsed = (await res.json().catch(() => ({}))) as { access_token?: string }
  if (!res.ok || !parsed.access_token) return { error: 'Google refused the sign-in refresh.' }
  return { token: parsed.access_token }
}

async function createMajlisCalendar(
  token: string,
  fetchImpl: FetchImpl,
): Promise<{ id: string } | { error: string }> {
  const res = await googleFetch(fetchImpl, `${CALENDAR_API}/calendars`, token, {
    method: 'POST',
    body: JSON.stringify({ summary: MAJLIS_CALENDAR_NAME, timeZone: 'Asia/Riyadh' }),
  })
  if ('error' in res) return res
  const parsed = (await res.json().catch(() => ({}))) as { id?: string }
  const id = parsed.id?.trim() || ''
  if (!res.ok || !id) return { error: safeDetail(res.status, 'Google did not create the majlis calendar') }
  return { id }
}

async function insertEvent(
  calendarId: string,
  token: string,
  body: Record<string, unknown>,
  fetchImpl: FetchImpl,
): Promise<{ event: GoogleEvent } | { error: string }> {
  const url = `${CALENDAR_API}/calendars/${encodeURIComponent(calendarId)}/events?conferenceDataVersion=1`
  const res = await googleFetch(fetchImpl, url, token, { method: 'POST', body: JSON.stringify(body) })
  if ('error' in res) return res
  const event = (await res.json().catch(() => ({}))) as GoogleEvent
  if (!res.ok) return { error: safeDetail(res.status, 'Google refused the calendar call') }
  return { event }
}

async function patchEvent(
  calendarId: string,
  eventId: string,
  token: string,
  body: Record<string, unknown>,
  fetchImpl: FetchImpl,
): Promise<{ event: GoogleEvent } | { error: string }> {
  assertNoGuestList(body)
  const url = `${CALENDAR_API}/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}?conferenceDataVersion=1`
  const res = await googleFetch(fetchImpl, url, token, { method: 'PATCH', body: JSON.stringify(body) })
  if ('error' in res) return res
  const event = (await res.json().catch(() => ({}))) as GoogleEvent
  if (!res.ok) return { error: safeDetail(res.status, 'Google refused the calendar call') }
  return { event }
}

async function getEvent(
  calendarId: string,
  eventId: string,
  token: string,
  fetchImpl: FetchImpl,
): Promise<{ event: GoogleEvent } | { error: string }> {
  const url = `${CALENDAR_API}/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}`
  const res = await googleFetch(fetchImpl, url, token, { method: 'GET' })
  if ('error' in res) return res
  const event = (await res.json().catch(() => ({}))) as GoogleEvent
  if (!res.ok) return { error: safeDetail(res.status, 'Google refused the calendar call') }
  return { event }
}

async function googleFetch(
  fetchImpl: FetchImpl,
  url: string,
  token: string,
  init: RequestInit,
): Promise<Response | { error: string }> {
  try {
    return await fetchImpl(url, {
      ...init,
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        ...(init.headers || {}),
      },
    })
  } catch {
    return { error: 'Google refused the calendar call.' }
  }
}

type AdminLike = {
  from: (table: string) => {
    select: (columns: string) => {
      eq: (column: string, value: string) => {
        maybeSingle: () => Promise<{ data: Record<string, unknown> | null; error: { message: string } | null }>
      }
    }
    update: (patch: Record<string, unknown>) => {
      eq: (column: string, value: string) => Promise<{ error: { message: string } | null }>
    }
    insert: (row: Record<string, unknown>) => Promise<{ error: { message: string } | null }>
    upsert?: (
      row: Record<string, unknown>,
      options?: { onConflict?: string },
    ) => Promise<{ error: { message: string } | null }>
  }
}

function envRead(env: Record<string, string | undefined> | undefined, name: string): string | undefined {
  if (env) return env[name]
  const runtime = globalThis as { Deno?: { env?: { get?: (key: string) => string | undefined } } }
  const fromDeno = runtime.Deno?.env?.get?.(name)
  if (fromDeno) return fromDeno
  return typeof process !== 'undefined' ? process.env?.[name] : undefined
}

/** Load the majlis, sync Google, and store the event id and Meet link. Missing secrets fail closed. */
export async function syncStoredMajlis(
  admin: AdminLike,
  eventId: string,
  op: MajlisSyncOp,
  deps?: { fetchImpl?: FetchImpl; env?: Record<string, string | undefined> },
): Promise<MajlisSyncResult> {
  const { data, error } = await admin
    .from('majlis_events')
    .select('id, title, description, region, starts_at, ends_at, format, status, google_event_id, google_meet_url, meet_fallback_url')
    .eq('id', eventId)
    .maybeSingle()
  if (error || !data) {
    return { status: 'failed', detail: 'Could not load the majlis for Google sync.', googleEventId: null, meetUrl: null, calendarId: null }
  }
  const event = data as unknown as MajlisCalendarEvent
  const secrets = readMajlisGoogleSecrets((name) => envRead(deps?.env, name))
  let storedCalendarId: string | null = null
  if (secrets && !secrets.calendarId) {
    const stored = await admin.from('majlis_google_calendar').select('calendar_id').eq('id', '1').maybeSingle()
    const value = stored.data?.calendar_id
    storedCalendarId = typeof value === 'string' && value.trim() ? value.trim() : null
  }
  const result = await performMajlisGoogleSync({
    secrets,
    storedCalendarId,
    event,
    op,
    fetchImpl: deps?.fetchImpl,
  })
  if (result.calendarId) {
    const row = { id: 1, calendar_id: result.calendarId, updated_at: new Date().toISOString() }
    const table = admin.from('majlis_google_calendar')
    if (table.upsert) await table.upsert(row, { onConflict: 'id' })
    else await table.insert(row)
  }
  const patch: Record<string, unknown> = {
    meet_sync_status: result.status,
    meet_sync_detail: result.detail.slice(0, 200),
    updated_at: new Date().toISOString(),
  }
  if (result.status === 'synced') {
    patch.google_event_id = result.googleEventId
    patch.google_meet_url = result.meetUrl
  } else if (result.status === 'cancelled') {
    patch.google_event_id = result.googleEventId
  } else if (result.googleEventId) {
    patch.google_event_id = result.googleEventId
  }
  await admin.from('majlis_events').update(patch).eq('id', eventId)
  return result
}
