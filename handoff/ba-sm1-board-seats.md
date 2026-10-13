# SM-1 Board seats and in-app notifications

One undrafted PR against main. Data and the admin panel only. Member posting, the shortlist, and matching nudges stay for later.

## Secrets grade

VERIFIED. The diff has no live mailbox, API key, token, password, service-role key, project ref, or staff name. The only addresses are `name@example.com` and `noura.seat@example.com` in tests, smoke copy, and the admin form placeholder. `.env` is not in the commit.

## What landed

Migration `supabase/migrations/20261224120000_board_seats_notifications.sql`. It sorts after `20261219120000_operator_row_owner_lock.sql`. It is not applied.

`public.re_board_roles` gains general seats in place. New columns: `scope` (`real_estate` or `general`, default `real_estate`), `status` (`draft`, `pending_review`, `published`, `closed`), `sector_tags`, `regions`, `posted_by_member_id`. `seat_kind` also allows `company_board`, `ned`, and `adviser`. City, asset class, and company contact are required for real estate rows. City and asset class may be empty on a general seat. Company contact is required only when admin posts a `company_board` seat (`posted_by_member_id` is null). A published general seat needs at least one sector tag or region. Existing real estate rows stay `scope = real_estate` and keep `published` in step with `status`.

`public.re_board_role_intros` gains `note` (at most 400 characters, no `@`, no phone run) and `decided_by_role` (`admin` or `poster`). The existing `decided_by` uuid column stays.

`public.member_notifications` stores an in-app note: `kind` in `board_seat_match`, `board_seat_applicant`, `message`, `tracker_reminder`, plus `ref_id`, `title` (1 to 120), `body` (0 to 280), `created_at`, `read_at`. Inserts go through `private.raise_member_notification`. A member can select their own rows and update `read_at` only. There is no staff policy.

`public.member_notification_prefs` stores `board_seat_nudges`, default true. A missing row means nudges stay on. The member can read and write only their own row. There is no staff policy.

Staff RPCs, all behind `private.is_staff()` (aal2): `staff_create_board_seat`, `staff_edit_board_seat`, `staff_publish_board_seat`, `staff_close_board_seat`, `staff_list_board_seats`, `staff_list_board_seat_applicants`. The applicant read calls `private.log_staff_access` once per person, object type `board_seat_applicant`. The applicant payload is name, headline, company, note, and status. It has no email, phone, or turnover.

The real estate member feed and `request_re_board_role_intro` now keep `scope = real_estate`, so a general seat does not appear in the real estate list.

Home shows one unread line from `my_unread_notification`, with Mark read. Nothing is emailed. Nothing is scheduled.

## Apply order for the operator

Do not apply this from the app or from CI.

1. Migration `supabase/migrations/20261224120000_board_seats_notifications.sql` after `20261219120000_operator_row_owner_lock.sql`.

No Edge deploy. No live setting change.

## Tables

- `public.member_notifications` at `supabase/migrations/20261224120000_board_seats_notifications.sql:252`
- `public.member_notification_prefs` at `:336`
- `public.re_board_roles` altered at `:69`
- `public.re_board_role_intros` altered at `:231`

## Functions

Definer functions set `search_path` to empty.

- `private.board_seat_list_allowed` `:8`
- `private.board_seat_regions` `:33`
- `private.board_seat_has_phone` `:58`
- `private.re_board_roles_sync_status` `:195`
- `private.member_notifications_guard` `:282`
- `private.member_notification_prefs_guard` `:350`
- `private.raise_member_notification` `:393` (not granted to anon or authenticated)
- `private.prepare_general_seat` `:441`
- `private.board_seat_text_array` `:566`
- `private.re_member_board_role_feed` `:584` (real estate only)
- `private.re_staff_board_role_inventory` `:664` (real estate only)
- `public.request_re_board_role_intro` `:709` (real estate only)
- `public.staff_create_board_seat` `:768`
- `public.staff_edit_board_seat` `:865`
- `public.staff_publish_board_seat` `:950`
- `public.staff_close_board_seat` `:996`
- `public.staff_list_board_seats` `:1037`
- `public.staff_list_board_seat_applicants` `:1093`
- `public.my_unread_notification` `:1150` (invoker, so row security applies)

## Policies

No staff policy on either new table. Anon is revoked. Authenticated grants are per command.

- `member_notifications_select_own` `:318`
- `member_notifications_update_own` `:325` (column grant is `read_at` only, `:276`)
- `member_notification_prefs_select_own` `:372`
- `member_notification_prefs_insert_own` `:379`
- `member_notification_prefs_update_own` `:386`

RLS is enabled and forced on both new tables (`:272` and `:341`).

## Checks

`scripts/board-seats-sm1.test.ts` asserts the migration file exists and sorts after the named operator migration. It does not assume this file is the newest. Local Postgres covers: real estate row stays valid, staff aal1 cannot publish, anon has no select, the owner reads their own notification, another member and staff aal2 read zero notification rows, and each applicant read is logged. Existing `scripts/re-board-roles.test.ts` passed unchanged.

Screenshots, viewport 1440 and 390:

- Admin panel: `/opt/cursor/artifacts/sm1-admin-1440.png` and `sm1-admin-390.png`
- Member home line: `/opt/cursor/artifacts/sm1-member-1440.png` and `sm1-member-390.png`

## Not applied

This work did not apply the migration, did not run `supabase db push`, did not deploy Edge, did not merge, and did not change live settings. No email was sent.
