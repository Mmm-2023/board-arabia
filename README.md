# Board Arabia

Application-only site: **land → apply (pre-vet) → staff review**, with private Accept/Reject emails.

**Staging (Vercel):** https://board-arabia.vercel.app/

Preferred GitHub Pages once enabled: https://mmm-2023.github.io/board-arabia/

## Stack

- Vite + React + TypeScript + Tailwind CSS v4
- Supabase project `iirqbizwanyhgkhanntq` (`applications` with `full_name`, `email`, `phone`, `fo_aum`, nullable `calendar_slot`; `staff_users`; `email_events`)
- Status values: `pending` | `accepted` | `rejected` (also allows legacy `verified` | `declined`)
- Email: Supabase Edge Functions + **Resend** (dry-run audit when `RESEND_API_KEY` is unset)
- Private Meet invites on Accept via Google Calendar API (admin picks date/time). Never a public booking CTA. `calendar_slot` stores the chosen meeting ISO.

## Local setup

```bash
cp .env.example .env
npm install
npm run dev
```

`.env.example` already contains the locked anon URL/key for local and preview builds.

## Visitor flow (no login)

1. **Landing** (`/`) — prestige club feel; English only; **no** public Google Calendar CTA.
2. **Apply** (`/apply`) — pre-vet form: name, email, phone (optional), turnover **or** FO AUM, LinkedIn URL, job titles, companies.
3. On submit → Edge Function **`submit-application`** (validated + rate-limited):
   - Inserts `applications.status = pending`
   - Acknowledgement email to applicant
   - Notify email to **michael@nammco.com** with **this** application summary + `/admin` link (no other applicants’ data)

Legacy `/book` and `/verify` redirect to `/apply`.

## Staff flow

1. **Login** (`/login`) — Supabase Auth email + password → redirects to `/admin`.
2. **Admin** (`/admin` or `/ops`) — only rows in `staff_users` can list applications.
3. **Accept** → Edge Function `decide-application`: Michael picks date/time in `/admin` → Google Calendar API creates event **with Meet** and invites the applicant. Optional Resend ack. No public booking page.
4. **Reject** → polite decline email to applicant.
5. **Sign out** on admin clears the session.

### Critical anti-leak

The public site must **never** show `calendar.app.google` or any open appointment schedule. Accept creates a **private** Google Calendar event + Meet invite for the applicant only.

## Michael: set / reset staff password

Michael (`michael@smemarketer.com`) is already in `staff_users` on the locked project.

**One-time password (pick one):**

1. **Dashboard reset (simplest)**  
   Supabase → Authentication → Users → Michael → *Send password recovery* or *Reset password*.

2. **Invite link**  
   Authentication → Users → Invite user (same email) → open invite email → set password.

3. **Magic / recovery link (SQL / Auth API)**  
   Authentication → Users → generate recovery link → open once and set password.

Then open https://board-arabia.vercel.app/login and sign in → `/admin`.

### Promote another staff user

```sql
insert into public.staff_users (user_id, email)
select id, email
from auth.users
where email = 'someone@example.com'
on conflict (user_id) do update set email = excluded.email;
```

## Secrets (Michael clicks)

Set these in **Supabase → Project Settings → Edge Functions → Secrets**:

### Email (Resend)

| Secret | Required | Purpose |
|--------|----------|---------|
| `RESEND_API_KEY` | **Yes for live email** | Ack / notify / reject (+ optional Accept ack) |
| `RESEND_FROM` | Recommended | Verified sender |
| `PUBLIC_SITE_URL` | Recommended | Admin link in notify. Default `https://board-arabia.vercel.app` |

### Google Calendar + Meet (Accept path)

**Preferred: OAuth user refresh token** (Michael’s Google account that owns the calendar):

| Secret | Required | Purpose |
|--------|----------|---------|
| `GOOGLE_CLIENT_ID` | **Yes for live invites** | OAuth client ID (Google Cloud Console) |
| `GOOGLE_CLIENT_SECRET` | **Yes** | OAuth client secret |
| `GOOGLE_REFRESH_TOKEN` | **Yes** | Refresh token with `https://www.googleapis.com/auth/calendar` |
| `GOOGLE_CALENDAR_ID` | Optional | Calendar id (default `primary`) |

**Click-path to get a refresh token:**

1. Google Cloud Console → create/select project → enable **Google Calendar API**.  
2. APIs & Services → Credentials → Create **OAuth 2.0 Client ID** (Web application). Add redirect URI (e.g. `https://developers.google.com/oauthplayground`).  
3. OAuth consent screen → add scope `.../auth/calendar`.  
4. Open [OAuth 2.0 Playground](https://developers.google.com/oauthplayground) → gear → use your client ID/secret → authorize Calendar API v3 → Exchange authorization code for tokens → copy **Refresh token**.  
5. Paste the three values into Supabase Edge secrets.

**Alternative: service account** (harder for external Meet invites):

| Secret | Notes |
|--------|--------|
| `GOOGLE_SERVICE_ACCOUNT_JSON` | Full SA JSON string |
| `GOOGLE_IMPERSONATE_USER` | Workspace user to impersonate (domain-wide delegation) |
| `GOOGLE_CALENDAR_ID` | Target calendar |

Without Google secrets, Accept still updates status in **dry-run** and logs `email_events` with setup instructions — no public booking page is used.

Without `RESEND_API_KEY`, Resend paths dry-run into `email_events`:

```sql
select created_at, kind, recipient, subject, status, detail
from public.email_events
order by created_at desc
limit 20;
```

### Resend setup click-path

1. Create a Resend account → API key.  
2. Add + verify a sending domain (or use onboarding sender for sandbox tests).  
3. Paste key as `RESEND_API_KEY`.

## Prove apply → emails → Accept

1. Staging → **Apply for review** → submit.  
2. Confirm ack + `michael@nammco.com` notify (or dry-run rows).  
3. `/login` → `/admin` → **Accept** → pick date/time → Confirm → Google Calendar Meet invite to applicant (or dry-run until Google secrets set).  
4. Public site has **no** calendar CTA.

## Deploy

- **Vercel:** https://board-arabia.vercel.app  
- **GitHub Pages:** `.github/workflows/pages.yml` when Pages source is GitHub Actions.

## Security checklist (Michael lock)

| # | Requirement | Status | Notes |
|---|-------------|--------|-------|
| 1 | RLS: no anon SELECT on `applications`; staff-only read; anon INSERT validated or Edge-only | **PASS** | Anon SELECT/UPDATE denied (proved). Staff SELECT via `staff_users`. Client UPDATE grant removed. Preferred path: `submit-application`. |
| 2 | `/admin` behind Supabase Auth + `staff_users` gate | **PASS** | Unauthed → `/login?next=/admin`. Non-staff sees Not authorized. |
| 3 | No booking link / member PII on public pages | **PASS** | No `calendar.app.google` in client. Accept uses private Calendar API invite. |
| 4 | Accept/Reject server-side only (JWT + staff) | **PASS** | `decide-application` JWT + staff; Accept requires meeting_start/end; Google Meet invite server-side. |
| 5 | Rate-limit apply; validate/sanitize; no open redirects | **PASS** | `submit-application`: field length caps, email/URL checks, 5/hour per email+IP. Login `next` allowlist (path-only). |
| 6 | Secrets only in Vercel/Supabase env | **PASS** | Repo has public anon key only (expected). `RESEND_API_KEY` / service role never committed. |
| 7 | Notify templates don’t leak other applicants | **PASS** | Templates built from the single inserted/decided row only. |

**Remaining GAPs (non-blocking for Done-when):**

- **GAP:** Live Calendar Meet invites need Michael’s **Google OAuth** secrets (`GOOGLE_CLIENT_ID` / `SECRET` / `REFRESH_TOKEN`). Until set, Accept dry-runs.
- **GAP:** Live email delivery needs **`RESEND_API_KEY`**.
- **GAP:** `staff_users_claim_first` residual if table emptied.
- **GAP:** Legacy `notify-application` still exists; prefer `submit-application`.

## Anti-jobs

No Stripe, no Lovable, no Arabic UI, no LinkedIn OAuth login, no DNS changes, no public calendar embed/CTA, no nammco branding on the site.
