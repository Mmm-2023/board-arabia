# SM-2 Member board seats, applications, and the poster shortlist

Undrafted PR against main. Member posting, put yourself forward, and the poster shortlist. Matching nudges stay for SM-3.

## Secrets grade

VERIFIED. The diff has no live mailbox, API key, token, password, service-role key, project ref, or staff name. The only addresses are `example.com` values in `scripts/board-seats-sm2.test.ts`. `.env` is not in the commit.

## What landed

Migration `supabase/migrations/20261227120000_board_seats_member.sql`. It sorts after `20261226120000_home_partner_examples.sql` and after SM-1 `20261224120000_board_seats_notifications.sql`. The test does not treat this file as the newest migration. It is not applied.

Index `re_board_roles_posted_by_member_id_idx` on `public.re_board_roles (posted_by_member_id)` at line 9.

A member or partner posts a general seat with `submit_member_board_seat`. The row is `pending_review`, `posted_by_member_id` is the caller, and contact name, email, and phone stay null. `list_published_board_seats` returns only published, non-demo general seats. A pending seat is not in that list, and another member cannot open it.

`apply_to_board_seat` records a note of at most 400 characters with no `@` and no phone run. The poster shortlist (`list_my_board_seat_shortlist`) returns only people who put themselves forward for that seat. A partner poster also requires `private.caller_sees_member_card`, so the applicant must have Show my card to partners on and must not be hidden. A hidden member who did not apply never appears. The payload is name, headline, company, note, and status. It has no email, phone, or turnover.

`open_board_seat_introduction` writes an accepted `member_intros` row (`ask_desk` false) and marks the application `approved` with `decided_by_role` `poster`. The existing `list_accepted_intro_contacts` exchange then returns the other person's contact to each party.

The apply screen says the poster will see name, headline, company, and the note, and will not see email or phone. When the poster is a partner, it also says whether Show my card to partners is on.

Deals gains a Board seats section at `/dashboard/deals/board-seats`, with post at `/dashboard/deals/board-seats/new` and detail at `/dashboard/deals/board-seats/:seatId`. The list links to real estate board roles. Nothing is emailed. Nothing is scheduled.

## Apply order for the operator

Do not apply this from the app or from CI.

1. Migration `supabase/migrations/20261227120000_board_seats_member.sql` after `20261226120000_home_partner_examples.sql`.

No Edge deploy. No live setting change.

## Functions

Definer functions set `search_path` to empty. Each public function revokes from public and anon, then grants execute to authenticated. Private helpers are revoked from public, anon, and authenticated.

- `private.assert_board_seat_member` at `supabase/migrations/20261227120000_board_seats_member.sql:12`
- `private.prepare_member_board_seat` at `:42`
- `public.submit_member_board_seat` at `:140`
- `public.list_published_board_seats` at `:229`
- `public.get_board_seat` at `:274`
- `public.apply_to_board_seat` at `:349`
- `public.my_board_seat_applications` at `:415`
- `public.my_posted_board_seats` at `:453`
- `public.list_my_board_seat_shortlist` at `:501`
- `public.open_board_seat_introduction` at `:556`

No new table. RLS stays forced on `re_board_roles` and `re_board_role_intros`. There is no staff policy on the member shortlist. Staff applicant reads stay on the SM-1 function, which still calls `private.is_staff()` before `private.log_staff_access`.

## Locked nav hunk

`src/shell/destinations.ts` adds Board seats under Deals, after Real estate and before Deal rooms, and adds `/dashboard/deals/board-seats` to the remembered deals sections. The primary hubs stay Home, Deals, People, Majlis, AI tools. `scripts/shell-destinations.test.ts` and `scripts/section-tabs.test.ts` match that section list. `scripts/shell-manifest.mjs` adds the list and post shells, and keeps the seat id route on the 404 bounce.

Do-not-touch files were not edited: `scripts/public-nammco.mjs`, `prerender.mjs`, `check-pages-artifact.mjs`, `.github/workflows/pages.yml`, `src/content/legal/*`, `aiReportOperator.ts`, the `/apply` route, and WhoRunsTheDesk.

## Checks

`scripts/board-seats-sm2.test.ts` covers the migration order, the index, anon execute denied, a member company seat with no contact stored, a pending seat invisible to another member, publish, a shortlist of applicants only, a hidden non-applicant absent, a partner poster limited to an opted-in applicant, a payload with no email or phone, and an accepted intro whose contact exchange returns `example.com` addresses.

Screenshots, viewport 1440 and 390:

- List: `/opt/cursor/artifacts/sm2-list-1440.png` and `sm2-list-390.png`
- Put yourself forward: `/opt/cursor/artifacts/sm2-apply-1440.png` and `sm2-apply-390.png`
- Poster shortlist: `/opt/cursor/artifacts/sm2-shortlist-1440.png` and `sm2-shortlist-390.png`

## Not applied

This work did not apply the migration, did not run `supabase db push`, did not deploy Edge, did not merge, and did not change live settings. No email was sent.
