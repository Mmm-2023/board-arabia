# UP-1 (P2-2) Due Diligence report titles

Date: 30 Oct 2026
PR: https://github.com/Mmm-2023/board-arabia/pull/226
Base: `main` at `f33a4362811d885e9a2fe1d4fbbb53415cd2561a`
Branch: `cursor/up-1-dd-title-mojibake-dc14`

Screen: `/dashboard/ai/due-diligence` and a report title. The job is to read a report name without stray characters from the deck or the file name.

No migration. No Edge deploy. No email. No force push. Not merged.

## What changed

File names and deck titles are repaired before they are stored, and again when a member reads an older row.

1. UTF-8 that was read as Latin-1 is decoded again, including a second pass when the mistake happened twice. The Windows-1252 form of the same mistake (the visible `â€œ` pattern) is included.
2. U+00D2 and U+00D3, which are Mac Roman curly quotes `“` and `”` read as Latin-1, become quotes and are removed.
3. Leading and trailing straight quotes and curly quotes are removed. Curly double quotes left in the middle of a title (the closing Mac Roman quote) are removed too. An apostrophe inside a name such as O'Brien stays.
4. If odd characters remain, the title falls back to the file name. A normal name is unchanged.

## Where

| Step | Where |
| --- | --- |
| Repair | `supabase/functions/_shared/deck_title.ts:137` `repairDeckLabel` |
| File name fallback | `supabase/functions/_shared/deck_title.ts:155` `cleanCompanyName` |
| Stored company | `supabase/functions/_shared/due_diligence.ts:935` `persistCompanyLabel` |
| Deck title and file name | `supabase/functions/_shared/due_diligence.ts:552`, `:280`, `:1500` |
| Model company | `supabase/functions/_shared/deck_analysis.ts:598` and `due_diligence.ts:1625` |
| List title | `src/lib/recentReports.ts:259` `reportListTitle` |
| Report heading | `src/pages/dashboard/DueDiligencePage.tsx:635` |
| Memo name and company field | `src/pages/dashboard/DueDiligenceReport.tsx:46` |

Helper text on the desk and the report that was 0.92rem (14.72px) is now 0.95rem (15.2px). Status pills stay 13px.

## Edge redeploy (needs OK)

Do not deploy until this is accepted. No migration.

Redeploy these functions. They bundle `supabase/functions/_shared/due_diligence.ts`, which now imports the repair.

| Function | Why |
| --- | --- |
| `due-diligence-start` | Writes `file_name` and `company_label`. This is the behaviour change. |
| `due-diligence-status` | Imports the shared module. Redeploy so the bundle matches. |
| `due-diligence-step` | Imports the shared module. Redeploy so the bundle matches. |

Older rows are not rewritten. The list and the report heading repair them on display.

## Migration

None. Latest migration on main is `supabase/migrations/20270111120000_application_withdrawn_closed_retention.sql`. The next free slot after `20270112120000` was not used.

## Shots

Chrome headless, fixture only (`Example Member`, example.com). Not a physical phone.

- `list-390.png`, `list-1440.png`: prior notes. Titles are Northwind Logistics, Made In KSA Gateway to Centralized Economy, and Harborline Robotics. The second name was stored as U+00D2 / U+00D3 around the words. The third name was an odd character and fell back to the file name.
- `title-390.png`, `title-1440.png`: the report heading and the memo name are Made In KSA Gateway to Centralized Economy.
- `loading-390.png`, `loading-1440.png`: heading and the loading bars.
- `empty-390.png`, `empty-1440.png`: "No checks yet. Your reports will show up here."
- `error-390.png`, `error-1440.png`: the alert and Retry.

The round figures on the title shot (18,000,000 USD and 20,000,000 USD) are the existing memo fixture. This change does not add a price or a package name.

## Locks

Not touched: `scripts/public-nammco.mjs`, `scripts/prerender.mjs`, `scripts/check-pages-artifact.mjs`, `.github/workflows/pages.yml`, `src/content/legal/*`, `src/lib/aiReportOperator.ts`, the `/apply` route, mail-sending code, migrations.

No prices added. No banned partner word in new user copy. nammco was not added.

## Secrets

VERIFIED.

The diff adds no mailbox, API key, token, password, service-role key, project ref, or staff allowlist. Tests and the fixture use `https://example.supabase.co` and `example-anon-key`. Addresses in the shots are example.com. `.env` was not committed.

## Claims

- VERIFIED. `repairDeckLabel` turns U+00D2 / U+00D3, straight quotes, curly quotes, one Latin-1 misread, a second Latin-1 misread, and the Windows-1252 `â€œ` form into a plain name. `Jahez International Company`, `Northwind Logistics`, and `O'Brien Holdings` stay as they are. `scripts/deck-title.test.ts`.
- VERIFIED. A title that still has an odd character falls back to the file name. An empty company does not. `scripts/deck-title.test.ts`.
- VERIFIED. `safeFileName`, `extractDeckFacts`, `preferredCompany`, and `presentReport` store and show the repaired name. A normal file name and `../secret.pdf` stay on the old result. `scripts/deck-title.test.ts`.
- VERIFIED. The prior-notes list still cleans the spaced-cap title and the Mac Roman quote title, and it does not render U+00D2 or U+00D3. `scripts/prior-notes.test.ts` and `scripts/w1d-help-fixes.test.ts`.
- VERIFIED. `scripts/due-diligence.test.ts`, `scripts/due-diligence-edge-sync.test.ts`, and `scripts/deck-analysis.test.ts` passed locally after the repair.
- VERIFIED. At 390 and 1440, the list and the report title have no U+00D2 or U+00D3, body text in the screen is at least 15px (13px on status pills), and buttons, links, and the checkbox row are at least 44px. `scripts/dd-title-shots.test.ts`, run locally. On GitHub Actions that browser pass is skipped, because the smoke compile does not finish inside the parallel suite. The title logic in `scripts/deck-title.test.ts` still runs there.
- VERIFIED. Loading still renders the busy skeleton, empty still says "No checks yet. Your reports will show up here.", and error still shows the alert with Retry. Shots above.
- INFERRED. A signed-in member with an older row whose `company_label` still contains U+00D2 and U+00D3 sees the repaired list title and report heading, because both go through `reportListTitle`. The database row is unchanged until a new check is stored.
- INFERRED. New checks store a repaired `company_label` only after `due-diligence-start` is redeployed. Until then, display repair still covers the heading and the list.
- UNKNOWN. A physical phone. Shots are headless Chrome.
- UNKNOWN. Live production until this merges, Pages deploys, and the three Edge functions above are redeployed with an OK.
