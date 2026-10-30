# PF-7 handoff: focus fields and intro reasons

Branch: `cursor/pf-7-focus-fields-93c7`
Merged main: `27d132b6aa6325adc5bf47c681e39435ccf7f429` (phone sizing, AI Due Diligence notice, vetting copy).
Head SHA: the merge commit on this branch. It is recorded on the pull request.

## What changed

Members can say, in a few taps, what they can help with (up to 3 chips plus one optional line), what they are looking for (up to 3 chips plus one optional line), and which languages they work in. Vision 2030 themes stay optional. Chosen sectors suggest themes. The member taps to add them. Nothing is saved automatically.

Weekly intro suggestions add 1 point per offer/ask chip match. A shared sector still scores 3, so sectors stay the stronger signal. A match can be the reason line `They can help with {chip}, which you are looking for.` Free-text lines are never matched. The weekly cap, refill, no-stacking, and directory-hidden rules are unchanged.

## Review items

| Claim | Where | Test | Grade |
|---|---|---|---|
| Can help with: 8 chips, max 3, optional line max 140 | `supabase/migrations/20270109120000_focus_fields.sql:11`, `:104`, `:65`; `supabase/functions/_shared/focus_fields.ts:3`; `src/pages/dashboard/FocusFields.tsx` | `focus migration slot, lists, and security text`; `lines reject email and phone patterns and chips stay on the allowlist` | VERIFIED |
| Looking for: 7 chips, max 3, optional line max 140 | migration `:30`, `:108`; `focus_fields.ts:14` | same tests | VERIFIED |
| Languages: Arabic, English, French, Urdu, Hindi, Other. UI copy stays English. | migration `:48`; `FocusFields.tsx` | list equality in the migration test | VERIFIED |
| Vision 2030 themes are optional and suggested from sectors. The member taps to add. | `focus_fields.ts:48`; `src/pages/dashboard/ProfileTagFields.tsx:78` | `suggestedVisionThemes(['Real estate', 'Health'])` | VERIFIED |
| Focus section on the profile | `src/pages/dashboard/ProfilePage.tsx:776` | smoke shots `focus-390.png`, `focus-1280.png` | VERIFIED |
| Card chips, and the lines on the expanded card | `src/pages/dashboard/DirectoryFocus.tsx`; `DirectoryBoard.tsx:244` and `:248` | `directory cards keep chips and drop contact lines`; shots `directory-chips-*`, `directory-lines-*` | VERIFIED |
| `list_directory` returns chips and lines only for a permitted viewer | migration `:287`, `member_focus_card` at `:238` | `focus writes are owner only and directory hides private lines` | VERIFIED |
| Better intro reasons row: at least 1 can-help chip and 1 looking-for chip. The line does not count. | `src/lib/profileCompleteness.ts:101`; `ProfilePage.tsx:543` | `PF-6 and PF-7 rows appear only when their fields are passed`; shots `completeness-390.png`, `completeness-1280.png` | VERIFIED |
| Looking-for chip maps to a can-help chip. Weight is 1. Reason line is exact. | `focus_fields.ts:34`, `:45`, `:110`; `suggest_intros.ts:326` | `a chip match ranks above no match at equal sectors and the reason is exact` | VERIFIED |
| Free-text lines are not loaded and not scored | `suggest-intros/index.ts` selects chips only; planner has no line fields | same planner test asserts the planner source has no line columns | VERIFIED |
| Weekly cap stays 2. A hidden member is not suggested. Reasons have no `@`. | `suggest_intros.ts:9`, `:328` | same planner test, plus existing `a hidden member never appears as a suggestion` and `suggestion reasons never contain @` | VERIFIED |
| No network import in the planner module | `suggest_intros.ts` imports only local modules | planner source test rejects `https:` imports and `fetch(` | VERIFIED |
| Database rejects email and phone-like lines | migration `:65` `focus_line_ok`; `focus_fields.ts` `focusLineProblem` | database test stores neither `ada@example.com` nor `+966555000000` | VERIFIED |
| Owner-only writes. No anon grant. No direct column update. | `save_my_focus` at migration `:179`; select grant at `:137`; no update grant | database test: other member cannot overwrite, anon cannot update, staff gets `not_allowed` | VERIFIED |
| `search_path = ''` on every function in this migration. No `search_path = public`. | each function header in the migration | `focus migration slot, lists, and security text` | VERIFIED |
| Anon allowlist unchanged. No new `staff_*` function. | no edit to the allowlist array | `anon allowlist stays closed`; `every staff_* function checks staff` | VERIFIED |
| `list_directory` payload has no email, phone, turnover, LinkedIn, or calendar keys | migration comment at `:387`; card builder | database test checks those keys are absent, and the payload text has no `@` | VERIFIED |
| Admin list stores the first chip, not the line | migration `:428` | database test: `help_with` is `Deal introductions`, line keys absent | VERIFIED |
| Same destinations on desktop and phone. Phone chips stay 44px tall and wide. Long labels wrap. Loading, empty, error, and missing-profile states stay. | `src/pages/dashboard/MemberFilters.tsx:154` keeps `min-h-11 min-w-11`. Profile copy sits in `data-phone-body`. | `phone tap targets are at least 44px and phone body text is at least 15px`; fresh shot `focus-390.png` | VERIFIED |
| SeatMatchChip.tsx deleted | not deleted | `scripts/smoke/boardroom-main.tsx` and `scripts/boardroom-fields.test.ts` still import it | VERIFIED unused cleanup does not fit |
| Main merge keeps the phone sizing classes | Directory More stays `min-h-12 min-w-11`. Profile checklist stays `min-h-11`. Home order attributes stay. | `scripts/dm1-mobile.test.ts` source guard | VERIFIED |
| AI Due Diligence notice behaviour is unchanged by this merge | `src/lib/aiDueDiligenceNotice.ts` and the Due Diligence pages match main | `git diff origin/main` on those files is empty | VERIFIED |
| Migration slot `20270109120000` is only this file | `supabase/migrations/20270109120000_focus_fields.sql` | `git ls-tree` of main has no file with that timestamp | VERIFIED |
| This merge does not edit Edge code, legal text, or locked files | suggest-intros diff against the pre-merge branch is empty. Legal and operator files match main. | file diff | VERIFIED |
| Fresh 390px focus shot after the merge | `handoff/ba-pf-7-focus-fields/focus-390.png` | Playwright at width 390 after the chip resolution | VERIFIED |

## Proposed match table (for review)

| Looking for | Can help with |
|---|---|
| Board seat | Board experience |
| Co-investors | Co-investment |
| Deal flow | Deal introductions |
| Advisers | Government and regulatory know-how |
| Capital for my company | Co-investment |
| Partners in a sector | GCC partners |
| Peers to compare notes | Family office peers |

Market entry into Saudi Arabia, Talent and executives, and languages are stored and shown. They are not match keys. Score weight is 1 per matched help chip. One shared sector remains 3.

## Sector to theme suggestions (for review)

Energy transition: Renewable energy. Health: Health transformation. Tourism: Tourism, Quality of life. Financial services: Financial sector development. Logistics: Industrial development and logistics. Mining: Localization. Digital infrastructure: Thriving economy. Food security: Food security. Real estate: Housing. Industrials and manufacturing: Industrial development and logistics. Technology and telecom: Thriving economy. Consumer and retail: Quality of life. Construction and infrastructure: Housing. Education: Ambitious nation. Media and entertainment: Vibrant society. Utilities and water: Ambitious nation.

## Migrations in apply order

1. `supabase/migrations/20270109120000_focus_fields.sql`

The brief slot `20261213120000` is already `rls_initplan_select_auth_uid` on main. The next free slot after `20270108120000_boardroom_fields.sql` is `20270109120000`, which is the slot named for this run. Do not apply this file from the app, from CI, or against a live database from this PR.

## Redeploy after the migration

1. `suggest-intros` (the only Edge function that imports `supabase/functions/_shared/suggest_intros.ts`).

Deploy the function only after the migration. The function selects `can_help_with` and `looking_for`. It does not select the lines. No other Edge function is in this change. This PR does not deploy it.

## Email

No new send path. The new reason is in-app, on the suggestion card, from the stored `intro_suggestions.reason`. Existing nudge mail is unchanged and does not include the reason. A later weekly note could quote that stored reason. Not in this PR.

## Secrets grade

VERIFIED. The diff uses `example.com` fixtures only. No keys, tokens, passwords, staff names, or live addresses.

## Not done

`src/pages/admin/SeatMatchChip.tsx` is still used by the boardroom smoke harness and its test. Deleting it would break that harness, so it stays.

Older `search_path = public` definers were not rewritten.

## Focus redesign (30 Oct)

UI only. `supabase/migrations/20270109120000_focus_fields.sql` is unchanged. Lists, limits, `save_my_focus`, and the planner weight are unchanged.

| Claim | Where | Test or shot | Grade |
|---|---|---|---|
| Main `6e507096` is merged. Newest migration file is `20270110120000_majlis_reminder_windows.sql`. Focus migration still sorts before it. | `scripts/boardroom-fields.test.ts` and `scripts/focus-fields.test.ts` | `boardroom migration slot, lists, and security text`; `focus migration slot, lists, and security text` | VERIFIED |
| Vision 2030 themes render from `FocusFields.tsx`, not the sector component | `src/pages/dashboard/FocusFields.tsx` | `profile, directory, and mandates screens expose the new controls` | VERIFIED |
| Each question is a card with a count pill, 17px title, 15px helper, and a check on the selected chip | `src/pages/dashboard/FocusFields.tsx` | `after-focus-390.png`, `after-focus-1440.png` | VERIFIED |
| At the limit, unselected chips stay tappable, use `aria-disabled`, and the message sits under that group | `FocusFields.tsx` `LIMIT_MESSAGE` | source | VERIFIED |
| Optional line stays behind `Add a line (optional)` until opened or already filled. Counter uses raw length | `OptionalLine` in `FocusFields.tsx` | `after-focus-390.png` shows `51 of 140` | VERIFIED |
| Vision 2030 is last and collapsed, with suggestions and `See all 12 themes` | `VisionDisclosure` in `FocusFields.tsx` | `after-focus-390.png` | VERIFIED |
| Checklist actions are `Pick 1 in each group` and `Pick 1 more`, still linking to `#focus` | `src/lib/profileCompleteness.ts` `reasonsAction` | `PF-6 and PF-7 rows appear only when their fields are passed` | VERIFIED |
| Directory labels are 15px sentence case. Help chips use a mist fill. Looking-for chips use an indigo outline. Lines sit under their chips | `src/pages/dashboard/DirectoryFocus.tsx`, `DirectoryBoard.tsx` field label | `after-card-390.png`, `after-card-1440.png` | VERIFIED |
| Languages are one line, with `+N more` after three | `src/lib/focusCard.ts` `directoryLanguageLine` | unit test; card shot shows `+2 more` | VERIFIED |
| Match cue uses the viewer's looking-for chip | `matchingAsks` and `DirectoryPage.tsx` | unit test; card shot shows `Matches what you are looking for: Deal flow` | VERIFIED |
| Mobile save bar has Unsaved, Saving, Saved, and Not saved. Saved clears after 5 seconds | `src/pages/dashboard/ProfileSaveBar.tsx`, timeout in `ProfilePage.tsx` | `after-save-390.png`, `after-save-1440.png`. The 5 second timer is in code | VERIFIED for copy and layout. Timer duration INFERRED from `setTimeout(..., 5000)` |
| Example mark and directory Sector and Firm labels are at least 15px | `src/components/ExampleMark.tsx`, `DirectoryBoard.tsx` `Field` | source uses `text-[15px]` | VERIFIED |
| Tap targets stay at least 44px and phone body text at least 15px | focus chips `min-h-11 min-w-11`, helpers `text-[15px]`, save button `min-h-12` | `phone tap targets are at least 44px and phone body text is at least 15px` | VERIFIED |
| Loading, empty, and error states remain on Focus | skeletons and retry in `ProfilePage.tsx`. Empty is an open card with no chips selected | source | VERIFIED |
| No Edge, legal, or migration edits in the redesign | diff excludes those paths | `git diff` | VERIFIED |
| Approved 390 before mockups | supplied with the brief, not present as files on disk | not committed | UNKNOWN as repo files. The after shots above are VERIFIED |

## Shots

Example data only. After shots are at 390 and 1440. Earlier shots at 1280 remain from the first pass.

- `completeness-390.png`, `completeness-1280.png`
- `after-focus-390.png`, `after-focus-1440.png`
- `after-card-390.png`, `after-card-1440.png`
- `after-save-390.png`, `after-save-1440.png`
- `focus-390.png` (retaken after the main merge), `focus-1280.png`
- `directory-chips-390.png`, `directory-chips-1280.png`
- `directory-lines-390.png`, `directory-lines-1280.png`
- `suggestion-390.png`, `suggestion-1280.png`

## Checks run locally

`tsc -b` passed. `scripts/focus-fields.test.ts` passed, including the Postgres apply of the full migration chain. `scripts/definer-audit.test.ts` passed. `scripts/boardroom-fields.test.ts` passed, including its Postgres check of the replaced `list_directory`. `scripts/security-view-access.test.ts` staff inventory passed. Planner tests in `scripts/weekly-intro-suggestions.test.ts` and `scripts/intros-b.test.ts` passed aside from Postgres-less environments (Postgres is present here and the focus database test passed).
