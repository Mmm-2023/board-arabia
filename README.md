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

Preferred GitHub Pages once enabled: https://mmm-2023.github.io/board-arabia/

## Stack

- Vite + React + TypeScript + Tailwind CSS v4
- Supabase project `iirqbizwanyhgkhanntq` (`applications`, `staff_users`, `email_events`)
- Email: Supabase Edge Functions + **Resend** (dry-run audit when `RESEND_API_KEY` is unset)
- Private booking link is emailed **only on Accept** — never shown on the public site

## Local setup

```bash
cp .env.example .env
npm install
npm run dev
```

`.env.example` already contains the locked anon URL/key for local and preview builds.

## Visitor flow (no login)

1. **Landing** (`/`) — founding membership; English only; **no** public calendar CTA. Subpages explain members, capital, and partners.
2. **Apply** (`/apply`) — pre-vet form: name, email, phone (optional), turnover **or** FO AUM, LinkedIn URL, job titles, companies → `applications.status = pending`.
3. On submit → Edge Function `notify-application`:
   - Acknowledgement email to applicant
   - Notify email to **michael@nammco.com** with summary + `/admin` link

Legacy `/book` and `/verify` redirect to `/apply`.

## Staff flow

1. **Login** (`/login`) — Supabase Auth email + password → redirects to `/admin`.
2. **Admin** (`/admin` or `/ops`) — only rows in `staff_users` can list applications.
3. **Accept** → Edge Function `decide-application` emails the candidate a **private** booking link (server-side only). No admin date picker. No Google Calendar API.
4. **Reject** → polite decline email to applicant.
5. **Sign out** on admin clears the session.

### Critical anti-leak

The calendar booking URL must **never** appear in marketing pages, nav, footer, or client bundles. It lives only in the Accept email path (`supabase/functions/decide-application`).

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

Set these in **Supabase → Project Settings → Edge Functions → Secrets** (or CLI `supabase secrets set`):

| Secret | Required | Purpose |
|--------|----------|---------|
| `RESEND_API_KEY` | **Yes for live email** | Send ack / notify / accept / reject via Resend |
| `RESEND_FROM` | Recommended | Verified sender, e.g. `Board Arabia <hello@yourdomain.com>`. Default falls back to Resend onboarding sender (test only). |
| `PUBLIC_SITE_URL` | Recommended | Used in admin notify link. Default `https://board-arabia.vercel.app` |
| `PRIVATE_BOOKING_LINK` | Optional override | Accept-email booking URL. Defaults to Michael’s private calendar Appointment schedule (server-side only). |

Without `RESEND_API_KEY`, functions still succeed in **dry-run**: rows are written to `public.email_events` so you can prove the path in SQL.

```sql
select created_at, kind, recipient, subject, status, detail
from public.email_events
order by created_at desc
limit 20;
```

**Not required (removed from scope):** Google Calendar OAuth / service account / Meet API.

### Resend setup click-path

1. Create a Resend account → API key.  
2. Add + verify a sending domain (or use onboarding sender for sandbox tests to your own inbox).  
3. Paste key into Supabase Edge Function secrets as `RESEND_API_KEY`.  
4. Redeploy functions if secrets were added after first deploy (usually not needed).

## Prove apply → emails → Accept

1. Staging → **Apply for review** → submit a real email you control.  
2. Confirm applicant ack + `michael@nammco.com` notify (or `email_events` dry-run rows).  
3. `/login` as staff → `/admin` → **Accept** → candidate receives private booking link email (not visible on site).  
4. Confirm the public site has **no** calendar CTA: grep/`/apply` only.

## Deploy

- **Vercel:** production alias https://board-arabia.vercel.app (auto from GitHub).  
- **GitHub Pages:** `.github/workflows/pages.yml` (SPA fallback `404.html`). Enable **Settings → Pages → Source: GitHub Actions** if not already.

## Anti-jobs

No Stripe, no Lovable, no Arabic UI, no LinkedIn OAuth login, no DNS changes, no public calendar embed/CTA, no Google Calendar API event creation, no nammco branding on the site.
