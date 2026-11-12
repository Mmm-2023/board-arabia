# AI-UX-1 audit

Surface: member AI Due Diligence. Routes under `/dashboard/ai`, especially `/dashboard/ai/due-diligence` (start, report list, report). UI only. No Edge function, migration, database, or RLS change.

Shots use example data only: Example Member, Example Co, Example Cold Chain, Example Corridor, Example Gateway. No member mailbox.

Checklists applied:

- Board Arabia UX UI: decision first; same destinations on desktop and mobile; calm, high-signal density; AI labelled, scoped, sourced, structured findings, score and next questions, human handoff; designed empty, loading, error, and permission states; no fake proof or fake KPIs.
- Dashboard UX desktop and mobile: one primary action per view; mobile tables as card rows; honest states with last-updated where relevant; tab bar for navigation only; safe areas.

## Before

Captured from the current desk and report, inside the member shell, at 390 and 1440.

| Problem | Checklist | Priority |
| --- | --- | --- |
| The start screen showed the native file control ("Choose File"), a primary "Choose PDF or PPTX", and a second disabled "Choose a deck first". The report list sat under that whole form, including at 1440. | Dashboard: one primary, then the list. UX UI: calm density, decision first. | P1 |
| `sr-only` is not in this Tailwind build, so the file input stayed on screen at about 20px tall. | Dashboard: 44px targets. | P1 |
| Prior-note rows stacked a long title and squeezed the score, the tag, and the date into one wrapping line. "Example Corridor..." ran on without a clean end. | Dashboard: card rows, 2 or 3 fields, truncate. | P1 |
| Empty copy said "No checks yet" and had no call to action. | Both: designed empty state with one action. | P1 |
| "looks clear" used the conflict pill (red). The positive verdict read as a warning. | UX UI: decision first. Score is not colour alone, and the colour must match the words. | P1 |
| "Not verified" was the short label for both "not publicly verifiable" and "insufficient public data". Those two statuses differed by colour alone. | UX UI: not colour alone. | P1 |
| The score tag was 13px. Contrast of muted `#4a4468` on porcelain `#f6f5fb` is 8.36:1, so it already cleared WCAG 2.2 AA. It was still small next to the score. Pill text colours also cleared 4.5:1 (consistent 5.49, neutral 7.17, insufficient 5.02, conflict 5.52). | UX UI: readable score tag. Body text at least 15px. | P2 |
| Loading was four plain bars, not the button and card rows of the ready page. | Both: skeleton matches the final layout. | P2 |
| A failed load said "Couldn't refresh. Showing last update" when no report list was on screen. Retry was present. | Both: honest error. No fake last update. | P2 |
| The report page title was the company name, and the memo repeated it. "AI Due Diligence" left the report. Questions for management were listed twice. | UX UI: no duplicate headings, no clutter. Keep the feature name. | P2 |
| List rows were square while report cards were rounded. | UX UI: consistent card radius with the indigo and porcelain tokens. | P3 |

Kept on purpose, before and after: the name AI Due Diligence, the numeric score, "looks clear", the notice once at the top of a report, the short tag beside a score, the not-advice line, and the scope line. No "vetted", "verified", or "selective". No endorsement of a user or a deal. English only. The public nammco string stays in the existing footer only.

## After

| Check | Result | Evidence |
| --- | --- | --- |
| Decision first | PASS | Report opens with the notice, then "Posture: looks clear" and the score. Start opens with the title, the limit line, and one action. |
| Same destinations | PASS | Home, Deals, People, Majlis, AI tools. Sidebar at 1440. Bottom tabs at 390. No destination copy changed. |
| Calm density, one primary | PASS | Idle shows "Start a review" only. The deck form opens from that control. "Check this deck" is the primary once a file is chosen. |
| AI labelled, scoped, sourced, findings, score, next questions, handoff | PASS | Disclaimer and "Provided by Board Arabia" stay above the action. Notice once. Tag beside each numeric score. Findings, sources, and next questions stay. |
| Empty, loading, error, permission | PASS | Empty states why and offers "Start a review". Skeleton is a button bar plus card rows. Error is "Could not load these reports." with Retry. Permission copy is unchanged. |
| No fake proof or fake KPIs | PASS | Shots use Example Co and example report names. The error no longer claims a last update is on screen. |
| Card rows, truncated titles | PASS | Phone list shows title, score plus tag, and date. The long example title ends in "...". `scripts/dd-title-shots.test.ts` found no horizontal overflow at 390 or 1440. |
| Score tag readable, not colour alone | PASS | Tag is 15px ink on porcelain (15.83:1). "Not enough" and "Not verified" are different words. "looks clear" uses the consistent pill. |
| Tap targets, 15px body, focus, logical properties, safe area | PASS | Title-shot test found no control under 44px and no body text under 15px on the list and report. Focus uses the existing outline. Inline borders and padding use logical properties. Safe-area padding stays on the shell. A physical phone was not used. |
| Tab bar is navigation only | PASS | The tab bar was not given a page action. |
| Last updated where relevant | PASS | The shell still shows "Updated 09:15". Each note shows its date. The report shows Prepared. |

`scripts/ai-ux-1.test.ts`, `scripts/dd-title-shots.test.ts`, `scripts/due-diligence.test.ts`, `scripts/ai-dd-safeguards.test.ts`, `scripts/deck-analysis.test.ts`, `scripts/prior-notes.test.ts`, and `scripts/migration-hygiene.test.ts` passed locally, including the source check for a private key.
