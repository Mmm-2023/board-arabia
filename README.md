# Board Arabia

Application-only site: **land → book → verify**, with a staff admin view.

Staging (GitHub Pages): https://mmm-2023.github.io/board-arabia/

## Stack

- Vite + React + TypeScript + Tailwind CSS v4
- Supabase project `iirqbizwanyhgkhanntq` (applications + staff_users; RLS already migrated)
- Google Calendar booking: https://calendar.app.google/a7RVc2v3mZ226Sd89

## Local setup

```bash
cp .env.example .env
npm install
npm run dev
```

`.env.example` already contains the locked anon URL/key for local and preview builds.

## Visitor flow

1. **Landing** (`/`) — prestige club feel; English only; no founding-member / sponsor wave.
2. **Book** (`/book`) — open Google Calendar; soft-hold `calendar_slot` via form text or query params (`calendar_slot`, `slot`, `start`, `date`, `time`, `event`).
3. **Verify** (`/verify`) — required turnover, companies, job titles; optional LinkedIn URL; inserts into `applications` as `pending`.
4. **Admin** (`/admin` or `/ops`) — Supabase email/password; only `staff_users` can SELECT/UPDATE status (`pending` → `verified` / `declined`).

## Promote Michael (or any staff) into `staff_users`

1. In Supabase Auth, create the user (email + password), e.g. Michael signs up / is invited.
2. In SQL Editor, after Auth signup:

```sql
-- Replace email if needed. user_id must match auth.users.id.
insert into public.staff_users (user_id, email)
select id, email
from auth.users
where email = 'michael@smemarketer.com'
on conflict (user_id) do update set email = excluded.email;
```

If `staff_users` is empty, the first authenticated user can also self-claim via the existing `staff_users_claim_first` RLS policy (one-time). Prefer the SQL insert above for explicit promotion.

Michael (`michael@smemarketer.com`) is already present in `staff_users` on the locked project.

## Prove book → form → admin

Click-path:

1. Open staging → **Book a conversation** → open calendar (optional) → enter a slot like `QA hold 22 Sep` → **Continue to verification**.
2. Fill turnover / companies / job titles → **Submit application**.
3. Open `/admin`, sign in as staff → confirm the new `pending` row → set **verified**.

Seed SQL (service role / SQL editor) if you need a row without the UI:

```sql
insert into public.applications (turnover, companies, job_titles, linkedin_url, calendar_slot, status)
values (
  'QA seed turnover',
  'Board Arabia seed co',
  'Chair',
  null,
  'QA hold seed',
  'pending'
);
```

## Deploy

GitHub Pages via `.github/workflows/pages.yml` (SPA fallback copies `index.html` → `404.html`). Base path: `/board-arabia/`.

Enable **Settings → Pages → Source: GitHub Actions** on the repo if not already.

## Anti-jobs

No Stripe, no Lovable, no Arabic UI, no LinkedIn OAuth login, no DNS changes in this PR.
