# Board Arabia — Wave 1 handoff

Date: 22 Sep 2026
PR: https://github.com/Mmm-2023/board-arabia/pull/4
Branch: `feat/wave1-member-dashboard` → `main`
Host: GitHub Pages `https://mmm-2023.github.io/board-arabia/` (base `/board-arabia/`). Not Vercel.
Supabase project: `iirqbizwanyhgkhanntq`

## What shipped

Invite-only member dashboard, separate from `staff_users`.

- Tables `members` and `profiles`, RLS, column grants, `claim_founding_seat` (service role only), `founding_capacity` (security invoker; counts live in `private.founding_counts`).
- Admin Admit on accepted or verified applications. Seat `ksa` or `intl`, 50 each. Edge function `admit-member` issues an invite or magic link. Temporary password is only a fallback. Confirm URL uses `/auth/confirm?token_hash=`.
- `/dashboard` Home: badge placeholder, seat, founding capacity, empty next majlis. Profile edits the signed-in row. Directory, Mandates, Intros, Rooms, and Events are empty shells and do not list other members.
- Staff `/login` with no `next` still opens `/admin`. Accept and Reject stay on `decide-application` and still email only the private booking link. An admitted application returns 409.

This branch is not a Pages deploy trigger. After merge to `main`, the shell is at `https://mmm-2023.github.io/board-arabia/dashboard`.

## Pages-compatible proof

`GITHUB_PAGES=true VITE_BASE_PATH=/board-arabia/ npm run build`

- `dist/dashboard/index.html`, `dist/dashboard/profile/index.html`, `dist/auth/confirm/index.html` are noindex shells with base `/board-arabia/`
- `dist/robots.txt` disallows `/board-arabia/dashboard` and `/board-arabia/auth`
- Built HTML, JS, CSS, and text contain neither a public booking host nor nammco branding

## Admit → member login

1. Staff Accept still sends only the private booking link. Live Accept on an already admitted row returned 409 with no booking URL in the JSON (`decide-application` version 5).
2. Staff Admit calls `admit-member` (`verify_jwt` true). Dry-run (Resend unset) returns the one-time link only in the staff HTTP response.
3. `email_events` for that Admit stored mode and seat only. No otp, token, or password keys.
4. Browser: `/login?next=/dashboard` is the member gate. Home showed seat, placeholder badge, and capacity. Directory was empty. Profile save stuck. A member token calling Admit returned 403. A profiles select returned only that member’s row. Staff `/login` still reached `/admin`. A member opening `/admin` saw Not authorized.
5. Proof auth users, the proof application, and the proof invite event were deleted. `members` and `profiles` counts returned to 0.

## SECURITY checklist

Evidence: **VERIFIED** = proved against the live project or the Pages-compatible build; **INFERRED** = from code and policies; **SKIPPED BY MICHAEL** = declined, do not re-ask.

| Check | Result |
| --- | --- |
| RLS on member tables | **VERIFIED.** Anon select on `members` and `profiles` is permission denied (`42501`). A signed-in member sees only their own row. `claim_founding_seat` with full arguments is `42501` for anon. |
| Invite-only | **VERIFIED** in the app. No public signup form. Signed-out `/dashboard` redirects to member login. No `members` row shows invitation required. Suspended is blocked. Authorization does not use `user_metadata`. The Auth “disable signup” project switch was not queried. |
| No anon directory scrape | **VERIFIED.** Anon cannot select `members` or `profiles`. Directory does not query other members. Schema `private` is not API-exposed (`PGRST106`). `founding_capacity()` returns counts only to a member or staff user. |
| Secrets hygiene | **VERIFIED** for the repo and for `email_events`. No service role or Resend key in the client. Invite payload has no token. |
| `/dashboard` vs `/admin` | **VERIFIED.** Staff login without `next` opens `/admin`. `/admin` still requires `staff_users`. `/dashboard` requires a non-suspended `members` row. A member cannot call Admit (403). |
| Leaked-password protection | **SKIPPED BY MICHAEL** (via Sasha, 22 Sep 2026). No Supabase Pro upgrade. Do not re-ask. |
| Live Resend (Accept / Reject / Admit) | Michael-owned. Dry-run is OK for Wave 1 while `RESEND_API_KEY` is unset. |

## Left with Michael

- Set `RESEND_API_KEY` on the Supabase Edge Function when live Accept, Reject, and Admit mail should send. Dry-run is the Wave 1 path until then.
- Merge PR #4 to `main` when Pages should publish `/dashboard`.

Out of scope: full Directory and Mandates, sponsors, Stripe, Lovable, DNS, leaked-password protection.
