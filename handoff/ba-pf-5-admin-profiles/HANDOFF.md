# PF-5 admin People > Profiles

Admin can open People > Profiles, see who has a usable profile and whose weekly intros are off, and open the member record. The list shows names, seat, and status. It does not show email or phone.

Skills applied: Board Arabia UX UI, and Dashboard UX desktop and mobile.

## Drift from the 7 Oct brief

Checked on main `3d8314b` (28 Oct 2026), not `ee1938d`.

- VERIFIED: the members list still keys a row by email in `src/pages/admin/PeoplePage.tsx`. This PR does not change that list.
- VERIFIED: routes live under `src/App.tsx` People children. The People section tabs are `src/pages/admin/PeopleLayout.tsx`, not a block inside PeoplePage.
- VERIFIED: migration slot `20261211120000` is already used. Latest migration on main at start was `20270106120000_majlis_request_review.sql`. This PR uses the next free slot, `20270107120000`.
- VERIFIED: `private.is_staff()` no longer checks a second factor. `20261230120000_staff_aal1_access.sql` removed that condition. This RPC calls `private.is_staff()` and does not add a private aal check. aal1 staff are allowed. Anon and members are refused.
- VERIFIED: PF-4 (PR 206, `cursor/pf-4-profile-completeness-162f`) was still open and not on main at the end of this work. `src/lib/profileCompleteness.ts` is not in this branch. Chip rules in `src/lib/adminProfileList.ts` follow the PF-4 directory and weekly rows (photo, name, title, organisation, city; sector count and availability). The test compares them to `profileCompleteness` when that file exists.
- VERIFIED: `src/shell/destinations.ts` is locked for this run, so the Profiles tab is added in `src/pages/admin/peopleSections.ts` and rendered by the existing People section tabs. Primary sidebar and phone tabs are unchanged.
- INFERRED: closed accounts (`members.anonymised_at` set) should stay off a working profile list. They are excluded. Suspended members who have not closed an account stay on the list.

## What changed

| Review item | Change | Test |
|---|---|---|
| People > Profiles at `/admin/people/profiles` | `src/App.tsx:181`, shell `scripts/shell-manifest.mjs:41`, tab `src/pages/admin/peopleSections.ts:5` | `profiles route is a People section, not a new primary destination` |
| `staff_list_profiles()` | `supabase/migrations/20270107120000_staff_list_profiles.sql:8`, gate at `:16`, revoke at `:67` | `staff_list_profiles refuses anon and members and omits contact fields` |
| Names, seat, status chips, Intros off, Card incomplete, last updated AST | `src/pages/admin/AdminProfilesPage.tsx:124`, `:162`, `:189`, `:197` | `profile list states hide contact fields and link to the member record` |
| Chips from the PF-4 rules | `src/lib/adminProfileList.ts:98` | `chips follow the PF-4 directory and weekly rows` |
| Count line | `src/lib/adminProfileList.ts:138` | same chip test (`4 members. 2 with intros off.`) |
| Row opens the member record (that read stays logged) | link `src/pages/admin/AdminProfilesPage.tsx:189`; record still calls `staff_read_member` at `src/pages/admin/StaffMemberRecordPage.tsx:22` | route test plus member-record shots |
| Empty, loading, error, permission, filtered zero | `src/pages/admin/AdminProfilesPage.tsx:75`, `:81`, `:89` | state test |
| Staff inventory | `scripts/security-view-access.test.ts:279`, `scripts/sec-c-grants.test.ts:548` | `every staff_* function checks staff and is not executable by anon` |
| Anon allowlist unchanged | `scripts/definer-audit.test.ts` still rejects a new anon function | `anon allowlist stays closed and read_dd_retention_copy checks the caller` |

Seat matches stays hidden. The RPC returns `board_seat_type` and `board_seat_where` as null until PF-6. The chip appears only when those values are strings.

List reads are not logged. VERIFIED: the existing members list is `fetchAdminMembers()` at `src/lib/supabase.ts:461`, a table read with no access-log call. `staff_list_profiles` does not call `log_staff_access`. Opening one row still uses `staff_read_member`, which records the read.

## UX

Surface: admin. Job: see who has a usable profile.

Board Arabia UX UI: same People destination on desktop and phone, indigo chips on the existing staff shell, English only, empty state with one applications link, skeleton loading, honest error with retry, permission copy "This list is for admin."

Dashboard UX desktop and mobile:

- Desktop (1440): persistent left sidebar. People is the active primary. Profiles is a section tab next to People and Intros.
- Phone (390): bottom tabs Home, Applications, People, Majlis, More. People opens the same `/admin/people` hub. Profiles is the same section tab, not a new primary and not a hamburger-only job.
- Tables become cards under the `lg` breakpoint. Desktop keeps one row per member.
- Filters are the same two controls on both widths. Intros off and Card incomplete combine.
- Targets: filter buttons and row links are `min-h-12` (48px). The shared section tab stays the existing 44px control.
- Safe areas: the shell already applies `shell-safe-top` on the header, `shell-main` padding above the tab bar, and `shell-safe-bottom` on `shell-tab-bar`. This page does not add a second tab bar. VERIFIED in `src/shell/AppShell.tsx` and in the shot test.
- States: empty, loading, error, permission denied, and filtered zero ("No matches. Clear filters.").

Shots in this folder, example fixtures only:

- `people-1440-before.png`, `people-390-before.png`: People hub before the Profiles tab.
- `profiles-1440-after.png`, `profiles-390-after.png`: mixed chips.
- `profiles-intros-off-1440.png`, `profiles-intros-off-390.png`: Intros off filter on. The count line stays on the full list.
- `profiles-empty-1440.png`, `profiles-empty-390.png`.
- `member-record-1440.png`, `member-record-390.png`: the existing member record. The stored seat code is still shown there. This PR does not restyle that page.

## Not done

- Suggest changes, Request update, and edit on behalf. Those are PF-9 and PF-10.
- Seat matches chip. Hidden until board seat fields are real strings (PF-6).
- Logging one access-log row for the whole list. The members list does not do that. Left as specified.
- Mail. No new send path. A later in-app notice could tell a member their intros are off. Switching on email stays a separate parked decision.
- No Edge function. Nothing to redeploy.

## Sasha applies

1. `supabase/migrations/20270107120000_staff_list_profiles.sql`
2. No Edge.

Smoke as QA staff: open `/admin/people/profiles`, confirm the live members by name and chips, open one row, then sign out. Do not apply this file from the app or with `supabase db push` in CI.

## Secrets

Grade: VERIFIED.

Scanned the PF-5 source diff and new text files for addresses other than example.com, key and token shapes, private keys, em dashes, and en dashes. None. The brand string appears only as a negative assertion in `scripts/admin-profiles-list.test.ts` that the rendered list does not contain it, the same pattern as other tests. It is not in product code, the migration, or the shots. SQL fixtures use example.com and are not returned by the RPC (the SQL test fails if they leak).
