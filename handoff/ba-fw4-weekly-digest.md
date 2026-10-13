# BA FW4 handoff: weekly digest, admin approval, sending parked

Base at start: `6da30503` (later than `ac016d95`). Latest migration on that base: `20261209120000_application_answers_at_admission.sql`. Slot `20261209130000` was free and is the file used. Re-checked against `origin/main` at start. While this branch was open, main gained `20261209140000` and `20261210120000`. This file still sorts between `20261209120000` and those later files, so the slot stayed. No Edge deploy. No schedule. No mailbox.

Secrets grade: VERIFIED. The diff has no API keys, service-role keys, live tokens, staff names, or mailbox addresses. Tests use `example.com`. One Postgres fixture uses the existing mandate host check (`@boardarabia.test`) and asserts that value never appears in a digest payload.

## What members get

| Item | Where | Grade |
| --- | --- | --- |
| In-app This week page at `/dashboard/digest`, linked from Home. No new nav item. | `src/App.tsx:189`, `src/pages/dashboard/HomeSnapshotView.tsx:88` | VERIFIED |
| Live sections for the current ISO week: new members, new mandates, upcoming Majlis, the caller's own introductions | `public.my_weekly_digest()` at `supabase/migrations/20261209130000_weekly_digest.sql:495` | VERIFIED |
| Empty sections hidden. Whole page empty state is "Nothing new this week." | `src/components/digest/WeeklyDigestView.tsx` | VERIFIED |
| Weekly email preference, default false, owner only, next to the other privacy controls | `public.set_digest_email_opt_in` at migration `:461`. UI `src/components/privacy/PrivacyPanelView.tsx:101` | VERIFIED |
| Unsubscribe route exists and does not read a token | `src/App.tsx:190`, `src/pages/dashboard/DigestPage.tsx:67` | VERIFIED |
| Random unique token column, not granted to the member role, not returned by the preference RPC | migration `:9` and `:79` | VERIFIED |

## What admin gets

| Item | Where | Grade |
| --- | --- | --- |
| `digest_issues` with status draft, approved, or withdrawn. RLS forced. No table grant for anon or authenticated. | migration `:315` | VERIFIED |
| Staff aal2 prepare, approve, and withdraw. `security definer`, `search_path ''`, gated by `private.is_staff()` | migration `:746` and `:805` | VERIFIED |
| Audit rows for prepare, approve, and withdraw. The screen shows the action and the Riyadh time, not an actor id | `digest_issue_log` at migration `:347`. UI `src/pages/admin/DigestIssuePanel.tsx` | VERIFIED |
| Preview on the existing Email page: member view, letter text, letter HTML, Approve, Withdraw. Sample introduction only. | `src/pages/admin/EmailPage.tsx`, `src/pages/admin/DigestIssuePanel.tsx` | VERIFIED |
| Send switch read-only on the page. Copy: "Sending is off. Email is not connected." | `digest_settings.send_enabled` default false at migration `:289` | VERIFIED |

Members do not read `digest_issues`. A draft is not a member page. The in-app digest is computed live for the signed-in member. The stored issue is the snapshot an admin approves for a future letter. Grade for that split: INFERRED from the 12 Oct rule that approval gates sending, and from the original in-app outcome. UNKNOWN: whether a later brief will replace the live page with the approved snapshot only.

## Data sources

- New members. `private.digest_member_visible` and `private.digest_build_payload` (migration `:128` and `:190`). Same visibility as `public.list_directory()` in `supabase/migrations/20261207120000_sponsor_directory_opt_in.sql:121`: not hidden, not demo, not `private.sample_subject`, invited or active, seats ksa, intl, or sponsor. A sponsor still only sees cards that opted in, via `private.caller_sees_member_card`. "New" is `members.created_at` in the current ISO week. Display name, headline, company, and avatar style only. VERIFIED.
- New mandates. Published, not demo, not sample, `created_at` in the current ISO week. Card fields only: sector, deal type, ticket band, geography, stage, one liner. No company name, contact, amount, or narrative. There is no separate published-at column on `public.mandates` (`20260929120000_demo_seed_thresholds_redaction.sql:565`). VERIFIED.
- Upcoming Majlis. Published, not cancelled, `starts_at` in the future. Title, Riyadh time, region, host display name. Venue address uses the same cases as `private.majlis_events_member_rows` in `20261202120000_majlis_rsvp_calendar.sql:363`. A sponsor seat gets no events, matching that reader (`seat <> 'sponsor'`). VERIFIED.
- Introductions. The caller's current-week rows only, with the same hidden, demo, sample, and sponsor-card filters as `public.list_my_intro_suggestions()` in `20261207120000_sponsor_directory_opt_in.sql:273`. Staff prepare does not read `intro_suggestions`. The admin preview uses the fixture "Preview member". VERIFIED.
- Home activity is untouched. `list_member_home_activity` is not called.

## Sending stays off

- `mail_ready` is false on the payload, the member RPC, the issue reader, and `weeklyDigestMail` (`supabase/functions/_shared/weekly_digest_copy.ts:107`).
- `public.digest_issue_sendable` (migration `:635`) returns true only when status is approved, `send_enabled` is true, and `mail_ready` is the text true. It does not send. The Postgres test forces those flags and checks that a draft and a withdrawn issue stay false, and that an approved issue stays false while `mail_ready` is false.
- No `sendEmail` import in the digest files. No new Edge function. No workflow schedule. No cron.
- The letter closes with the same Board Arabia footer as `boardMail`. `scripts/weekly-digest.test.ts` checks `hasBoardFooter` and `marketingSignatureHit`. The template file does not import the sender. It has no image and no em dash. The preferences link is `/dashboard/digest/unsubscribe` with no token.

## Also in this PR

- Email list dates use `formatUkDateTime` (`src/lib/ukDate.ts:4`), Asia/Riyadh, for example `22 Sept 2026, 14:49`. Kind becomes a plain label (`src/lib/emailEventLabel.ts`). The address is not rendered. A stored subject is shown as stored.
- Home "Got it", "Details", and "Open" controls use a 44 by 44 px minimum. Asserted by bounding box at 390.

## Apply list

1. Apply `supabase/migrations/20261209130000_weekly_digest.sql` only, after `20261209120000_application_answers_at_admission.sql`.
2. Do not deploy an Edge function. The letter template is `supabase/functions/_shared/weekly_digest_copy.ts` for a later brief.
3. Do not connect a mailbox and do not add a schedule. A later brief has to require `digest_issue_sendable` before any send.

## Not done

- No live send, no cron, no mailbox, no provider change.
- The unsubscribe token is stored and unique. The route does not redeem it.
- `src/lib/database.types.ts` only gained the six RPC names the app calls. Tables were not regenerated.
- No change to intro generation, Majlis RSVP, or the `/apply` route.

## Checks

`node --experimental-strip-types --test scripts/weekly-digest.test.ts scripts/weekly-digest-db.test.ts` passed before the full suite: migration shape, letter guards, presenter redaction, Riyadh date, 44 px tap targets, and the Postgres privacy cases.

Shots, 1280 and 390: `/opt/cursor/artifacts/weekly-digest/digest-full-*.png`, `digest-empty-*.png`, `digest-privacy-*.png`, `digest-admin-*.png`, `digest-home-*.png`.
