# Board Arabia

Application-only site: **land → apply (pre-vet) → staff review**, with private Accept/Reject emails.

**Staging (GitHub Pages):** https://mmm-2023.github.io/board-arabia/

## Marketing pages

English only. No public calendar, no member names or photographs, no fee schedule.

| Route | Purpose |
| --- | --- |
| `/` | Home: hero, why, Founding 100 (50/50), member-tool tiles, how it works, partners, trust, final CTA |
| `/apply` | Pre-vet form. CTA language is “Apply for consideration”. |
| `/for-members` | All nine tools, including mandate inbox and deal rooms, plus a dashboard preview |
| `/for-capital` | How FDI, family offices, PE, and VC reach members — mandate inbox and deal rooms, admin-gated |
| `/partners` | Three annual Founding Ecosystem Partner seats, fifteen finance categories, interest via `mailto:partners@boardarabia.com` (not stored) |
| `/how-it-works` | Pre-vet → personal review (no fixed SLA) → Accept → private booking email → admit |
| `/about` | Short founding note |
| `/privacy`, `/terms` | What the site collects, and what the pages do not promise |

Primary CTA on every marketing page is **Apply for consideration** → `/apply`. Partner CTA is **Partner with us** (mailto draft). Staff `/login` and `/admin` are unchanged and are not linked from the marketing nav.

**Security:** marketing pages render no applicant PII. The private booking URL stays in the Accept email path only (`supabase/functions/decide-application`). Do not add it to client code.

## SEO and answer engines

`npm run build` prerenders each marketing route to static HTML (React server render, no browser), so the response is not an empty SPA shell. The host is GitHub Pages at base path `/board-arabia/` (`.github/workflows/pages.yml`). Canonicals stay `https://boardarabia.com` until that domain is cut over in DNS. Do not put a booking URL in schema or CTAs. `vercel.json` is not the deploy path.

| Check | Where |
| --- | --- |
| Unique title and description | `src/content/seo.ts` |
| Canonical, Open Graph, Twitter | `src/components/Seo.tsx`, captured in `dist/<route>/index.html` |
| Organization + WebSite JSON-LD | Every marketing page |
| FAQPage | Home and `/how-it-works`, matching the visible questions |
| `sitemap.xml` + `robots.txt` | `public/`, sitemap refreshed at build |
| Staff `/login`, `/admin`, `/ops` | `noindex`; `/admin` and `/ops` serve `shell.html` |

Home includes an answer-first definition and eight questions (Founding 100, Vision 2030, family offices, FDI, chairperson, NED, Saudi Arabia, GCC, international places, personal review). No review or rating schema.

Staging: https://mmm-2023.github.io/board-arabia/

## Stack

- Vite + React + TypeScript + Tailwind CSS v4
- Supabase project `iirqbizwanyhgkhanntq` (`applications`; `staff_users`; `members`; `profiles`; `email_events`)
- Application status: `pending` | `accepted` | `rejected` | `admitted` (also allows legacy `verified` | `declined`)
- Member role is `members` + `profiles`, not `staff_users`. Seats are `ksa` or `intl`, 50 each.
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
5. **Admit** (after Accept) → Edge Function `admit-member` creates the member login and emails a one-time sign-in link (or a temporary password if a link cannot be issued). Choose Saudi Arabia (`ksa`) or International (`intl`). This does not send the booking link again.
6. **Sign out** on admin clears the session.

## Member flow

1. Open the one-time link in the Admit email, or `/login?next=/dashboard` with the one-time code or the password you set.
2. **Dashboard** (`/dashboard`) — Home shows a founding-badge placeholder, your seat, and capacity toward 100. Profile edits your own row. Directory, Mandates, Intros, Rooms, and Events are empty shells.
3. Accounts are invite-only. A signed-in user who is not in `members` does not see the room. Staff `/login` with no `next` still goes to `/admin`.

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

Then open https://mmm-2023.github.io/board-arabia/login and sign in → `/admin`.

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
| `PUBLIC_SITE_URL` | Recommended | Admin link in notify. Default `https://mmm-2023.github.io/board-arabia` |

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

GitHub Pages is the host. Actions builds with `VITE_BASE_PATH=/board-arabia/` and publishes `dist`. Resend and other secrets stay in Supabase Edge Functions, not in the Pages workflow.

https://mmm-2023.github.io/board-arabia/

Pages must use **GitHub Actions** as the source (not the `main` branch files). Marketing URLs are real `index.html` files. `/login`, `/admin`, `/ops`, `/dashboard` (and its sections), and `/auth/confirm` ship the noindex app shell. Unknown paths use `404.html` with the same shell.

Proof build: `GITHUB_PAGES=true VITE_BASE_PATH=/board-arabia/ npm run build` writes `dist/dashboard/index.html` and fails if the artifact contains a public booking URL.

## Security checklist (Factory audit + PR2)

Evidence tags: **VERIFIED** = proved against live project / staging; **INFERRED** = from code + policies; **UNKNOWN** = needs a dashboard click; **SKIPPED BY MICHAEL** = declined, do not re-ask.

| Area | Result | Evidence |
|------|--------|----------|
| RLS `applications` | **VERIFIED PASS** | Anon SELECT → `42501`; Factory: anon INSERT only; SELECT/UPDATE staff_users only |
| RLS `staff_users` | **VERIFIED PASS-ish** | select-own + claim-first insert (bootstrap residual) |
| RLS `email_events` | **VERIFIED PASS** | Staff select only |
| Dangerous ops RPCs | **VERIFIED PASS** | Factory revoked EXECUTE on `list_applications_ops` / `ops_code_ok` / `update_application_status_ops` + client access on `ops_config`; anon RPC call → not exposed |
| Auth gate `/admin` | **VERIFIED PASS** | Unauthed → `/login?next=/admin`; UI requires session; list needs `staff_users` |
| Accept/Reject | **VERIFIED PASS** | Edge `decide-application` JWT + `staff_users`; Accept emails private booking URL only; Reject decline only. Admitted rows are refused so Accept is not sent again |
| RLS `members` / `profiles` | **VERIFIED PASS** | Own row only. Anon has no table grant. No client insert. `claim_founding_seat` is service_role only |
| Invite-only `/dashboard` | **VERIFIED PASS** | Signed-out redirects to `/login?next=/dashboard`. No `members` row → invitation required. No public signup form |
| No anon directory scrape | **VERIFIED PASS** | Directory shell does not query other members. Anon `select` on `members` and `profiles` is permission denied. `founding_capacity()` returns counts to a member or staff user only |
| `/dashboard` vs `/admin` | **VERIFIED PASS** | `/admin` still requires `staff_users`. `/dashboard` requires `members` and blocks `suspended`. Staff `/login` without `next` still resolves to `/admin` |
| Member invite secrets | **VERIFIED PASS** for storage; live send is Michael-owned | `email_events` for an Admit stores mode and seat only (no otp, token, or password keys). A dry-run link is returned only in the signed-in staff HTTP response. Dry-run is the Wave 1 path. Michael owns `RESEND_API_KEY` for live Accept, Reject, and Admit mail |
| No public booking CTA / PII | **VERIFIED PASS** | Client/dist grep: 0× `calendar.app.google`; apply form has no applicant list |
| Rate-limit + sanitize apply | **VERIFIED PASS** | `submit-application`: length caps, email/URL checks, 5/hr per email+IP via `apply_rate_limits` |
| Secrets hygiene | **INFERRED PASS** | Only public anon in repo/`.env.example`; Resend key is Edge secret only |
| Notify no cross-applicant leak | **INFERRED PASS** | Templates built from single row id only |
| Leaked-password protection (Auth) | **SKIPPED BY MICHAEL** | 22 Sep 2026, via Sasha. No Supabase Pro upgrade. Do not re-ask |
| Live Resend delivery | Dry-run OK for Wave 1 | Michael owns live Accept/Reject mail. Dry-run is proved while `RESEND_API_KEY` is unset |
| `staff_users_claim_first` | **GAP** | Safe while Michael present; drop later if desired |
| Legacy `notify-application` | **GAP** | Prefer `submit-application` only |

App path does **not** call ops access-code RPCs. Decisions are Edge Function + JWT + `staff_users` only.

## Anti-jobs

No Stripe, no Lovable, no Arabic UI, no LinkedIn OAuth login, no DNS changes, no public calendar embed/CTA, no nammco branding on the site.
