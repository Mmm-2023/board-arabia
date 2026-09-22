/** Google Calendar helpers — OAuth refresh token (preferred) or service account JSON. */

export type CalendarInviteResult = {
  dryRun: boolean
  eventId: string | null
  meetLink: string | null
  htmlLink: string | null
  detail?: string
}

function googleConfigured(): boolean {
  const oauth =
    Deno.env.get('GOOGLE_CLIENT_ID') &&
    Deno.env.get('GOOGLE_CLIENT_SECRET') &&
    Deno.env.get('GOOGLE_REFRESH_TOKEN')
  const sa = Deno.env.get('GOOGLE_SERVICE_ACCOUNT_JSON')
  return Boolean(oauth || sa)
}

async function getAccessToken(): Promise<string> {
  const clientId = Deno.env.get('GOOGLE_CLIENT_ID')
  const clientSecret = Deno.env.get('GOOGLE_CLIENT_SECRET')
  const refreshToken = Deno.env.get('GOOGLE_REFRESH_TOKEN')

  if (clientId && clientSecret && refreshToken) {
    const body = new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type: 'refresh_token',
    })
    const res = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body,
    })
    const json = (await res.json()) as { access_token?: string; error?: string }
    if (!res.ok || !json.access_token) {
      throw new Error(
        `Google OAuth token failed: ${json.error || res.status}`,
      )
    }
    return json.access_token
  }

  const saRaw = Deno.env.get('GOOGLE_SERVICE_ACCOUNT_JSON')
  if (!saRaw) {
    throw new Error(
      'Missing Google Calendar secrets. Set GOOGLE_CLIENT_ID + GOOGLE_CLIENT_SECRET + GOOGLE_REFRESH_TOKEN (preferred) or GOOGLE_SERVICE_ACCOUNT_JSON.',
    )
  }

  // Service account JWT assertion (needs Calendar scope; external invites often need domain-wide delegation).
  const sa = JSON.parse(saRaw) as {
    client_email: string
    private_key: string
    token_uri?: string
  }
  const now = Math.floor(Date.now() / 1000)
  const header = b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }))
  const claim = b64url(
    JSON.stringify({
      iss: sa.client_email,
      scope: 'https://www.googleapis.com/auth/calendar',
      aud: sa.token_uri || 'https://oauth2.googleapis.com/token',
      iat: now,
      exp: now + 3600,
      ...(Deno.env.get('GOOGLE_IMPERSONATE_USER')
        ? { sub: Deno.env.get('GOOGLE_IMPERSONATE_USER') }
        : {}),
    }),
  )
  const unsigned = `${header}.${claim}`
  const key = await importPkcs8(sa.private_key)
  const sig = await crypto.subtle.sign(
    'RSASSA-PKCS1-v1_5',
    key,
    new TextEncoder().encode(unsigned),
  )
  const jwt = `${unsigned}.${b64url(sig)}`
  const tokenRes = await fetch(
    sa.token_uri || 'https://oauth2.googleapis.com/token',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
        assertion: jwt,
      }),
    },
  )
  const tokenJson = (await tokenRes.json()) as {
    access_token?: string
    error?: string
  }
  if (!tokenRes.ok || !tokenJson.access_token) {
    throw new Error(
      `Google SA token failed: ${tokenJson.error || tokenRes.status}`,
    )
  }
  return tokenJson.access_token
}

export async function createMeetInvite(opts: {
  applicantEmail: string
  applicantName: string | null
  startIso: string
  endIso: string
  applicationId: string
}): Promise<CalendarInviteResult> {
  if (!googleConfigured()) {
    return {
      dryRun: true,
      eventId: null,
      meetLink: null,
      htmlLink: null,
      detail:
        'Google Calendar secrets not set — logged only. See README (GOOGLE_CLIENT_ID / REFRESH_TOKEN or SERVICE_ACCOUNT).',
    }
  }

  const accessToken = await getAccessToken()
  const calendarId =
    Deno.env.get('GOOGLE_CALENDAR_ID') || 'primary'
  const requestId = crypto.randomUUID()

  const event = {
    summary: `Board Arabia conversation — ${opts.applicantName || opts.applicantEmail}`,
    description: `Private Board Arabia conversation (application ${opts.applicationId}).`,
    start: { dateTime: opts.startIso },
    end: { dateTime: opts.endIso },
    attendees: [{ email: opts.applicantEmail }],
    conferenceData: {
      createRequest: {
        requestId,
        conferenceSolutionKey: { type: 'hangoutsMeet' },
      },
    },
    guestsCanInviteOthers: false,
    guestsCanModify: false,
  }

  const url =
    `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events` +
    `?conferenceDataVersion=1&sendUpdates=all`

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(event),
  })
  const json = (await res.json()) as {
    id?: string
    htmlLink?: string
    hangoutLink?: string
    conferenceData?: { entryPoints?: { entryPointType?: string; uri?: string }[] }
    error?: { message?: string }
  }

  if (!res.ok) {
    throw new Error(
      json.error?.message || `Calendar create failed (${res.status})`,
    )
  }

  const meetFromEntries = json.conferenceData?.entryPoints?.find(
    (e) => e.entryPointType === 'video',
  )?.uri

  return {
    dryRun: false,
    eventId: json.id ?? null,
    meetLink: meetFromEntries || json.hangoutLink || null,
    htmlLink: json.htmlLink ?? null,
  }
}

function b64url(input: string | ArrayBuffer): string {
  const bytes =
    typeof input === 'string'
      ? new TextEncoder().encode(input)
      : new Uint8Array(input)
  let bin = ''
  for (const b of bytes) bin += String.fromCharCode(b)
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

async function importPkcs8(pem: string): Promise<CryptoKey> {
  const cleaned = pem
    .replace(/-----BEGIN PRIVATE KEY-----/, '')
    .replace(/-----END PRIVATE KEY-----/, '')
    .replace(/\s+/g, '')
  const raw = Uint8Array.from(atob(cleaned), (c) => c.charCodeAt(0))
  return crypto.subtle.importKey(
    'pkcs8',
    raw,
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['sign'],
  )
}
