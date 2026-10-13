# CS-1 handoff: demo content top-up

- Base: `main` at `143e23e6c553ee850ae430b6e4a7122f87cc0572` (the brief was read at `2db95a27`; one later commit landed first and does not touch this seed).
- Migration: `supabase/migrations/20261222120000_cs1_demo_seed_topup.sql`
- The operator applies it after review. This agent did not apply it, did not run a database push, did not deploy, and did not merge.

## What this adds

One data file. No table change, no function, no policy, and no grant.

| Surface | New rows | Ids | Flag |
| --- | --- | --- | --- |
| Directory | 4 | `c5100001-...` | `is_demo = true`, `include_in_public_aggregates = false` |
| Mandates | 4, published | `c5200001-...` | `is_demo = true` |
| Deal rooms | 2, open, opened by admin | `c5300001-...` | `is_demo = true` |
| Partners | 5, published | `c5400001-...` | `is_demo = true`, no partner-seat link |

Every insert uses `on conflict (id) do nothing` (`:82`, `:177`, `:213`, `:268`). A second run inserts nothing and changes nothing.

Directory people: Rana Al-Muzn, Huda Al-Sadir, Karim Al-Shatt, Lama Al-Wadi. Headlines are roles. Firms are invented. Portraits: `public/demo/portraits/{muzn,sadir,shatt,wadi}.svg`.

Mandates: Financial services, Digital infrastructure, Health, Logistics. Ticket bands stay in the existing band style. `exact_amount` is `Example figure, released after intro`. Contact mail is `example.com`. Contact phone is `Example line`. `deck_url` is null.

Rooms link to the payments mandate (host Rana Al-Muzn, 4 members) and the data-hall mandate (host Karim Al-Shatt, 3 members). Each summary ends `Opened by admin.`

Partners, one each, published, with an existing category slug a later Home fix can match:

| Firm | Name | `category_slug` |
| --- | --- | --- |
| Law firm | Bayt Counsel | `transaction-counsel` |
| Accounting and audit | Mizaan Audit House | `financial-due-diligence-and-tax` |
| Bank | Nahr Ledger Bank | `investment-banking` |
| Executive search | Example Search House | `placement-and-capital-introduction` |
| Insurer and advisory | Wifaq Cover House | `corporate-finance-advisory` |

No new category rows. The gallery test still expects 15 categories after every migration. New slugs would fail that check and would also change the public interest list. VERIFIED: those five slugs are seeded in `20261208120000_trusted_partners_gallery.sql:27-41`.

Removal stays commented at `:270-274`. Rooms go first, then mandates, then directory, then partners. No child rows are inserted. `mandate_intros` and room participants are not created. `rooms.mandate_id` and `rooms.host_directory_id` are `on delete set null` (`20260929120000_demo_seed_thresholds_redaction.sql:628-630`). `room_documents` and `room_participants` cascade from rooms. Partner intro requests cascade from `trusted_partners`.

## Labels

Directory, Mandates, Rooms, and Home teasers already render `Example` from `is_demo` (`src/components/ExampleMark.tsx`, `DirectoryBoard.tsx:220`, `MandateCard.tsx`, `RoomsBoard.tsx:20`, `HomeSnapshotView.tsx:448`). Partner examples already render `Example` (`src/components/SampleMark.tsx`). This PR does not change that UI. Home partner Example rows swap per category: a live partner hides only the example in its own category, and the other examples stay. That swap is done in PT-1 #174. They show on the member example gallery, labelled Example, while every published partner row is an example (`src/lib/trustedPartners.ts:4-7`).

## Email conflict

VERIFIED from `20260929120000_demo_seed_thresholds_redaction.sql:549`: `directory_entries` mail must end in `@boardarabia.test`. A data-only file cannot change that check. Directory mail uses that host. Mandate contacts use `@example.com`, which the later shape check allows (`20261206120000_staff_create_mandate.sql:12-15`). Partner rows have no mail column. `scripts/migration-hygiene.test.ts:18-21` allows this one filename so the directory host does not fail the example.com gate.

## Counts this seed does not feed

No `count(*)` reads `directory_entries`. VERIFIED by search on main plus this file.

- Directory real count counts `members` where `is_demo = false` (`20261210120000_sectors_city_about.sql:211-215`). Demo directory rows stay out of public aggregates by the check `include_in_public_aggregates = false`.
- The same member count, not a directory-row count, is what the earlier list functions use (`20261207120000_sponsor_directory_opt_in.sql:136`, and the copies in the avatar, area, refill, retention, and seat-sync migrations).
- Warm intros and board roles only test `exists` on `directory_entries` to refuse a sample id (`20261023120000_member_warm_intros.sql:61`, `20261123120000_re_board_roles.sql:601`).
- Intro suggestions read directory ids to skip samples (`supabase/functions/suggest-intros/index.ts:177`). This seed does not add auth users or members, so no mail audience can select them.

Demos stay visible while the real count is below the threshold (`src/lib/demoThreshold.ts:22-25`). Twelve demo directory rows do not hide demos. The switch is the real member count, threshold 12.

## RLS

This file has no `alter`, `create`, `drop`, `grant`, `revoke`, or policy statement. VERIFIED by `scripts/cs1-demo-seed.test.ts`. `directory_entries`, `mandates`, `rooms`, and `trusted_partners` keep the forced row security set in `20260929120000_demo_seed_thresholds_redaction.sql:561-562`, `:599-600`, `:639-640`, and `:657-658`.

Throwaway local replay (database created, checked, and dropped; not the hosted project): VERIFIED. After every migration, `relrowsecurity` and `relforcerowsecurity` are true on all four tables. Counts are directory 12 demo, mandates 10 demo, rooms 6 demo, partners 8 demo. Category rows stay 15. Running the same file again inserts 0 rows and leaves those counts unchanged.

## After the operator applies

- `directory_entries`: 12 demo.
- `mandates`: 10 demo, the four new rows published.
- `rooms`: 6 demo, the two new rows open.
- `trusted_partners`: 8 demo, the five new rows published.
- No Edge redeploy. Pages rebuild only because four portraits were added.

## Secrets

Grade: VERIFIED on the diff. Addresses are only `@boardarabia.test` and `@example.com`. No key, token, password, private booking link, staff allowlist, or hosted project id. No em dash. The new copy says partner. No package name and no currency amount outside the existing ticket bands.
