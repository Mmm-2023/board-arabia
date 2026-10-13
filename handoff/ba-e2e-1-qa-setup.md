# E2E-1 QA member and example deal room

Staff-run SQL and docs. No migration. No Edge deploy. No mail. The operator creates the auth user by hand and runs `supabase/qa/qa-fixture.sql` with psql. Never point it at a real member.

Base at branch time: `4ab896a` (later than `7c3f0ad`). Latest migration on this branch is `supabase/migrations/20261213120000_rls_initplan_select_auth_uid.sql`. This change does not add a migration. The next free slot after that file is unused.

Secrets grade: VERIFIED. The diff has no live inbox, API key, token, sign-in secret, service-role key, project ref, or staff name. The only address is `qa@example.com`. The placeholder user id is all zeros and the script refuses to run until the operator replaces it locally.

## What the script writes

| Row | Flag | Id |
| --- | --- | --- |
| Member, seat `intl`, tier `member`, status `active` | `members.is_demo = true`, directory hidden, digest preference off, invite remaining 0 | the operator's auth user |
| Profile `QA Member (Example)`, `Example Co`, aggregates off | follows the member flag | same user |
| Room `QA test room (Example)`, status `open`, opened by the member | `rooms.is_demo = true` | `c0ffee00-0000-4000-8000-0000000000a1` |
| Owner participant, invite accepted | room must stay a sample | `c0ffee00-0000-4000-8000-0000000000a3` |
| Document `Example document.pdf` | written only when the storage object already exists | `c0ffee00-0000-4000-8000-0000000000a2` |

Seat `intl` is a non-partner seat and is not the home region. Tier `member` does not take a founding number (`private.sync_member_tiers` clears it when founding is absent, `supabase/migrations/20261115120000_member_tiers.sql:115`). The partner seat is not used.

A second run updates only rows that are already samples. A member or room with `is_demo = false` raises (`supabase/qa/qa-fixture.sql:46` and `:64`). The placeholder guard is `:33`.

The document row is not written from a missing file. The script prints `deal-room-documents/<room id>/<document id>/source` and continues (`supabase/qa/qa-fixture.sql:248`). Page count is 1 because the script does not open the file. An upload through the app uses a new document id, so it does not fill this fixed row.

The commented teardown deletes only those fixed ids, and only while `is_demo` is still true. It does not delete the auth user or the storage object.

## Room list leak

Checked. The leak is real for an admin sample room, and it does not apply to this fixture. No list-filter migration.

`public.list_member_rooms` counts and returns open rooms with `opened_by = 'admin'` (`supabase/migrations/20261002120000_member_deal_rooms.sql:793` and `:814`). Demo rows in that set are shown only while real admin rooms are below the rooms threshold (`:815`, via `private.demo_rows_visible`).

This fixture sets `opened_by` to `member` and sets the owner (`supabase/qa/qa-fixture.sql:165`). An admin room cannot also have an owner (`supabase/migrations/20261002120000_member_deal_rooms.sql:77`). So the QA room is outside the sample list.

`public.list_my_deal_rooms` returns a room only when the caller is an invited or accepted participant (`supabase/migrations/20261007120000_member_deal_room_reads.sql:56`). The QA member is the owner. Another member is not.

`public.list_all_deal_rooms` is staff-only and returns every room (`supabase/migrations/20261209140000_deal_room_documents.sql:1151`). It does not include `is_demo` in the payload (`:1174`). Admin sees the room by the name `QA test room (Example)`. The sample flag on the row is `rooms.is_demo`.

`private.sample_subject` treats a demo member and a demo room as samples (`supabase/migrations/20261123120000_re_board_roles.sql:602` and `:607`).

## Counts and digests

| Query | Demo filter | Grade |
| --- | --- | --- |
| `private.founding_counts` | `is_demo = false` and founding tier, `20261115120000_member_tiers.sql:232` | VERIFIED |
| `private.recompute_platform_stats` seat and money counts | `m.is_demo = false`, same file `:273`, `:283`, `:297`, `:311` | VERIFIED |
| `private.marketing_excluded` | demo flag, staff mail, or `example.com`, `20261107120000_marketing_funnel.sql:17` | VERIFIED |
| `public.marketing_funnel_counts` | `not private.marketing_excluded(..., is_demo)`, same file `:222` | VERIFIED |
| `marketing-stats` Edge | PostHog aggregates. It does not read `members.is_demo`. `supabase/functions/marketing-stats/handle.ts:1` | INFERRED. A browser session can still be an event. PostHog was not changed. |
| `public.list_directory` | real cards `m.is_demo = false`, `20261210120000_sectors_city_about.sql:213` and `:252`. Samples come from `directory_entries`, not from this member. | VERIFIED |
| `public.search_deal_room_directory` | `m.is_demo = false`, `20261207120000_sponsor_directory_opt_in.sql:253` | VERIFIED |
| `public.request_member_intro` | caller `m.is_demo = false` at `:485`, and `private.sample_subject` at `:495` | VERIFIED |
| Partner room credit count | `r.is_demo = false`, `20261204120000_sponsor_seat_sync.sql:475` | VERIFIED |
| `private.digest_member_visible` | `m.is_demo = false`, `20261212120000_weekly_digest.sql:140` | VERIFIED |
| Digest new mandates | `m.is_demo = false`, same file `:244` | VERIFIED |
| `public.my_weekly_digest` caller | `m.is_demo = false`, same file `:521` | VERIFIED |
| Digest introduction rows | `suggested.is_demo = false`, same file `:586` | VERIFIED |
| Intro suggestion recipients | `!isDemo` and not a sample, `supabase/functions/_shared/suggest_intros.ts:412` | VERIFIED. That file was not changed. |

`public.set_digest_email_opt_in` does not check `is_demo` (`20261212120000_weekly_digest.sql:482`). The fixture stores the preference as false. Digest bodies still use `private.digest_member_visible`. Sending stays off. No mail code was changed.

## Apply list for the operator

1. Create the auth user in the dashboard. Do not send an invite. Steps are in `supabase/qa/README.md`.
2. Paste the user id into the `\set qa_user` line locally. Do not commit it.
3. Run `psql "$DATABASE_URL" -f supabase/qa/qa-fixture.sql`.
4. There is no migration to apply.

To open `/admin`, add a `staff_users` row by hand and enrol a second factor so the session is aal2. `private.is_staff` is `supabase/migrations/20261127120000_staff_aal2_private_files.sql:8`. Remove the staff row after. Not scripted.

## Shots

No screen changed in this PR, so there is no screenshot. After the operator runs the script: a normal member's rooms list does not show the QA room; the QA member sees the room; admin rooms list shows `QA test room (Example)`.

## Not done

The script was not run against a live database. No migration was applied. No Edge function was deployed. No mail was sent.
