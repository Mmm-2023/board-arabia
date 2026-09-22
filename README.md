# Board Arabia

Application-only site: **land → apply (pre-vet) → staff review**, with private Accept/Reject emails.

**Staging (Vercel):** https://board-arabia.vercel.app/

## Marketing pages

English only. No public calendar, no member names or photographs, no fee schedule.

| Route | Purpose |
| --- | --- |
| `/` | Home: hero, why, Founding 100 (50/50), member-tool tiles, how it works, partners, trust, final CTA |
| `/apply` | Pre-vet form. CTA language is “Request consideration”. |
| `/for-members` | Directory, availability, intros, founding badge, majlis, vouchers, sector tags, dashboard preview |
| `/for-capital` | How FDI, family offices, PE, and VC reach members — mandate inbox and deal rooms, admin-gated |
| `/partners` | Three annual seats, fifteen finance categories, interest via `mailto:partners@boardarabia.com` (not stored) |
| `/how-it-works` | Pre-vet → review → Accept → private booking email → admit |
| `/about` | Short founding note |

Primary CTA on every marketing page is **Request consideration** → `/apply`. Partner CTA is **Partner with us** (mailto draft). Staff `/login` and `/admin` are unchanged and are not linked from the marketing nav.

**Security:** marketing pages render no applicant PII. The private booking URL stays in the Accept email path only (`supabase/functions/decide-application`). Do not add it to client code.

## SEO and answer engines

`npm run build` prerenders each marketing route to static HTML (React server render, no browser), so the response is not an empty SPA shell. Canonicals use `https://boardarabia.com` even on Vercel staging and preview URLs until the domain is cut over. Do not change that host from a preview deploy, and do not put a booking URL in schema or CTAs.

| Check | Where |
| --- | --- |
| Unique title and description | `src/content/seo.ts` |
| Canonical, Open Graph, Twitter | `src/components/Seo.tsx`, captured in `dist/<route>/index.html` |
| Organization + WebSite JSON-LD | Every marketing page |
| FAQPage | Home only, matching the visible questions |
| `sitemap.xml` + `robots.txt` | `public/`, sitemap refreshed at build |
| Staff `/login`, `/admin`, `/ops` | `noindex`; `/admin` and `/ops` serve `shell.html` |

Home includes an answer-first definition and eight questions (Founding 100, Vision 2030, family offices, FDI, chairperson, NED, Saudi Arabia, GCC). No review or rating schema.

Preferred GitHub Pages once enabled: https://mmm-2023.github.io/board-arabia/

## Stack

- Vite + React + TypeScript + Tailwind CSS v4
- Supabase project `iirqbizwanyhgkhanntq` (`applications` with `full_name`, `email`, `phone`, `fo_aum`, nullable `calendar_slot`; `staff_users`; `email_events`)
- Status values: `pending` | `accepted` | `rejected` (also allows legacy `verified` | `declined`)
- Email: Supabase Edge Functions + **Resend** (dry-run audit when `RESEND_API_KEY` is unset)
- On Accept, email the candidate a private booking link (server-side only). Never a public calendar CTA. `calendar_slot` may be set to `private_invite_emailed`.

## Local setup

```bash
cp .env.example .env
npm install
npm run dev
```

`.env.example` already contains the locked anon URL/key for local and preview builds.

## Visitor flow (no login)

1. **Landing** (`/`) — founding membership; English only; **no** public calendar CTA. Subpages explain members, capital, and partners.
2. **Apply** (`/apply`) — pre-vet form: name, email, phone (optional), turnover **or** FO AUM, LinkedIn URL, job titles, companies.
3. On submit → Edge Function **`submit-application`** (validated + rate-limited):
   - Inserts `applications.status = pending`
   - Acknowledgement email to applicant
   - Notify email to **michael@nammco.com** with **this** application summary + `/admin` link (no other applicants’ data)

Legacy `/book` and `/verify` redirect to `/apply`.

## Staff flow

1. **Login** (`/login`) — Supabase Auth email + password → redirects to `/admin`.
2. **Admin** (`/admin` or `/ops`) — only rows in `staff_users` can list applications.
3. **Accept** → Edge Function `decide-application` emails the candidate the private booking link only (no date picker, no Calendar API).
4. **Reject** → polite decline email to applicant.
5. **Sign out** on admin clears the session.

### Critical anti-leak

The public site must **never** show the booking URL. It is emailed only on Accept from `decide-application`.

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

Accept emails the private booking URL from the Edge Function only. **No Google Calendar API, Meet, or OAuth secrets.** Optional override: `PRIVATE_BOOKING_LINK`.

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
3. `/login` → `/admin` → **Accept** → candidate email contains the private booking URL (dry-run until `RESEND_API_KEY`).  
4. Public site has **no** calendar CTA.

## Deploy

- **Vercel:** https://board-arabia.vercel.app  
- **GitHub Pages:** `.github/workflows/pages.yml` when Pages source is GitHub Actions.

## Security checklist (Factory audit + PR2)

Evidence tags: **VERIFIED** = proved against live project / staging; **INFERRED** = from code + policies; **UNKNOWN** = needs Michael dashboard click.

| Area | Result | Evidence |
|------|--------|----------|
| RLS `applications` | **VERIFIED PASS** | Anon SELECT → `42501`; Factory: anon INSERT only; SELECT/UPDATE staff_users only |
| RLS `staff_users` | **VERIFIED PASS-ish** | select-own + claim-first insert (bootstrap residual) |
| RLS `email_events` | **VERIFIED PASS** | Staff select only |
| Dangerous ops RPCs | **VERIFIED PASS** | Factory revoked EXECUTE on `list_applications_ops` / `ops_code_ok` / `update_application_status_ops` + client access on `ops_config`; anon RPC call → not exposed |
| Auth gate `/admin` | **VERIFIED PASS** | Unauthed → `/login?next=/admin`; UI requires session; list needs `staff_users` |
| Accept/Reject | **VERIFIED PASS** | Edge `decide-application` JWT + `staff_users`; Accept emails private booking URL only; Reject decline only |
| No public booking CTA / PII | **VERIFIED PASS** | Client/dist grep: 0× `calendar.app.google`; apply form has no applicant list |
| Rate-limit + sanitize apply | **VERIFIED PASS** | `submit-application`: length caps, email/URL checks, 5/hr per email+IP via `apply_rate_limits` |
| Secrets hygiene | **INFERRED PASS** | Only public anon in repo/`.env.example`; Resend key is Edge secret only |
| Notify no cross-applicant leak | **INFERRED PASS** | Templates built from single row id only |
| Leaked-password protection (Auth) | **UNKNOWN / GAP** | Michael must enable in Supabase → Authentication → Providers → Email → **Leaked password protection** |
| Live Resend delivery | **GAP** | Needs `RESEND_API_KEY` (dry-run proved; Accept body contains booking URL) |
| `staff_users_claim_first` | **GAP** | Safe while Michael present; drop later if desired |
| Legacy `notify-application` | **GAP** | Prefer `submit-application` only |

App path does **not** call ops access-code RPCs. Decisions are Edge Function + JWT + `staff_users` only.

## Anti-jobs

No Stripe, no Lovable, no Arabic UI, no LinkedIn OAuth login, no DNS changes, no public calendar embed/CTA, no nammco branding on the site.
