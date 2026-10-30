# UP-2 (P2-4) Fewer tab levels

Date: 30 Oct 2026
Base: `main` at `4d5914840fa588144e66d101bf04d6bf32d3d7d3`
Branch: `cursor/fewer-tab-levels-956a`

Screens: Deals, AI tools, Real estate, Majlis. The job is fewer tab levels after the SectionTabs wrap fix. Routes and `src/shell/destinations.ts` stay as they are.

No migration. No Edge deploy. No email. No force push. Not merged.

## What changed

Deals shows four short labels on one row: Mandates, Property, Seats, Rooms. The destination record still says Real estate, Board seats, and Deal rooms. The hrefs are the same. If a narrow width cannot hold the row, the same tabs fall back to a two by two grid. At 390 and 1440 the row fits, so the grid does not show.

AI tools no longer renders the Tools and Due diligence row. The tool cards and the AI Due Diligence card stay. Which tool cards appear still follows the flags. The fixture turns on CFO check and Deal readiness, so the shot shows those two plus AI Due Diligence.

Majlis keeps Upcoming and Past, and List and Calendar sit on that same row. Past hides List and Calendar. Choosing Calendar sets `?calendar=1`. That is a query on the existing Upcoming address, not a new route. Region and focus queries stay when the view changes.

Real estate keeps Opportunities, Firms, and Board roles as a header control (`data-re-header-control`), not as another destination row. On a wide screen it sits beside the title. On a phone it is one line under the title so the three labels stay at 15px and 44px. The only destination row on that page is Mandates, Property, Seats, Rooms.

A free account uses the same short Deals labels and does not get an AI tools tab row.

## Where

| Piece | Where |
| --- | --- |
| Short Deals labels | `src/shell/dealsTabLabels.ts:14` `dealsTabSections` |
| One row, or a two by two grid | `src/shell/SectionTabs.tsx:13` `fit="auto"` |
| Member Deals | `src/pages/dashboard/DealsLayout.tsx:14` |
| Free account Deals and AI | `src/pages/dashboard/account/AccountRoutes.tsx:105` and `:168` |
| AI tools row removed | `src/pages/dashboard/AiToolsLayout.tsx:4` |
| Majlis row | `src/pages/dashboard/MajlisLayout.tsx:14` |
| List and Calendar | `src/pages/dashboard/MajlisViewSwitch.tsx:1` |
| Calendar query | `src/pages/dashboard/majlisCalendarQuery.ts:1` |
| Majlis page reads the query | `src/pages/dashboard/MajlisPage.tsx:66` |
| Real estate header control | `src/pages/dashboard/RealEstateBoard.tsx:157` |

Locked and unchanged: `src/shell/destinations.ts`, `src/App.tsx` routes, People tabs, staff tabs.

## States

Loading, empty, and error still render on the four screens. Shots use the same shell.

- Deals uses the shared skeleton, the mandates empty line, and the mandates error with Retry.
- AI tools uses the real page: a skeleton while tools load, the empty tool note when none are on, and "Could not load the tool list. Retry." The AI Due Diligence card stays on the page, as it did before.
- Real estate uses the board loading, empty, and error states. The header control stays above them. The ready fixture has no cards, so the ready shot and the empty shot match. Loading and error are separate.
- Majlis uses the page skeleton, "No upcoming majlis.", and the majlis error with Retry. List and Calendar stay on the Upcoming row.

## Shots

Chrome headless, fixture only (`Example Member`, member@example.com). Not a physical phone. Viewport 390x844 and 1440x900.

Before, ready only: `before-deals-390.png`, `before-deals-1440.png`, `before-ai-390.png`, `before-ai-1440.png`, `before-real-estate-390.png`, `before-real-estate-1440.png`, `before-majlis-390.png`, `before-majlis-1440.png`.

After, ready and loading, empty, error, at both widths: `after-<screen>-390.png`, `after-<screen>-1440.png`, and the same names with `-loading`, `-empty`, and `-error`.

Measured on the ready screens:

| Screen | 390 | 1440 |
| --- | --- | --- |
| Deals tabs | One row. Mandates 98x44, Property 90x44, Seats 67x44, Rooms 78x44. 16px. No sideways scroll. | One row. Same labels, each at least 44px tall and 16px. |
| AI tools | No section tab row. CFO check, Deal readiness memo, and AI Due Diligence are on the page. | Same, in the sidebar shell. |
| Real estate | Deals row as above. Opportunities, Firms, and Board roles are 119x44 at 15px, on one line under the title. | Deals row, and the same control beside the title. |
| Majlis | Upcoming, Past, List, and Calendar share one top (69px). Each is at least 44px tall and 16px. List is 50px wide. | Same row. List is 52px wide. |
| Bottom bar | Five tabs: Home, Deals, People, Majlis, AI tools. Each about 78x47. | Sidebar, so the bottom bar is not shown. |

## Migration

None. Latest migration on main at the branch point is `supabase/migrations/20270113120000_seat_matching.sql`. No new file.

## Locks

Not touched: `scripts/public-nammco.mjs`, `scripts/prerender.mjs`, `scripts/check-pages-artifact.mjs`, `.github/workflows/pages.yml`, `src/content/legal/*`, `src/lib/aiReportOperator.ts`, the `/apply` route, mail-sending code, migrations, `src/shell/destinations.ts`.

No prices. No banned partner word in new user copy. The footer credit was not added. New copy is Mandates, Property, Seats, Rooms, List, and Calendar.

## Secrets

VERIFIED.

The diff adds no mailbox, API key, token, password, service-role key, project ref, or staff allowlist. The smoke fixture and the browser test use `https://example.supabase.co`, `example-anon-key`, and `member@example.com`. `.env` was not committed.

## Claims

- VERIFIED. Destination labels and hrefs are unchanged: Mandates, Real estate, Board seats, Deal rooms, and the AI tools pair Tools and Due diligence. `scripts/up-2-tabs.test.ts` and `scripts/shell-destinations.test.ts`.
- VERIFIED. The Deals screen renders Mandates, Property, Seats, Rooms and the four existing hrefs. It does not render the long names as tab text. `scripts/up-2-tabs.test.ts`.
- VERIFIED. At 390 and 1440 those four tabs are one row, at least 44 by 44, at 16px, with no sideways scroll. The two by two grid is present in code and did not activate at these widths. `scripts/up-2-tabs.test.ts` Chrome pass.
- VERIFIED. AI tools layout markup has no section tabs. The ready fixture shows CFO check, Deal readiness memo, and AI Due Diligence, and does not show a Due diligence tab. `scripts/up-2-tabs.test.ts`.
- VERIFIED. Upcoming, Past, List, and Calendar share one row at 390, each at least 44px. Past markup has no List or Calendar switch. `scripts/up-2-tabs.test.ts`.
- VERIFIED. Real estate keeps one destination tab row plus the header control. Opportunities, Firms, and Board roles are at least 44px and 15px. `scripts/up-2-tabs.test.ts` and `scripts/re-switch.test.ts`.
- VERIFIED. Phone primary navigation is five tabs. `scripts/up-2-tabs.test.ts` at 390.
- VERIFIED. `npx tsc -b` passed. `scripts/section-tabs.test.ts` passed.
- VERIFIED. Loading, empty, and error shots above still show the skeleton, the empty line, or the error with Retry.
- INFERRED. A member whose tool flags differ from the fixture sees the same cards as before this change, because card visibility was not edited. The tab row is gone for every flag combination.
- INFERRED. Safe-area padding on the shell is unchanged. `src/shell/AppShell.tsx` and the shell padding rules were not edited. Headless Chrome reports a zero inset.
- INFERRED. Bottom bar labels stay 12px. They measured 12px. That chrome was not part of this change. The new tab and view controls are 15px or 16px.
- UNKNOWN. A physical phone. Shots and the Chrome pass use headless Chrome.
- UNKNOWN. Live production until this merges and Pages deploys. No Edge deploy is required.
