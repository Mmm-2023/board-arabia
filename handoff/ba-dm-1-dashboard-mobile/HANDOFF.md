# DM-1 dashboard mobile P1

Date: 30 Oct 2026
Base: `main` at `b6a2047e1d931d226aa699008c00c7d44ec80439`
Review: the 29 Oct member dashboard review (P1-1, P1-2, P1-3 only)

## Surface

Member dashboard on a phone. The job is to see what needs you, then take the next action.

Skills applied: Dashboard UX desktop and mobile, and Board Arabia UX/UI.

Destinations stay the same five, in the same order, on the phone tab bar and the desktop sidebar:

- Home: see what needs you and take the next action
- Deals: open mandates, real estate, board seats, and deal rooms
- People: find a member and ask for an introduction
- Majlis: see gatherings
- AI tools: open the labelled tools

Phone keeps the bottom tabs. Desktop keeps the sidebar. Empty, loading, and error states were left as they are. Safe-area classes were not edited.

## What changed

1. Tap targets on the pages in the review are at least 44 by 44px. The hit area grows by minimum width or a full-width row. The label size stays the same.
2. On a phone, body text on Home, Profile, and Mandates is 16px. Smaller copy classes inside those pages are raised to 16px as well. Status chips marked `data-chip` stay at their own size. Desktop type is unchanged.
3. On a phone, Next action and Invite peer sit above the fold, ahead of Needs you, the weekly intros nudge, and the Example note. At 768px and up the previous order stays: Needs you, This week, the Example note, then Next action.

## Files

| Change | Where |
| --- | --- |
| Phone order and the 16px marker | `src/pages/dashboard/HomeSnapshotView.tsx:95`, `:195`, `:230` |
| Phone type floor | `src/index.css:1422` |
| Directory More | `src/pages/dashboard/DirectoryBoard.tsx:268` |
| Real estate More | `src/pages/dashboard/OpportunityCard.tsx:119` |
| Profile checklist row | `src/pages/dashboard/ProfilePage.tsx:785` |
| Profile capacity checkbox | `src/pages/dashboard/ProfilePage.tsx:681` |
| Intros Fill it in | `src/pages/dashboard/IntroSuggestions.tsx:46` |
| Intros and filter chips, including All | `src/pages/dashboard/MemberFilters.tsx:151` |
| Help links and question rows | `src/pages/dashboard/HelpPage.tsx:91`, `:108` |
| Mandates phone type root | `src/pages/dashboard/MandatesPage.tsx:52` |
| Guard | `scripts/dm1-mobile.test.ts` |
| Fixture used for the shots | `scripts/smoke/dm1.html`, `scripts/smoke/dm1-main.tsx` |

## Shots

Fixture member only (`Example Member`, `member@example.com`). 390x844 unless named `d_home` (1440x900). Chrome headless, not a physical phone.

Before is the same fixture on the code at `b6a2047`. After is this branch.

- `before/m_home.png`, `after/m_home.png`
- `before/m_directory.png`, `after/m_directory.png`
- `before/m_profile.png`, `after/m_profile.png`
- `before/m_intros.png`, `after/m_intros.png`
- `before/m_help.png`, `after/m_help.png`
- `before/m_mandates.png`, `after/m_mandates.png`
- `before/d_home.png`, `after/d_home.png`

The two 1440 home files are byte for byte the same.

The 29 Oct production shots were not copied here. The profile shot in that set shows a member email address. This repo is public.

## Claims

- VERIFIED. At 390px on the fixture, every measured link, button, summary, and visible input on Home, Directory, Profile, Intros, Help, and Mandates is at least 44px wide and 44px tall. Links inside a sentence, and the hidden file input, are not counted. Test: `scripts/dm1-mobile.test.ts`, run locally. On GitHub Actions that browser pass is skipped, because the smoke compile does not finish inside the parallel suite. The source guard in the same file still runs there.
- VERIFIED. Directory More is `min-h-12 min-w-11` (`DirectoryBoard.tsx:268`). The fixture card's More control is in that measurement.
- VERIFIED. Each profile checklist row is one full-width link with `min-h-11` (`ProfilePage.tsx:788`).
- VERIFIED. Intros "Fill it in" is `min-h-12 min-w-11` (`IntroSuggestions.tsx:46`). The All chip is `min-h-11 min-w-11` (`MemberFilters.tsx:151`).
- VERIFIED. Help account links, answer links, and the Profile link are `min-h-11 min-w-11`. Each question row is a full-width summary with `min-h-11` (`HelpPage.tsx:108`). The native disclosure marker is hidden so it is not a separate small target.
- VERIFIED. On the fixture at 390px, text inside Home, Profile, and Mandates (`data-phone-body`) is at least 15px, except `data-chip` status marks. The phone rule sets that copy to 16px (`index.css:1422`).
- VERIFIED. On the fixture at 390px, the Invite peer control sits above the tab bar, and above Needs you and the Example note. `after/m_home.png`.
- VERIFIED. On the fixture at 1440px, Needs you and the Example note stay above Next action, and the Example note stays under 15px. `before/d_home.png` and `after/d_home.png` match byte for byte.
- VERIFIED. None of those seven after screens overflow sideways.
- VERIFIED. Source order in `HomeSnapshotView` is still Needs you, This week, then Next action. `scripts/home-snapshot.test.ts` passed with example Supabase env.
- INFERRED. A signed-in member with the same blocks (two-step off, weekly intros incomplete, an example card, invites left) sees the same phone order, because the order is CSS on `HomeSnapshotView`, not on the fixture.
- INFERRED. Real estate More meets 44px because it uses the same `min-h-11 min-w-11` classes the directory More button measured. No real estate shot in this handoff.
- UNKNOWN. A physical iPhone. These shots are headless Chrome. Safe-area padding was not changed.
- UNKNOWN. Live production until this merges and the Pages deploy runs.

## Locked files

Not edited: `scripts/public-nammco.mjs`, `prerender.mjs`, `scripts/check-pages-artifact.mjs`, `.github/workflows/pages.yml`, `src/content/legal/*`, `src/lib/aiReportOperator.ts`, the `/apply` route, mail-sending code.

## Migration

None. No Edge function. No database change.

## Secrets

Grade: VERIFIED.

The handoff shots and the new fixture use `member@example.com` and `https://example.supabase.co` with the placeholder anon key `example-anon-key`. No staff mailbox, no live key, and no production screenshot was added. `.env` was not committed.
