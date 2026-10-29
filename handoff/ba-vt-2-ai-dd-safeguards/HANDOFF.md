# VT-2 AI Due Diligence safeguards

PR: https://github.com/Mmm-2023/board-arabia/pull/213
Branch: `cursor/vt-2-ai-dd-safeguards-f038`
Base: `main` at `e713d64e569e206ade03e1dc3fc5098305ac6dc2` (PR #212, already merged)
Date: 29 Oct 2026

## Surface

Member AI Due Diligence. The job is to read an automated deck check, then do your own diligence.

Skills applied: Board Arabia UX/UI, and Dashboard UX desktop and mobile. This is a `/dashboard` surface. Destinations stay Home, Deals, People, Majlis, AI tools. Desktop keeps the sidebar. Phone keeps the bottom tabs. Empty, loading, error, and permission states on the desk were left as they are.

## What changed

The notice is one constant, `AI_DD_SCORE_NOTICE`, in `src/lib/aiDueDiligenceNotice.ts:7`. The only component is `AiDueDiligenceScoreNotice` in `src/components/ai/AiDueDiligenceScoreNotice.tsx:4`. The sentence is:

`Automated check, not due diligence, a rating or an endorsement. Do your own due diligence.`

The stored posture value stays `pass`. Members see `looks clear` from `AI_DD_PASS_DISPLAY` at `src/lib/aiDueDiligenceNotice.ts:11`. `POSTURE_LABEL.pass` in `supabase/functions/_shared/deck_analysis.ts:140` is still `Pass` and is no longer rendered. No migration.

The name stays AI Due Diligence. The numeric score stays.

## Surfaces

| Surface | Where | What members see |
| --- | --- | --- |
| Detail, overall score | `src/pages/dashboard/DueDiligenceMemo.tsx:68` and `:81` | Score, then the notice. Chip uses `memberPostureLabel` at `:318`. |
| Detail, area score cards | `src/pages/dashboard/DueDiligenceMemo.tsx:344` | Notice under each bar that has a number. A missing bar has no notice. |
| Claims overview | `src/pages/dashboard/DueDiligenceReport.tsx:128` | Notice when the overview states a percent. |
| Percent cards | `src/pages/dashboard/DueDiligenceReport.tsx:289` | Notice under each percent. |
| Prior notes list | `src/pages/dashboard/DueDiligencePage.tsx:787` | Notice when the row is `N% publicly consistent`. `No percentage` and `Public checks not run` stay bare. |
| Locked account sample | `src/pages/dashboard/account/views.tsx` `AccountAi` | Same memo component, so the sample score carries the notice. File not edited. |

Not a score, so no notice: the running-check progress percent, and the AI tools recent list (title and date only).

## Shot

`handoff/ba-vt-2-ai-dd-safeguards/score-notice-390.png`

390x844. Pass fixture. Overall 4 of 5, label `looks clear`, notice directly under the score. Bottom tabs: Home, Deals, People, Majlis, AI tools. Content sits above the tab bar. Fixture copy uses example.com.

## Edge

No Edge file changed. No function needs a redeploy.

`POSTURE_LABEL` still says `Pass`, and nothing in the member UI reads it. Searched member mail copy (`transactional_copy.ts`, `invite_copy.ts`, digest). No member email includes an AI Due Diligence score. The start alert text is `an AI Due Diligence run` with no score (`supabase/functions/due-diligence-start/handle.ts`). There is no PDF or export of the score. The on-screen report is the print view, so the notice is in that HTML.

## Claims

- VERIFIED. The notice string exists only in `src/lib/aiDueDiligenceNotice.ts`. `scripts/ai-dd-safeguards.test.ts` walks `src`.
- VERIFIED. A pass draft renders Overall 4 with the notice in the same block, nine numbered area bars each carry the notice, and visible text does not contain the word pass. The attribute `data-dd-posture="pass"` stays. Test: `scripts/ai-dd-safeguards.test.ts`.
- VERIFIED. Claims view puts the notice on the percent cards. The prior-notes list puts it on `40% publicly consistent` and not on `No percentage` or `Public checks not run`.
- VERIFIED. Stored label map is unchanged: `POSTURE_LABEL.pass` is still `Pass`. `POSTURES` still includes `pass`. No migration.
- VERIFIED. `scripts/deck-analysis.test.ts`, `scripts/due-diligence.test.ts`, and `scripts/prior-notes.test.ts` passed locally. The member-copy scan still rejects the word pass in the desk page, the report page, and the copy modules.
- VERIFIED. 390 shot shows the score, the notice, `looks clear`, and the five phone tabs. Sidebar element is still in the shell (`aside[aria-label="Primary"]`) and is the desktop nav. Safe-area classes in `src/index.css` (`.shell-safe-bottom`, `.shell-main` tab padding) were not edited.
- VERIFIED. Empty, loading, error, and permission branches in `DueDiligencePage` were not edited. Desk status tests in `scripts/due-diligence.test.ts` passed.
- INFERRED. The conflict pill on stored posture `pass` is unchanged (`DueDiligenceMemo.tsx:320`). The model prompt still treats that stored value as the contradicted-claim posture. Members now read `looks clear` on that chip. Color was left alone because this brief is display text only.
- INFERRED. Account preview and any other caller of `DueDiligenceMemo` or `DueDiligenceReport` pick up the notice without a separate edit.
- UNKNOWN. A hand-pasted score in a future email that is not in this repo. Nothing in repo mail includes one.
- UNKNOWN. Live production until this merges and the Pages deploy runs. No Edge redeploy is required for this change.

## Locked files

Not edited:

- `scripts/public-nammco.mjs`
- `prerender.mjs`
- `scripts/check-pages-artifact.mjs`
- `.github/workflows/pages.yml`
- `src/content/legal/*`
- `src/lib/aiReportOperator.ts`
- the `/apply` route and `scripts/apply-route.test.ts`
- mail-sending code
- PR #212 files: `handoff/ba-vt-1-vetting-claims/*`, `index.html`, `public/llms.txt`, `scripts/invite-sequence.test.ts`, `scripts/landing-features.test.ts`, `scripts/landing-mobile-copy.test.ts`, `scripts/landing-polish.test.ts`, `scripts/peer-invite.test.ts`, `scripts/vetting-claims.test.ts`, `scripts/wave2-ae.test.ts`, `src/components/Footer.tsx`, `src/content/landingFeatures.ts`, `src/content/legal/privacy.en.ts`, `src/content/privacyNotice.ts`, `src/content/seo.ts`, `src/lib/inviteLink.ts`, `src/pages/ApplyPage.tsx`, `src/pages/ForCapitalPage.tsx`, `src/pages/LandingPage.tsx`, `src/shell/viewCopy.ts`, `supabase/functions/_shared/membership_steps.ts`, `supabase/functions/_shared/peer_invite.ts`

PR #212 merged to `main` as `e713d64` before this branch. This branch starts there.

## Migration

None. No database change. Do not redeploy Edge.

## Secrets grade

VERIFIED.

New source and the handoff were scanned for a non-example.com mailbox, a JWT prefix, a key assignment, em dashes, and en dashes. Zero hits. The shot uses the existing Northwind fixture and example.com. `.env` was not committed.
