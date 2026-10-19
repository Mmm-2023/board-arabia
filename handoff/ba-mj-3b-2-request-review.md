# MJ-3b-2 Staff review of majlis requests

Base: main. Branch: `cursor/mj-3b-2-staff-review-22c3`.
Migration: `supabase/migrations/20270106120000_majlis_request_review.sql`.
Slot `20270106120000` was free. The latest file on main before it is `20270105120000`. `20270104120000` is the public request page.
Not applied. No Edge deploy. No `supabase db push`. No merge. No schedule. No send.

Surface: admin. Job: review a majlis request and decide.

## What this adds

Staff open Majlis, then Requests (`/admin/majlis/requests`). The same Majlis destination stays in the desktop sidebar and on the phone tabs. Requests is a section next to Events, not a new primary tab. Phone tabs stay Home, Applications, People, Majlis, and More.

The list filters by event and by status. Each card shows company, role, LinkedIn, why attend, and phone from `form_snapshot`. The read is `public.staff_list_majlis_requests()`, a security definer with `search_path` empty, and it returns only after `private.is_staff()`. There is no new policy on `public.majlis_applications`. Hosts, attendees, partners, and anon do not get the form. The list does not return an email address.

Accept and Reject call the existing `public.review_majlis_application`. Each decision writes one row in `public.majlis_application_audits`: actor id, time, decision, request id. The table has no other columns. A full event stores waitlist. Only `accepted` holds a seat (`seat_held` stays on the existing trigger). Registered RSVPs plus other accepted requests count toward the cap. A virtual majlis still uses `private.majlis_virtual_member_cap` (148 when a host is set, 149 when not), so the 150 person rule from the virtual majlis migration stays. Accept raises `email_unverified` until `candidates.email_verified_at` is set. `auth.users.email_confirmed_at` is not read.

Accept and decline wording is editable and saved only as drafts in `public.majlis_request_mail_drafts`. `send_enabled` is constrained to false. The save function forces it false. The master switch is not read or written. Nothing is sent.

## Shots

- `handoff/ba-mj-3b-2-request-review/requests-1440.png`
- `handoff/ba-mj-3b-2-request-review/requests-390.png`
- `handoff/ba-mj-3b-2-request-review/requests-empty-1440.png`
- `handoff/ba-mj-3b-2-request-review/requests-empty-390.png`

Empty, loading, error, permission, and filtered-zero states are on the page. Loading uses the card skeleton. Mobile rows are cards. Safe area padding stays on the existing admin shell.

## Migration notes

Apply `20270106120000_majlis_request_review.sql` only, via MCP, after `20270105120000`.

Replaces `public.review_majlis_application(uuid, text)`.
Adds `public.staff_list_majlis_requests()`, `public.staff_majlis_request_drafts()`, and `public.staff_save_majlis_request_draft(text, text, text)`.
Adds `public.majlis_application_audits` and `public.majlis_request_mail_drafts`. Both force row level security and grant nothing to anon or authenticated.

## Functions to redeploy

None. No Edge function changed.

## Env

None. No new names.

## Secrets

Grade: VERIFIED.

The diff was scanned for private keys, service-role keys, live tokens, and mailbox literals outside `example.com` fixtures. None were added. The draft seed has no address.

## LEGAL CHANGE

None. No file under `src/content/legal/` changed.

## Locked hunks

None. These were not edited: `scripts/public-nammco.mjs`, `prerender.mjs`, `check-pages-artifact.mjs`, `.github/workflows/pages.yml`, `src/content/legal/*`, `aiReportOperator.ts`, the `/apply` route, the Sadu files, and mail-sending code.

## Definer audit

Anon execute allowlist is unchanged. The new functions are granted to `authenticated` only, and the bodies refuse anyone who is not staff. No `aal2` check was added.
