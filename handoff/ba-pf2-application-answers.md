# BA PF-2 handoff: application answers at admission

Review: section 6 item 3 (P1, S); section 2i; F1. Locked D3: carry sectors, themes, region, board seats, statement and website from the application at admission.

Base at start: main `ee1938d`. Latest migration on that base: `20261207120000_sponsor_directory_opt_in.sql`. Slot used: `supabase/migrations/20261209120000_application_answers_at_admission.sql`. `20261208120000` is not on main. It stays free for FW3. This file does not depend on FW3.

`src/lib/database.types.ts` was not edited. `scripts/definer-audit.test.ts` was not edited. No file from PR #149 (`cursor/trusted-partners-gallery-1cef`) was edited.

`scripts/sponsor-directory-opt-in.test.ts:121` was changed from an equality pin on the newest migration name to "newest file sorts at or after the opt-in migration". That pin would fail as soon as any later migration exists. The opt-in file is not in PR #149.

`public.transition_candidate` was not rewritten. `claim_founding_seat` inserts the profile, then `transition_candidate` inserts the approval event, in the same transaction. The AFTER INSERT trigger runs after that insert and can see the profile. VERIFIED: the Postgres test approves through `transition_candidate` and the profile tags change.

## Review items

| Item | Change | Test | Grade |
| --- | --- | --- | --- |
| New table `public.member_application_answers` with the six columns and checks | `supabase/migrations/20261209120000_application_answers_at_admission.sql:19` | `admission carries filtered tags and keeps private answers` | VERIFIED |
| RLS enabled and forced, no policies, no table grants for anon, authenticated, or service_role | same file `:48` to `:51` | same test (catalog privileges and a direct select) | VERIFIED |
| `public.get_my_application_answers()` returns only the caller row and omits reviewed fields | same file `:223` | same test | VERIFIED |
| `public.dismiss_my_application_answer(p_field text)` adds the field and deletes the row when every stored field is reviewed | same file `:278` and `:303` | same test | VERIFIED |
| No staff RPC and no new anon function | grants at `:273` and `:315` only to authenticated; private functions revoked from public, anon and authenticated, including `private.purge_application_answers_on_anonymise()` at `:211` | `anon allowlist stays closed and read_dd_retention_copy checks the caller` plus the new Postgres test | VERIFIED |
| Carry sectors and themes only when that profile list is empty, keep order, drop values outside `private.profile_sector_tags()` and `private.profile_vision_themes()`, max 3 | same file `:92` to `:126` | same Postgres test (filtered list, duplicate collapsed, fourth allowed value dropped, existing list left in place, empty vision list filled alone) | VERIFIED |
| Upsert region, board seats, statement and website, skip blanks, no row when all four are empty | same file `:128` to `:164` | same test, including a blank region after the candidate check is lifted inside the test database only | VERIFIED |
| Those four fields are never written onto the live profile. The website is not requested | profile updates are only `sector_tags` (`:116`) and `vision_themes` (`:123`). No HTTP call in the migration | same test asserts location, bio and LinkedIn stay as admission left them | VERIFIED |
| Trigger only on `candidate_events` kind `state_change` and `detail->>'to' = 'approved'` | trigger function `:173`, trigger `:190` | same test: in_review, a declined event, and a note whose detail says approved do not copy; an approval event before a member row does not create answers | VERIFIED |
| Answers row is deleted when the member is anonymised | `private.purge_application_answers_on_anonymise()` at `:196`. Trigger `purge_application_answers_on_anonymise` at `:217`. Column is `anonymised_at` (`20261128120000_retention_privacy_audit.sql:429`). Fires only when that column changes from null to a time. | same Postgres test: a non-anonymise update keeps both rows; setting `anonymised_at` deletes that member only; setting it again is harmless. Static checks in `application answers migration bans search_path public` (`scripts/application-answers.test.ts:34`) | VERIFIED |
| Security definer functions use `set search_path = ''` | `:59`, `:177`, `:200`, `:228`, `:282` | `application answers migration bans search_path public` | VERIFIED |
| No em dash and no email pattern in the migration | migration comments and SQL | same static test | VERIFIED |
| Definer audit anon allowlist unchanged | no edit to `scripts/definer-audit.test.ts` | `anon allowlist stays closed and read_dd_retention_copy checks the caller` | VERIFIED |

## Not done, and why

- No UI. PF-6, PF-8 and PF-11 show or use these answers later. The Profile tag section already renders `sector_tags` and `vision_themes`. The shots use that screen with example tags the carry function keeps: Energy transition, Health, Tourism, Thriving economy, Vibrant society, Renewable energy. Fixture: `scripts/smoke/application-answers-profile-main.tsx`.
- No backfill. Live admissions are future only.
- No Edge change. `review-membership` and `admit-member` are untouched. The legacy admit path still reads `applications`, which has no sector, theme or statement columns.
- No city mapping. Region stays the two-value band `ksa_gcc` or `intl`.
- `src/lib/database.types.ts` not regenerated. This PR does not read the table from the app, and PR #149 also edits that file.
- No extra time limit. The existing sweep still anonymises a member 24 months after `left_at`. This migration deletes the answers row at that moment.
- Email stays off. See below.

## Retention

Answered. Members are anonymised, not deleted, so `on delete cascade` does not run. `anonymised_at` is the real column (`supabase/migrations/20261128120000_retention_privacy_audit.sql:429`). When it changes from null to a time, `purge_application_answers_on_anonymise` deletes that member's `member_application_answers` row and leaves every other member alone. The row also still leaves when the member row is deleted, or when every stored field is reviewed.

## Email, parked

Nothing here sends mail. No `sendEmail`, no `mail.ts`, no `ADMIN_NOTIFY_EMAIL`. A later in-app note that answers are waiting belongs with PF-6. Turning mail on would be a separate change.

## Sasha apply list

1. Apply `supabase/migrations/20261209120000_application_answers_at_admission.sql` (table, RPCs, admission trigger, carry function, and the anonymise purge trigger). In merge order this sorts after FW3's `20261208120000` if that file is applied too. This migration does not depend on FW3.
2. No Edge redeploy.

Smoke after apply: approve a test candidate who has sectors, themes and a statement. The member Profile shows the filtered tags. The answers row holds region, board seats, statement and website. Location, bio and the rest of the card are unchanged. The website is not requested.

## Local checks

`node --experimental-strip-types --test scripts/*.test.ts` after the production build: 717 passed, 0 failed, 3 skipped. `npm run build` (tsc, vite, prerender) and `scripts/pages-artifact-gate.sh` passed.

The first GitHub pr-checks run failed in `anon cannot read the operator row and an authenticated member can` with a duplicate role name. That statement runs before this migration is loaded. Parallel tests create the cluster role `anon` at the same moment. The same full suite then passed locally. Grade for that GitHub failure: INFERRED race, not this migration.

The anonymise trigger was checked the same way: 717 passed, 0 failed, 3 skipped.
