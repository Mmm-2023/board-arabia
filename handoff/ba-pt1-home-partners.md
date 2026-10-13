# PT-1 Home Partners examples

Base: main `143e23e` (Clear the operator row and lock owner demotes, #170). No migration. No Edge deploy. Factory did not apply SQL and did not merge.

## Secrets grade

VERIFIED. The diff adds no mailbox, API key, token, password, service-role key, project ref, or staff allowlist. Fixture addresses are example.com only, and only inside the screenshot script as `example.supabase.co`. `.env` is not in the commit.

## What changed

Home Partners shows published example rows, each marked Example, while that category has no live partner. A live partner hides only the example in its own category. The other examples stay. The heading stays Partners.

Trusted advisers are unchanged: a real row that is not a partner seat still renders under Trusted advisers, and an example never does. The member and public galleries outside Home still use `visibleMemberPartners`, so those galleries still drop every example once any real row is in their list.

| Claim | Where | Grade |
| --- | --- | --- |
| An example stays until a live partner shares its category. | `src/lib/homeNeeds.ts:159-168` | VERIFIED |
| Home no longer drops every example when any real row exists. Category travels with the row. | `src/lib/homeSnapshot.ts:539-540`, `:571-580` | VERIFIED |
| The loader keeps `category_slug` from the partner list. | `src/lib/homeSnapshotLoad.ts:74` | VERIFIED |
| Example rows render the existing Example mark. Live rows do not. | `src/pages/dashboard/HomeSnapshotView.tsx:61`, `:397` | VERIFIED |
| Zero live rows: five examples, each marked Example. One live bank: the bank example is hidden and the other four stay. The adviser row stays under Trusted advisers. | `scripts/home-snapshot.test.ts:633` | VERIFIED |

## Data dependency

The example names are not hardcoded in the app. Home displays the rows it receives. The current member list still returns either every published example or every published live row, not both (`supabase/migrations/20261216120000_sec_c_definer_grants.sql:87-89`). This PR does not change that function. The per-category swap is verified when both kinds of row are in the list. Until that list includes the other categories' examples beside a live partner, those examples cannot appear. Whether a later data change returns both kinds: UNKNOWN until that change lands. The filter text in the migration file: VERIFIED.

## Migration

None. No new slot. Nothing applied.

## Shots

`scripts/capture-pt1-home-partners.mjs` opens Home with See more open. Fixture states are `partners-examples` (five Example rows) and `partners-bank` (the bank example replaced by Harbour Clearing). Widths 1440 and 390. Output directory: `/opt/cursor/artifacts/pt1-home-partners/`.
