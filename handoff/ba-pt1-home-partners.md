# PT-1 Home Partners examples

Base: main `143e23e` (Clear the operator row and lock owner demotes, #170). Migration `20261226120000_home_partner_examples.sql` is in the repo and was not applied. No Edge deploy. Factory did not merge.

## Secrets grade

VERIFIED. The diff adds no mailbox, API key, token, password, service-role key, project ref, or staff allowlist. Fixture addresses are example.com only, and only inside the screenshot script as `example.supabase.co`. `.env` is not in the commit.

## What changed

Home Partners shows published example rows, each marked Example, while that category has no live partner. A live partner hides only the example in its own category. The other examples stay. The heading stays Partners.

Trusted advisers are unchanged: a real row that is not a partner seat still renders under Trusted advisers, and an example never does. The member and public galleries outside Home still use `visibleMemberPartners`, so those galleries still drop every example once any real row is in their list.

| Claim | Where | Grade |
| --- | --- | --- |
| One example per category. An example with no category is omitted. | `src/lib/homeNeeds.ts:159-172` | VERIFIED |
| The member list returns a published example only when its category has no live partner, skips uncategorised examples, and keeps one example per category. Grants match SEC-C. | `supabase/migrations/20261226120000_home_partner_examples.sql` | VERIFIED in the file. Replay of the filter: the gallery SQL test. |
| Home no longer drops every example when any real row exists. Category travels with the row. | `src/lib/homeSnapshot.ts:539-540`, `:571-580` | VERIFIED |
| The loader keeps `category_slug` from the partner list. | `src/lib/homeSnapshotLoad.ts:74` | VERIFIED |
| Example rows render the existing Example mark. Live rows do not. | `src/pages/dashboard/HomeSnapshotView.tsx:61`, `:397` | VERIFIED |
| Zero live rows: five examples, each marked Example. One live bank: the bank example is hidden and the other four stay. The adviser row stays under Trusted advisers. | `scripts/home-snapshot.test.ts:633` | VERIFIED |

## Migration

`supabase/migrations/20261226120000_home_partner_examples.sql` replaces `private.list_trusted_partners_impl`. It does not have to be the newest file. Grants are the SEC-C set: revoke from public, anon, authenticated, and service_role, then execute for anon and authenticated only. `search_path` is empty. Not applied. No `db push`. Hosted state after a later apply: UNKNOWN until the operator applies it.

## Shots

`scripts/capture-pt1-home-partners.mjs` opens Home, clicks See more, and captures one viewport the height of the page. Fixture states are `partners-examples` (five Example rows) and `partners-bank` (Dar Clearing replaced by Harbour Clearing, with no Example mark). Widths 1440 and 390.

| State | 1440 | 390 |
| --- | --- | --- |
| Five Example rows | `home-partners-examples-1440.png` | `home-partners-examples-390.png` |
| Bank example replaced | `home-partners-bank-1440.png` | `home-partners-bank-390.png` |

Files are in `/opt/cursor/artifacts/pt1-home-partners/`. The four shots show See less, the Partners heading, and the rows above. VERIFIED by reading each image.
