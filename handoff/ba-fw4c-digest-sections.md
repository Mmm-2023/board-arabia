# BA FW4c handoff: weekly digest in six fixed sections

Base is `bdb2a45` (PR #159). This change does not edit `supabase/migrations/20261212120000_weekly_digest.sql` or `supabase/migrations/20261214120000_digest_review_tiers.sql`. The new file is `supabase/migrations/20261218120000_digest_sections.sql`. No Edge deploy. No schedule. No mailbox. Factory does not apply migrations.

Apply `20261218120000_digest_sections.sql` via MCP after `20261214120000_digest_review_tiers.sql`. On file, `20261215120000_daily_market_brief.sql` is also earlier. Slots `20261216120000` and `20261217120000` are used by other open work. Do not treat this file as the newest migration.

Secrets grade: VERIFIED. The diff has no API keys, service-role keys, live tokens, staff names, or mailbox allowlists. Tests and the smoke page use example.com and example.org only. The one address in member copy is the public contact `contact@boardarabia.com`, and it is not stored in SQL.

## What members see

The page is still `/dashboard/digest`. Home still links there. Home layout is unchanged (`src/pages/dashboard/HomeSnapshotView.tsx:95`).

| Item | Where | Grade |
| --- | --- | --- |
| Six sections, fixed order: Boardroom and markets, Deals and investments, On the platform, New on the database, Majlis and dates for the diary, Partner spot | `DIGEST_SECTION_ORDER` in `supabase/functions/_shared/weekly_digest_copy.ts` | VERIFIED |
| A hidden section is omitted from the list and the body | `visibleDigestSections` in `src/lib/weeklyDigest.ts:364`, rendered in `src/components/digest/WeeklyDigestView.tsx:70` | VERIFIED |
| Masthead: issue number, date, read time, opening, and In this issue | `WeeklyDigestView` in `src/components/digest/WeeklyDigestView.tsx:27` | VERIFIED |
| News items: headline, 2 to 3 sentences, Board lens when present, source links. A name is a LinkedIn link only when the stored URL is https on linkedin.com | `WeeklyDigestView` news block, `digestLinkedinUrl` in `src/lib/weeklyDigest.ts` | VERIFIED |
| Section 4 outline: title, sector, region, stage, one line. No counterparty name and no ticket band | `DatabaseBlock` in `WeeklyDigestView.tsx` | VERIFIED |
| One call to action, after section 4: Review this week's mandates | `DIGEST_CTA_LABEL` at `WeeklyDigestView.tsx:24`, link at `:83` | VERIFIED |
| Sign-off uses `legalField('contactEmail')` and renders nothing when that field is unset. Footer credit is the only nammco text: powered by nammco | `WeeklyDigestView.tsx` sign-off, footer credit constant | VERIFIED |
| Approved issue only, same tier gate as before. `mail_ready` stays false | `public.my_weekly_digest()` in `20261218120000_digest_sections.sql:551` | VERIFIED |

## Section 4 visibility

Auto-fill still comes from `private.digest_build_payload()` in `20261212120000_weekly_digest.sql`, which calls `private.digest_member_visible`. The member read in this migration filters both `new_members` and `key_members`.

| Row | Rule | Staff auto-fill | Member read | Partner read |
| --- | --- | --- | --- | --- |
| `directory_hidden` | `private.digest_member_visible` is false | Excluded | Excluded | Excluded |
| `is_demo` | `private.digest_member_visible` requires `is_demo = false` | Excluded | Excluded | Excluded |
| `private.sample_subject` | Same visibility function | Excluded | Excluded | Excluded |
| Directory opt-in off (`show_card_to_sponsors` false) | `private.caller_sees_member_card` | Included in the staff snapshot | Included | Excluded |
| Directory opt-in on | `private.caller_sees_member_card` | Included | Included | Included |
| Admin removes a row | Saved payload omits it | Gone after save | Gone | Gone |

Grade: VERIFIED in `scripts/digest-sections-db.test.ts`. A hidden or demo id placed in `key_members` is dropped on read. A partner does not see a member who has not opted in. A member still does. Mandate auto-fill does not copy `company_name` or contact fields.

## What admin can edit

| Item | Where | Grade |
| --- | --- | --- |
| Edit, add, or remove items in every section. Hide a whole section. Tier picker unchanged | `src/components/digest/DigestDraftEditor.tsx:69` and `:133` | VERIFIED |
| Section order is fixed. There is no reorder control | `DigestDraftEditor.tsx:69` | VERIFIED |
| Save requires a headline, 2 to 3 sentences, and a source on each news item. Visible news sections need 2 to 4 items. Links must be http or https. LinkedIn links must be https on linkedin.com. Length caps stay in `digest_plain` / `digest_clean_list` | `validateDigestForSave` in `src/lib/weeklyDigest.ts:392`. Server checks in `private.digest_clean_news` at `20261218120000_digest_sections.sql:150` | VERIFIED |
| Sections are stored on the existing `digest_issues.payload` jsonb. No new table | `private.digest_store_payload` at migration `:455` | VERIFIED |

## Email stays off

`mail_ready` is forced false in `digest_store_payload` and `my_weekly_digest`. `send_enabled` is untouched. `public.digest_issue_sendable` is unchanged. No `sendEmail`, no cron, no new Edge function, no workflow schedule. The unsent letter template can list the new sections and still has no nammco text and no address.

## Apply

1. Apply `supabase/migrations/20261218120000_digest_sections.sql` via MCP after `20261214120000_digest_review_tiers.sql`.
2. Do not deploy an Edge function.
3. Do not connect a mailbox and do not add a schedule.

## Not done

- No live send, no cron, no mailbox.
- Home layout is untouched apart from the existing link to `/dashboard/digest`.
- `src/lib/database.types.ts` did not need new RPC names. The save signature is unchanged.

## Checks

`node --experimental-strip-types --test scripts/digest-sections.test.ts scripts/digest-sections-db.test.ts scripts/weekly-digest.test.ts scripts/weekly-digest-db.test.ts` passed locally. The new database test names `20261218120000_digest_sections.sql` and checks that it sorts after `20261214120000_digest_review_tiers.sql`. It does not assume the file is the newest migration.

Shots, 1440 and 390, all six sections, example.com links: `/opt/cursor/artifacts/fw4c-digest-sections/digest-member-1440.png`, `digest-member-390.png`, `digest-admin-1440.png`, `digest-admin-390.png`.
