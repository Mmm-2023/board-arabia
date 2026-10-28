# PF-6 boardroom fields

Member profile and directory card: boards held, open to new seats, and expertise. Focus fields (can help with, looking for, languages) stay with PF-7. Real estate sector and About on the card are already on main from PF-3.

## Drift from the 7 Oct brief

- VERIFIED: brief base was main `ee1938d`. This work started from main `3d8314b` (privacy and terms placeholders, #205).
- VERIFIED: migration slot `20261212120000` in the brief is weekly digest on main. Latest migration on main at start was `20270106120000_majlis_request_review.sql`. Open PF-5 (#207) reserves `20270107120000_staff_list_profiles.sql` and is not on main. This PR uses `20270108120000_boardroom_fields.sql`.
- VERIFIED: PF-4 (#206, `4665c4f`) and PF-5 (#207, `3977f24`) are merged. This branch merges that main. Boardroom sits between Your card and Focus on the profile page.
- VERIFIED: `profileCompleteness` shows "Board seat matches on" when `boardSeatType` or `boardSeatWhere` is passed. `ProfilePage` passes `boardSeatFieldsForCompleteness`. Both empty strings mean the row is visible and not done. Omitting the keys still hides the row, which is how home stays until those fields are loaded there.
- VERIFIED: `staff_list_profiles` from `20270107120000` returns null for the two board keys. `20270108120000` replaces that function and fills them from `private.board_seat_match_fields`. Empty text means the admin chip is off. `adminProfileList.ts` was not edited. It already treats strings as known and null as hidden.
- VERIFIED: `private.is_staff()` on main (`20261230120000_staff_aal1_access.sql`) does not check aal2. Boardroom writes still reject staff by calling `private.is_staff()`.
- VERIFIED: no Edge function reads `list_directory`. No Edge deploy.
- INFERRED: shots are 390 and 1440, as asked for this run. The brief asked for 1280 and 390.

## What changed

| Review item | Change | Test |
|---|---|---|
| Board roles, up to 5, fixed role and type | `public.profile_board_roles`, `save_my_board_roles` | `boardroom writes are owner only and directory hides private cards` |
| Open to seats, seat types, where | `public.profile_boardroom`, `save_my_board_focus` | same SQL test; `client match rules follow open, one seat type, and one where` |
| Expertise, up to 5 | `profile_boardroom.expertise` | same |
| Profile Boardroom section | `BoardroomSection.tsx`, mounted from `ProfilePage.tsx` | `boardroom route stays on the profile page` |
| Card: roles, chip, expertise; seat types and where when expanded | `DirectoryBoardroom.tsx`, `DirectoryBoard.tsx`, `presentDirectoryCard` | `directory card drops contact text and keeps permitted board fields` |
| Completeness row | `profileCompleteness` via `boardSeatType` and `boardSeatWhere` on `ProfilePage` | `PF-6 and PF-7 rows appear only when their fields are passed` |
| Admin chip contract | `adminSeatMatchState`, `SeatMatchChip.tsx` | client match test and the chip copy test |
| Use what you told us | `applicationWhereOffer`: `ksa_gcc` to Saudi Arabia and GCC, `intl` to International. Shown before the tap. | client match test |
| Application board seats text | Read-only "You told us:" plus Dismiss via existing `dismiss_my_application_answer` | SQL test dismisses `board_seats` |
| FW8 helpers | Lists and `boardSeatMatchesOn` in `src/lib/boardroom.ts`. No matching built. | list equality test |

Client lists equal the arrays in `private.board_role_titles`, `private.board_org_types`, `private.board_seat_types`, `private.board_seat_where`, and `private.board_expertise`. VERIFIED by `boardroom migration slot, lists, and security text`.

## Columns and lists for FW8

Do not build matching in this PR.

- `public.profile_board_roles`: `user_id`, `organisation`, `role`, `org_type`, `position` (1 to 5).
- `public.profile_boardroom`: `user_id`, `open_to_seats` (boolean, Yes is true, Not now is false), `seat_types`, `seat_where`, `expertise`.
- `private.board_seat_match_fields(uuid)` returns `board_seat_type` and `board_seat_where` as text. Both are empty unless `open_to_seats` is true and that list has a value. A match is on only when both are non-empty. `staff_list_profiles` reads this helper.
- `list_directory` adds `board_roles` (`role`, `org_type`, `organisation`), `open_to_board_seats`, `seat_types`, `seat_where`, `expertise`. It still calls `private.caller_sees_member_card` and `private.can_read_member_room`, so a free account still cannot read the directory. The caller list in `scripts/free-account.test.ts` includes this migration. No email, phone, or turnover keys.

Role titles: Chair, Vice chair, Independent director, Non-executive director, Committee chair, Adviser.

Organisation types: Listed, Private, Family business, Government or semi-government, Non-profit.

Seat types: Chair, Independent director, Non-executive director, Committee: Audit, Committee: Risk, Committee: Nomination and remuneration, Adviser.

Where: Saudi Arabia, GCC, International.

Expertise: Governance, Audit and risk, M&A, Capital markets and IPO, Family business and succession, Strategy, Turnaround, Digital and AI, ESG, Regulation and compliance, Islamic finance, Real estate development, People and remuneration.

`public.re_board_roles` is unchanged. VERIFIED: the migration does not alter that table.

## Security

- RLS enabled and forced on both new tables. No anon, authenticated, or service_role table grants. VERIFIED in the SQL test.
- Writes go through `get_my_boardroom`, `save_my_board_roles`, and `save_my_board_focus`. Each is security definer with `search_path = ''`. Staff and other members cannot write. A suspended member or a caller with no profile cannot write. VERIFIED.
- Anon cannot execute the new functions. `scripts/definer-audit.test.ts` anon allowlist is unchanged. No new `staff_*` function, so the staff inventory in `scripts/security-view-access.test.ts` is unchanged. VERIFIED (`anon allowlist stays closed` and the boardroom grant checks).
- Organisation is plain text, max 120, rendered as React text. The database rejects `@`, a plus before a digit, or 8 or more digits. A year range that contains 8 digits is rejected. VERIFIED for `Example Holdings`, `Vision 2024`, `person@example.com`, `+966500000000`, and `0500000000`.
- Migration test fails the file if it contains `search_path = public`. VERIFIED.

## UX

Skills applied: Board Arabia UX UI, and Dashboard UX desktop and mobile.

- Surface: member profile and directory card. Job: record boards, openness to seats, and expertise.
- Destinations are unchanged. Desktop sidebar and mobile tabs still open the same places. No new tab. Profile stays `/dashboard/profile`. The section anchor is `#boardroom`.
- Phone targets on the new controls are 48px (`min-h-12`), 44px from `md` up. The directory More control follows the same sizes.
- Empty: "No board roles yet" and "Add a board role". Loading: skeleton. Error: message and Retry. Missing profile: ask our admin team.
- Directory: roles, expertise chips, and the "Open to board seats" chip on the card face. Seat types and Where are in the expanded card (More on a phone, always on desktop).
- The admin Profiles page from PF-5 shows "Seat matches on" or "Seat matches off" once the replaced `staff_list_profiles` returns text. Both null still hides the chip. The fixture shot uses the same chip.

## Shots

Before and after at 390 and 1440 in this folder. Example data only (`example.com`, Example Holdings, Example Member). Profile after shots are the merged page: Your card, then Boardroom, then Focus.

- Profile empty, filled, application offer, and load error.
- Directory card, and the expanded card.
- Admin chip on and off.

## Not done

- Focus fields, intro reasons, languages: PF-7.
- `adminProfileList.ts` still has its own card and intros checks. It was not edited. The chip math already matches `boardSeatFieldsForCompleteness` when the list returns text.
- Seat matching, nudges, and mail. A later in-app notice could tell admin that a member opened to seats. No send path was added. Email stays parked.
- `private.can_read_member_room` still uses `search_path = public` from an older migration. This PR does not rewrite it.

## Apply

1. `supabase/migrations/20270107120000_staff_list_profiles.sql` (already on main, from PF-5).
2. `supabase/migrations/20270108120000_boardroom_fields.sql` after that. It replaces `staff_list_profiles` so the two board keys are text from `private.board_seat_match_fields`. Do not apply it from the app or CI.
3. No Edge functions.

## Secrets

VERIFIED. The diff, tests, fixtures, and shots use example.com only. No live keys, tokens, passwords, staff names, or member data. The organisation check mentions `@` as a rejected character, not an address.
