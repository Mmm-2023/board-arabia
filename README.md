# Board Arabia

Application-only site: **land → apply (pre-vet) → staff review**, with private Accept/Reject emails.

**Site (GitHub Pages, custom domain):** https://boardarabia.com/

## Marketing pages

English only. No public calendar, no member names or photographs, no fee schedule.

| Route | Purpose |
| --- | --- |
| `/` | Home: hero, platform totals, why, Founding 100 (50/50), member-tool tiles, how it works, partners, trust, final CTA |
| `/apply` | Pre-vet form. CTA language is “Apply for consideration”. |
| `/for-members` | All nine tools, including mandate inbox and deal rooms, plus a dashboard preview |
| `/for-capital` | How FDI, family offices, PE, and VC reach members: mandate inbox and deal rooms, admin-gated |
| `/partners` | Three annual Founding Ecosystem Partner seats, fifteen finance categories, interest via `mailto:partners@boardarabia.com` (not stored) |
| `/how-it-works` | Pre-vet → personal review (no fixed SLA) → Accept → private booking email → admit |
| `/about` | Short founding note |
| `/privacy`, `/terms` | What the site collects, and what the pages do not promise |

Primary CTA on every marketing page is **Apply for consideration** → `/apply`. Partner CTA is **Partner with us** (mailto draft). The shared nav and footer include **Log in** → `/login?next=/dashboard` (member path). There is no public signup. Staff still open `/login`, which defaults to `/admin`.

**Security:** marketing pages render no applicant PII. The private booking URL stays in the Accept email path only (`supabase/functions/decide-application`). Do not add it to client code.

## SEO and answer engines

`npm run build` prerenders each marketing route to static HTML (React server render, no browser), so the response is not an empty SPA shell. GitHub Pages serves the custom domain at the root (`base` `/`, `public/CNAME`). Apex A records and the www CNAME are applied separately in GoDaddy. Do not put a booking URL in schema or CTAs. `vercel.json` is not the deploy path.

| Check | Where |
| --- | --- |
| Unique title and description | `src/content/seo.ts` |
| Canonical, Open Graph, Twitter | `src/components/Seo.tsx`, captured in `dist/<route>/index.html` |
| Organization + WebSite JSON-LD | Every marketing page |
| FAQPage | Home and `/how-it-works`, matching the visible questions |
| `sitemap.xml` + `robots.txt` | `public/`, sitemap refreshed at build |
| Staff `/login`, `/admin`, `/ops` | `noindex`; `/admin` and `/ops` serve `shell.html` |

Home includes an answer-first definition and eight questions (Founding 100, Vision 2030, family offices, FDI, chairperson, NED, Saudi Arabia, GCC, international places, personal review). No review or rating schema.

Site: https://boardarabia.com/

## Stack

- Vite + React + TypeScript + Tailwind CSS v4
- Supabase project `iirqbizwanyhgkhanntq` (`applications`; `staff_users`; `members`; `profiles`; `member_invites`; `email_events`)
- Application status: `pending` | `accepted` | `rejected` | `admitted` (also allows legacy `verified` | `declined`)
- Member role is `members` + `profiles`, not `staff_users`. Seats are `ksa` or `intl`, 50 each.
- Email: Supabase Edge Functions call the **Gmail API**. From is `cindy@nammco.com`. Reply-To is `cindy@nammco.com`. `noreply@boardarabia.com` is parked until later. Dry-run audit when Workspace credentials are unset. No Resend.
- On Accept, email the candidate a private booking link (server-side only). Never a public calendar CTA. `calendar_slot` may be set to `private_invite_emailed`.

## Local setup

```bash
cp .env.example .env
npm install
npm run dev
```

`.env.example` already contains the locked anon URL/key for local and preview builds.

## Visitor flow (no login)

1. **Landing** (`/`). Founding membership; English only; **no** public calendar CTA. Subpages explain members, capital, and partners.
2. **Apply** (`/apply`). Pre-vet form: name, email, phone (optional), turnover **or** FO AUM, optional investable capacity in USD, a public-totals checkbox (on by default), LinkedIn URL, job titles, companies. `/apply?invite=<token>` shows who invited them (read-only) and asks why. A bad or expired token still allows a normal request.
3. On submit → Edge Function **`submit-application`** (validated + rate-limited):
   - Inserts `applications.status = pending`
   - Acknowledgement email to applicant
   - Notify email to **michael@nammco.com** with **this** application summary + `/admin` link (no other applicants’ data)

Legacy `/book` and `/verify` redirect to `/apply`.

## Staff flow

1. **Staff login:** https://boardarabia.com/login → `/admin` when the account is in `staff_users`.
2. **Admin** (`/admin` or `/ops`). Staff can list applications, members, founding capacity, email events (kind, recipient, subject, status, time), and staff emails. Accept, Reject, and Admit stay on the application row.
3. **Accept** → Edge Function `decide-application` emails the candidate the private booking link only (no date picker, no Calendar API).
4. **Reject** → polite decline email to applicant.
5. **Admit** (after Accept) → Edge Function `admit-member` creates the member login and emails a one-time sign-in link (or a temporary password if a link cannot be issued). Choose Saudi Arabia (`ksa`) or International (`intl`). This does not send the booking link again.
6. **Invite / promote Michael** → Edge Function `invite-master` (staff JWT). Creates or invites the auth user, upserts `staff_users.role = master`, and by default admits a Saudi Arabia founding seat (a minimal accepted application is created server-side when none exists). The same screen has **Direct invite** for another email, seat, and optional founding admission.
7. **Suspend / Restore** → Edge Function `set-member-status`. This screen does not demote staff. `michael@nammco.com` and the last master cannot be demoted or deleted.
8. **Sign out** on admin clears the session.

`michael@nammco.com` is the intended master (staff admin and, when admitted, member dashboard). `michael@smemarketer.com` may remain staff. A person can hold both `staff_users` and `members`.

## Member flow

1. **Member login:** https://boardarabia.com/login?next=/dashboard
2. Open the one-time link from Admit or Direct invite, or use the one-time code or the password you set.
3. **Dashboard** (`/dashboard`). Home shows a founding-badge placeholder, your seat, capacity toward 100, and invites remaining. **Invites** (`/dashboard/invites`) sends the two peer invites by email or WhatsApp. Profile edits your own row. Directory, Mandates, Intros, Rooms, and Events are empty shells. Staff who are also members see a Staff admin link.
4. **Peer invites.** Admit grants exactly 2 (`invites_remaining`). Each send uses one. Unused invites do not refill. Email uses Edge `send-member-invite` and Workspace mail. WhatsApp returns a `wa.me` link with the apply URL. The invitee is still reviewed.
5. Accounts are invite-only. A signed-in user who is not in `members` does not see the room. Staff `/login` with no `next` still goes to `/admin`.

### Critical anti-leak

The public site must **never** show the booking URL. It is emailed only on Accept from `decide-application`.

## Michael: master staff and member access

`michael@nammco.com` is the intended master. There may be no auth user yet. An existing staff account (`michael@smemarketer.com` or the QA staff user) signs in at https://boardarabia.com/login, opens `/admin`, and uses **Invite / promote Michael**. That promotes `michael@nammco.com` to master staff and admits the Saudi Arabia founding seat.

`michael@smemarketer.com` may remain staff. Do not delete that row from this screen.

**After the one-time link is used and a password is set:**

- Staff: https://boardarabia.com/login → `/admin`
- Member: https://boardarabia.com/login?next=/dashboard

**One-time password (pick one):**

1. **Forgot password? on the site (simplest)**  
   Open https://boardarabia.com/login (staff) or https://boardarabia.com/login?next=/dashboard (members), enter the email, and choose **Forgot password?**. That calls `resetPasswordForEmail` with `redirectTo` `https://boardarabia.com/auth/confirm`. `/auth/confirm` and `/auth/reset` read `token_hash` plus `type=recovery` from the query string, and `access_token` from the URL hash. They also listen for `PASSWORD_RECOVERY`. Set the new password, confirm it, and you return to `/login`. Staff who are in `staff_users` then continue to `/admin`.

2. **Dashboard reset**  
   Supabase → Authentication → Users → the person → *Send password recovery*. The redirect URL must be `https://boardarabia.com/auth/confirm` (allow that URL, and `https://boardarabia.com/auth/reset`, in Authentication → URL configuration). Both routes accept `recovery` and `signup` as well as invite, magic link, and email, from the query string or the hash.

3. **Invite link**  
   Authentication → Users → Invite user (same email) → open invite email → set password.

4. **Magic / recovery link (SQL / Auth API)**  
   Authentication → Users → generate recovery link with redirect `https://boardarabia.com/auth/confirm` → open once and set password.

Then open https://boardarabia.com/login and sign in. Staff land on `/admin`. Members use https://boardarabia.com/login?next=/dashboard.

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

### Email (Google Workspace, Gmail API)

Outbound product mail (apply acknowledgement, staff notify, Accept, Reject, Admit, master invite, and password reset) is sent by the Edge Function directly to the Gmail API. There is no Resend key and no Vercel send path.

| Header | Value |
|--------|--------|
| From | `"Board Arabia" <cindy@nammco.com>` |
| Reply-To | `cindy@nammco.com` |

Cindy watches `cindy@nammco.com`. The Gmail API call uses her Workspace mailbox (`users/me`), and the visible From is `cindy@nammco.com`. `noreply@boardarabia.com` is parked until later. An applicant reply arrives in her inbox because Reply-To is her address. She routes a decision to Michael. Accept and Reject are not automatic. Staff press those buttons in `/admin`.

Apply acknowledgement, Accept, Reject, Admit, and any password reset sent by an Edge Function use that From and Reply-To, and close with a Board Arabia footer only. The body does not include the nammco marketing banner, the nammco tagline, or the nammco signature block (job title, nammco.com, the LinkedIn block, or the Kingdom Centre banner). No images. An empty body, or a footer with no letter, is refused. If a body contains those markers, or it is missing the Board Arabia footer, the send is refused and logged as an error. It is not mailed. An applicant address at that same domain can still appear in the staff notice. The Gmail composer signature is not inserted, because the Edge Function uploads the raw message. Do not turn on a Workspace footer that appends that banner to mail sent by the API. Her normal Gmail signature can stay for mail she types herself.

Do not send applicant mail from `michael@`. The new-application notice is still addressed to `michael@nammco.com`, and it is sent from `cindy@nammco.com` with Reply-To `cindy@nammco.com`. Do not ask for a Resend key.

Preferred path: OAuth refresh token for the Workspace user `cindy@nammco.com`.

| Secret | Required | Purpose |
|--------|----------|---------|
| `GMAIL_CLIENT_ID` | Yes for live email | Google Cloud OAuth client |
| `GMAIL_CLIENT_SECRET` | Yes for live email | OAuth client secret |
| `GMAIL_REFRESH_TOKEN` | Yes for live email | Refresh token from a consent as `cindy@nammco.com`, scope `https://www.googleapis.com/auth/gmail.send` |
| `GMAIL_FROM` | Optional | Defaults to `"Board Arabia" <cindy@nammco.com>`. A `noreply@boardarabia.com` value is ignored while that address is parked. |
| `PUBLIC_SITE_URL` | Optional | Defaults to `https://boardarabia.com` |

Alternative, if domain-wide delegation is already approved: set `GMAIL_SERVICE_ACCOUNT_JSON` (the JSON key) and `GMAIL_IMPERSONATE=cindy@nammco.com`. The service account needs the Gmail send scope delegated in Workspace admin. Refresh-token credentials win when both are set.

Accept still emails the private booking URL from `decide-application` only. Optional override: `PRIVATE_BOOKING_LINK`. Do not put that URL on a public page.

When the Gmail secrets are missing, or Gmail rejects the token (auth failure), every send is a dry-run (`email_events.status = dry_run`, provider `gmail`). No message leaves Workspace. Other Gmail errors stay `error` and are logged without tokens.

```sql
select created_at, kind, recipient, subject, status
from public.email_events
order by created_at desc
limit 20;
```

Payload columns are not granted to the staff client. The admin list never selects tokens, passwords, or one-time codes.

### Workspace mail click-path

1. In Google Cloud, enable the Gmail API and create an OAuth client.
2. Consent once as `cindy@nammco.com` with scope `https://www.googleapis.com/auth/gmail.send` and copy the refresh token.
3. Supabase → Project Settings → Edge Functions → Secrets: paste `GMAIL_CLIENT_ID`, `GMAIL_CLIENT_SECRET`, and `GMAIL_REFRESH_TOKEN`.
4. Deploy the Edge Functions (`submit-application`, `notify-application`, `decide-application`, `admit-member`, `send-member-invite`, `invite-master`, `set-member-status`, `request-password-reset`). `send-member-invite` keeps JWT verification on.
5. Apply `supabase/migrations/20260922190000_staff_master_admin_read.sql` if it is not already on project `iirqbizwanyhgkhanntq`, then `supabase/migrations/20260922201000_member_invite_wallet.sql` (invite wallet, `member_invites`, apply attribution, anon lookup RPC). Do not seed members.

### Dry-run invite (Workspace credentials not set)

1. Staff signs in at https://boardarabia.com/login and opens `/admin`.
2. Use **Invite / promote Michael**, **Direct invite**, or **Admit**.
3. The dry-run box on that page shows the one-time link, one-time code, or temporary password. That material is returned only in the staff HTTP response. It is not written into `email_events`.
4. Open the link once, or sign in with the code at the login URL in the box. Staff destination is https://boardarabia.com/login. Member destination is https://boardarabia.com/login?next=/dashboard.
5. Hand the link to Michael through a channel you trust. Do not paste it into a shared chat if you can avoid it.
6. After a password is set, use the staff and member URLs above. When Gmail secrets are present, the same actions email from `cindy@nammco.com` with Reply-To `cindy@nammco.com`, and the admin response does not include the secret.

Local proof of the Accept path, without a live mailbox: `node --experimental-strip-types --test scripts/gmail-mail.test.ts scripts/peer-invite.test.ts`. The first checks From is `cindy@nammco.com`, Reply-To is `cindy@nammco.com`, that the message does not use Resend, and that a configured client posts to `https://gmail.googleapis.com/gmail/v1/users/me/messages/send`. The second checks the peer invite letter and the WhatsApp link. A real send still needs the three Gmail secrets on the Edge Function.

## Prove apply → emails → Accept

1. Staging → **Apply for review** → submit.  
2. Confirm ack + `michael@nammco.com` notify (or dry-run rows).  
3. https://boardarabia.com/login → `/admin` → **Accept** → candidate email contains the private booking URL (dry-run until Gmail secrets are set).  
4. Public site has **no** calendar CTA.

## Deploy

GitHub Pages is the host. Actions builds with `VITE_BASE_PATH=/` and publishes `dist`, including `CNAME` (`boardarabia.com`), so the project site is served at the domain root. DNS for the apex (A) and www (CNAME) is configured in GoDaddy, not in this repo. Gmail credentials and other secrets stay in Supabase Edge Functions, not in the Pages workflow.

https://boardarabia.com/

The previous project URL `https://mmm-2023.github.io/board-arabia/` redirects to the apex after the custom domain is active. In-app routes stay root paths (`/apply`, `/login`, `/dashboard`). React Router `basename` follows Vite `BASE_URL`.

Pages must use **GitHub Actions** as the source (not the `main` branch files). Marketing URLs are real `index.html` files. `/login`, `/admin`, `/ops`, `/dashboard` (and its sections), and `/auth/confirm` ship the noindex app shell. Unknown paths use `404.html` with the same shell.

Proof build: `VITE_BASE_PATH=/ npm run build` writes `dist/CNAME`, `dist/dashboard/index.html`, and root `/assets/` URLs, and fails if the artifact contains a public booking URL.

## Public platform totals

The home page reads one aggregate row, `platform_stats`. It does not read members, profiles, or applications. Money figures stay null until five verified, opted-in admitted members contribute to that metric. Five to nine contributors round to the nearest $5m. Ten or more round to the nearest $1m. Seat counts can show earlier, including zero. The page does not invent a dollar total.

Apply this on Supabase project `iirqbizwanyhgkhanntq` before the new Edge Function code is deployed. Supabase Dashboard → SQL Editor → paste and run:

`supabase/migrations/20260922200000_platform_stats.sql`

Then deploy `submit-application` and `admit-member`. Admit, a later capacity save, a profile opt-out, and suspend or restore all recompute the row. Anon can select `platform_stats` only.

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
| Peer invite wallet | **INFERRED** until the migration is on the live project | `member_invites` has no anon grant. Lookup is `lookup_member_invite(token)` and returns a label only. `issue_member_invite` and `release_member_invite` are service_role only. Wallet updates cannot raise `invites_remaining` without the release flag |
| `/dashboard` vs `/admin` | **VERIFIED PASS** | `/admin` still requires `staff_users`. `/dashboard` requires `members` and blocks `suspended`. Staff `/login` without `next` still resolves to `/admin` |
| Member invite secrets | **VERIFIED PASS** for storage; live send needs Workspace secrets | `email_events` stores mode and seat flags only (no otp, token, or password keys). A dry-run link is returned only in the signed-in staff HTTP response. Live mail is the Gmail API from `cindy@nammco.com` with Reply-To `cindy@nammco.com` once `GMAIL_CLIENT_ID`, `GMAIL_CLIENT_SECRET`, and `GMAIL_REFRESH_TOKEN` are set on the Edge Function |
| No public booking CTA / PII | **VERIFIED PASS** | Client/dist grep: 0× `calendar.app.google`; apply form has no applicant list |
| RLS `platform_stats` | **INFERRED** until the migration is applied on `iirqbizwanyhgkhanntq` | Anon and authenticated get SELECT only. No insert, update, or delete grant. Money columns are written already rounded, or null when fewer than 5 contributors. Exact sums are not stored |
| RLS members / applications / invites | **INFERRED** for this wave | No new anon SELECT on `members`, `profiles`, or `applications`. Profile capacity columns are granted to `authenticated` and limited by own-row or staff policies |
| Rate-limit + sanitize apply | **VERIFIED PASS** | `submit-application`: length caps, email/URL checks, 5/hr per email+IP via `apply_rate_limits` |
| Secrets hygiene | **INFERRED PASS** | Only public anon in repo/`.env.example`; Gmail client secret, refresh token, or service-account JSON stay in Edge secrets |
| Notify no cross-applicant leak | **INFERRED PASS** | Templates built from single row id only |
| Leaked-password protection (Auth) | **SKIPPED BY MICHAEL** | 22 Sep 2026, via Sasha. No Supabase Pro upgrade. Do not re-ask |
| Live Workspace delivery | Dry-run until Gmail secrets exist | Edge calls `gmail.googleapis.com` users.messages.send. From `cindy@nammco.com`. Reply-To `cindy@nammco.com`. `noreply@boardarabia.com` is parked until later. Dry-run while `GMAIL_REFRESH_TOKEN` (or the service-account JSON) is unset |
| `staff_users_claim_first` | **GAP** | Safe while Michael present; drop later if desired |
| Legacy `notify-application` | **GAP** | Prefer `submit-application` only |

App path does **not** call ops access-code RPCs. Decisions are Edge Function + JWT + `staff_users` only.

## Anti-jobs

No Stripe, no Lovable, no Arabic UI, no LinkedIn OAuth login, no DNS changes, no public calendar embed/CTA, no nammco branding on the site.
