# BA PF-3 handoff: sectors, city picklist, About on the card

Review: section 6 items 6, 7, 8 (P1, S each); F5, F8, F9. Locked D3: add Real estate, show About on the card, city becomes a picklist so same-city matching works. The seven extra sectors from review 4a are approved under D3.

Base at start: main `6da30503`. Latest migration on that base: `20261209120000_application_answers_at_admission.sql`. Slot used: `supabase/migrations/20261210120000_sectors_city_about.sql`. The brief slot was free. It was not bumped.

No new table. No legal text. `/apply` is unchanged. `scripts/definer-audit.test.ts` anon allowlist is unchanged. No mail send was added.

## Review items

| Item | Change | Test | Grade |
| --- | --- | --- | --- |
| One sector list, client and database identical, including Real estate and the seven approved additions. Max 3 stays. | `src/lib/profileTags.ts:13` and `supabase/migrations/20261210120000_sectors_city_about.sql:20` | `client sector list matches the database list, including Real estate` | VERIFIED |
| Staff mandate create accepts Real estate because it still calls `private.profile_sector_tags()` | `supabase/migrations/20261206120000_staff_create_mandate.sql:121` (unchanged call) plus the replaced allowlist | same test, and the Postgres test writes `array['Real estate']` | VERIFIED |
| Application checklist and admin mandate form show the new list because both render `SECTOR_TAGS` | `src/pages/dashboard/account/MembershipChecklistView.tsx:392`, `src/pages/admin/NewMandateForm.tsx:175` | `the checklist and the admin mandate form show the longer sector list` | VERIFIED |
| `profiles.city_key` is a fixed key or `other`. `profiles.location` stays the display text. Member can update `city_key` alongside `location`. | migration `:127`, `:175`, `:184` | `sectors, city keys, and about hold in postgres` | VERIFIED |
| Existing location text maps generically: trim, lower case, first comma part, aliases. No row-specific SQL. Unmatched values become `other` and keep their trimmed text. A known city is stored as the picklist label. | `private.city_key_from_location` at migration `:49`. Backfill at `:175`. Client twin `supabase/functions/_shared/cities.ts` | `city mapping sends Riyadh variants to riyadh and keeps unknown text as other` and the Postgres mapping checks | VERIFIED for the named aliases (khobar, al khobar, dammam) and the picklist labels. INFERRED for extra spellings (riaydh, mecca, medina, jiddah, kuwait, masqat) |
| A trigger sets `city_key` from `location` on insert and on update of location, so a later write cannot leave the key blank | migration `:152` and `:170` | Postgres test: `khobar, east` stores `dammam_khobar` and keeps the typed text | VERIFIED |
| Same-city suggestions use `city_key` when both keys are fixed. `other` falls back to the normalised text compare. The reason uses the city label. Cap, refill, and hidden rules are unchanged. | `supabase/functions/_shared/suggest_intros.ts:446`. Load at `supabase/functions/suggest-intros/index.ts:171` and `:229` | `same-city matching uses fixed keys and falls back to text for other` | VERIFIED |
| Directory city filter uses the key | `src/lib/directoryFilters.ts:43` and `:78`. Chips in `src/pages/dashboard/DirectoryBoard.tsx:81` | `directory filter uses the city key, and the card keeps about as plain text` | VERIFIED |
| About label, helper, and 400 character max on the client | `src/lib/about.ts:3`, `src/pages/dashboard/ProfilePage.tsx:544` | `about rejects 401 characters and warns on contact details without blocking` | VERIFIED |
| Database check `profiles_bio_max_400` is NOT VALID so apply does not fail on old rows. New writes of 401 characters fail. | migration `:187` | Postgres test: 401 raises `profiles_bio_max_400`, 400 is stored, `convalidated` is false | VERIFIED |
| `list_directory` returns `about` and `city_key` only inside the existing hidden-member and partner opt-in query. Sample row sort order 1 has an Example line. Other samples have an empty About. | migration `:196`, `:256`, `:271` | `the pf3 migration bans search_path public and keeps directory rules` and the Postgres viewer checks | VERIFIED |
| About is plain text on the expanded card and on the intro request screen (the open request sits under that About) | `src/components/AboutText.tsx:3`, `src/pages/dashboard/DirectoryBoard.tsx:257` and `:283` | escape check in the directory filter test. Shots `pf3-directory-about-*` and `pf3-intro-about-*` | VERIFIED |
| An email or phone pattern in About shows "Do not add contact details here." It does not block the save. | `src/lib/about.ts:7` and `:17`, `src/pages/dashboard/ProfilePage.tsx:558` | `profile about warns when the text has an email or a phone` | VERIFIED. The warning copy is the brief's inferred line. Grade for the wording choice: INFERRED |
| Payload keys do not include email, phone, turnover, or capacity | `presentDirectoryCard` in `src/lib/demoRows.ts` and the directory JSON in the migration | directory filter test and the Postgres card key check | VERIFIED |
| New migration does not contain `search_path = public`. Replaced `list_directory` and the new definers use `set search_path = ''`. Anon cannot execute the new functions. | migration headers and revokes | `the pf3 migration bans search_path public and keeps directory rules` and the Postgres privilege checks. Existing `anon allowlist stays closed` still passes | VERIFIED |

## Not done, and why

- The About check is not validated in this migration. Live had 0 bios when the brief was written. The operator validates after the count below. UNKNOWN whether any bio longer than 400 exists on the day of apply.
- No Edge deploy and no migration apply from this PR.
- Boardroom, focus, profile page re-order, completeness, and Vision 2030 optionality stay out. No public page change.
- The city filter chip row is hidden when the loaded cards have no city. That is an empty state, not a second filter model.

## Email, parked

Nothing here sends mail. No new `sendEmail`, no `mail.ts` call, no `ADMIN_NOTIFY_EMAIL`. The same-city reason is stored on the suggestion row and shown in the app. If mail is switched on later, that existing reason string is what a message would quote. This PR does not turn that on.

## Secrets grade

VERIFIED. The diff has no live keys, tokens, passwords, staff names, or real member rows. Tests use `example.com` only. Sample directory ids already in the repo are not used; the example About line is selected by `sort_order = 1`.

## Shots

Example data only. `scripts/capture-pf3.mjs` at 1280 and 390:

- `pf3-city-other-*`: City set to Other, city name Abha
- `pf3-sectors-*`: sector chips including Real estate
- `pf3-directory-about-*`: expanded card with About
- `pf3-intro-about-*`: intro request with About above the reason
- `pf3-admin-sectors-*`: admin mandate sector list

## Apply list

1. Apply `supabase/migrations/20261210120000_sectors_city_about.sql` (sector list, `city_key`, mapping, About check NOT VALID, `list_directory` replace, grants). Do not apply it from the app or from CI.
2. Redeploy `suggest-intros`. It is the only function that imports `supabase/functions/_shared/suggest_intros.ts`. Redeploy after the migration, because the function selects `profiles.city_key`.
3. After deploy, run:

```sql
select count(*) from public.profiles where char_length(bio) > 400;
```

If that count is 0:

```sql
alter table public.profiles validate constraint profiles_bio_max_400;
```

4. Smoke: set a city from the picker for two test members who share that city. A dry run of suggest-intros should give a same-city reason that uses the city label.

## Local checks

`node scripts/build-for-csp-crawl.mjs` (tsc, vite, prerender) and `scripts/pages-artifact-gate.sh` passed.

`node --experimental-strip-types --test scripts/*.test.ts` after that build: 759 passed, 0 failed, 3 skipped. The PF-3 file's 9 tests are in that run, including the Postgres apply of every migration. A run before `dist/` existed failed only the two checks that require the build; those passed after it.
