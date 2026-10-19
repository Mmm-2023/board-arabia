# MJ-3b-1 Public majlis request

Base: `main` at `2a81aac`. Branch: `cursor/mj-3b-1-public-majlis-3887`.
Migration: `supabase/migrations/20270104120000_public_majlis_request.sql`.
Not applied. No Edge deploy. No database push. No merge. No schedule. No send. The master switch stays off.

A free account is required. There is no account-free join token. The page reuses `register-candidate`, `verify-candidate`, and `public.submit_own_majlis_application`. It does not add a second intake.

## Surface

Marketing page. Job: request a place at a published virtual majlis.

Routes: `/majlis` and `/majlis/:eventId`. The public call to action is on `/for-members` in the Majlis section: "Request a place at a virtual majlis".

The list is `public.list_public_majlis()`. It returns published virtual rows that have not ended and are not cancelled. The body has a title, description, region, focus tags, time, and one word: Open, Few places left, or Full, join the waitlist. It does not return a Meet link, a count, a name, or an email.

## Intake

Signed out: the form calls `registerCandidate`. The reply is always "Thanks, we have your request." Then "Check your email. It has a code or a sign-in link." An existing account and a member account get that same reply. The member path is the existing sign-in letter, not a new intake.

After the email code, `verify-candidate` opens the session and `flushPublicMajlisDraft` calls `submit_own_majlis_application`.

Signed in: the same function stores the request. A non-candidate still gets the same ok reply and no row.

Phone is required and must use a country code. Saudi Arabia (`+966`) and the United Kingdom (`+44`) both pass. Company and role are required. LinkedIn and why attend are optional. The newsletter opt-in is not on the form. Mail about the request stays transactional. This change does not send it.

Honeypot field `company_fax`. Per-email and per-IP limits stay on `register-candidate`. The request function keeps the hourly limit per account. Turnstile runs only when `VITE_TURNSTILE_SITE_KEY` is set in the client and `TURNSTILE_SECRET_KEY` is set on the signup function. If the secret is absent, honeypot and the limits remain.

## LEGAL CHANGE

`src/content/legal/privacy.en.ts`, `src/content/legal/terms.en.ts`, and the notice in `src/pages/apply/RegisterScreen.tsx` match main verbatim. They are not hunks on this branch.

The request form in `src/pages/PublicMajlisPage.tsx` repeats that retention notice under a LEGAL CHANGE comment. Legal clears that sentence before merge.

## Locked files

No hunk in `scripts/public-nammco.mjs`, `scripts/prerender.mjs`, `scripts/check-pages-artifact.mjs`, `.github/workflows/pages.yml`, `src/content/legal/*`, `aiReportOperator.ts`, or the `/apply` route. The `/apply` line in `src/App.tsx` is unchanged.

## Apply

Apply `20270104120000_public_majlis_request.sql` only after `20270103120000_free_account_majlis.sql` and `20270102120000_majlis_virtual_meet.sql`. The operator applies it. Do not run `supabase db push`.

The new function is `public.list_public_majlis()`. `public.submit_own_majlis_application` is replaced in place: phone, company, and role required, virtual and still open only. Definer functions use `search_path = ''`. The applications table stays forced RLS and revoked from anon and authenticated. No staff write was added. No second factor. No cron.

## Edge

No new function. No Edge file changed. Do not redeploy from this change. The parent free-account change still needs `register-candidate` and `verify-candidate` redeployed after that change is applied. This page calls those existing functions.

## Env

- `TURNSTILE_SECRET_KEY` and `VITE_TURNSTILE_SITE_KEY`: set both or neither. The signup function checks the secret. The page shows the widget only when the site key is set.
- `CANDIDATE_CODE_PEPPER`: still required by the existing signup function.
- `VITE_LEGAL_CONTACT_EMAIL`: the only contact address on the page, read through `legalField('contactEmail')`. It is not stored in this change.
- Master switch (`email_settings.master_enabled`): leave off. This change does not read it and does not turn it on.

## Secrets

Grade: VERIFIED.

The diff was scanned for private keys, service-role keys, live Meet links, and mailbox literals outside example.com fixtures in the route test. No address, token, or project ref was added to the page, the migration, or this note.

## Shots

- `handoff/ba-mj-3b-1-public-majlis/public-majlis-1440.png`
- `handoff/ba-mj-3b-1-public-majlis/public-majlis-390.png`
- `handoff/ba-mj-3b-1-public-majlis/public-majlis-form-1440.png`
- `handoff/ba-mj-3b-1-public-majlis/public-majlis-form-390.png`
- `handoff/ba-mj-3b-1-public-majlis/public-majlis-thanks-1440.png`
- `handoff/ba-mj-3b-1-public-majlis/public-majlis-thanks-390.png`
- `handoff/ba-mj-3b-1-public-majlis/public-cta-destination-1440.png`

Route test: `scripts/public-majlis-request.test.ts`.

Shell: Board Arabia UX UI for the public request (trust before the form, same jobs on desktop and phone, empty, loading, and error states). No admin surface in this change, so the logged-in dashboard shell is unchanged apart from a link on the empty free-account Majlis state.
