# VT-3 AI Due Diligence notice layout

Branch: `cursor/vt-3-ai-dd-notice-layout-7bc8`
Base: `main` at `b6a2047e1d931d226aa699008c00c7d44ec80439` (PR #213, already merged)
Date: 30 Oct 2026

## Surface

Member AI Due Diligence report. The job is to read one automated check, then do your own diligence.

Skills applied: Board Arabia UX/UI, and Dashboard UX desktop and mobile. This is a `/dashboard` surface. Destinations stay Home, Deals, People, Majlis, AI tools. Desktop keeps the sidebar. Phone keeps the bottom tabs. Empty, loading, error, and permission states on the desk were left as they are.

## What changed

The full notice is one constant, `AI_DD_SCORE_NOTICE`, in `src/lib/aiDueDiligenceNotice.ts:8`. It renders once, through `AiDueDiligenceReportNotice` in `src/components/ai/AiDueDiligenceScoreNotice.tsx:4`. The sentence is:

`Automated check, not due diligence, a rating or an endorsement. Do your own due diligence.`

Each score carries the short tag `AI_DD_SCORE_TAG` at `src/lib/aiDueDiligenceNotice.ts:12`, rendered by `AiDueDiligenceScoreTag` at `src/components/ai/AiDueDiligenceScoreNotice.tsx:19`. The tag is:

`Automated, not an endorsement`

Together, the notice says it is not due diligence and the tag says it is not an endorsement. The name stays AI Due Diligence. The numeric score stays. The stored posture value stays `pass`. Members see `looks clear` from `AI_DD_PASS_DISPLAY` at `src/lib/aiDueDiligenceNotice.ts:15`.

## Where

| Surface | Where | What members see |
| --- | --- | --- |
| Analysis report, top | `src/pages/dashboard/DueDiligenceReport.tsx:55` | The full notice once, before the draft and the scores. |
| Analysis report, overall | `src/pages/dashboard/DueDiligenceMemo.tsx:70` and `:81` | Posture chip, score, and the short tag beside the score. |
| Analysis report, area bars | `src/pages/dashboard/DueDiligenceMemo.tsx:343` | Short tag beside a numbered bar. A missing bar has no tag. |
| Claims report, top | `src/pages/dashboard/DueDiligenceReport.tsx:101` | The full notice once. |
| Claims overview | `src/pages/dashboard/DueDiligenceReport.tsx:132` | Short tag when the overview states a percent. |
| Percent cards | `src/pages/dashboard/DueDiligenceReport.tsx:296` | Short tag beside each percent. |
| Prior notes list | `src/pages/dashboard/DueDiligencePage.tsx:784` | Short tag when the row is `N% publicly consistent`. `No percentage` and `Public checks not run` stay bare. |
| Locked account sample | `src/pages/dashboard/account/views.tsx:320` | Full notice once above the sample memo. Scores use the same tag. |

The running-check progress percent is not a score, so it has no tag. The AI tools recent list is still title and date only.

## Clear result

The clear result is the existing code fixture `passDraftReport` at `src/lib/dueDiligenceMemoFixture.ts:163`. The local memo preview opens it with `?state=pass` from `src/shell/ddMemoPreview.tsx:13`. No database seed and no migration. The guard test renders that fixture.

## Shots

Both are 390 by 844. Chrome opened the local memo preview of the pass fixture.

- `handoff/ba-vt-3-ai-dd-notice-layout/report-top-390.png`
- `handoff/ba-vt-3-ai-dd-notice-layout/score-tag-390.png`

The top shot shows the full notice, then `Posture: looks clear`, then `Overall 4 of 5` with `Automated, not an endorsement` beside it. The bottom tabs are Home, Deals, People, Majlis, AI tools.

The score shot is the same report scrolled to the score cards. `Story` shows `4 of 5` with the tag on the same row. Longer labels wrap, and the tag stays beside the number. The cards sit above the tab bar.

The top shot also shows the existing example round figures from that fixture (`8,000,000 USD` and `10,000,000 USD`). This change does not add a price or a package name.

## Edge

No Edge file changed. No function needs a redeploy. No migration.

## Claims

- VERIFIED. The full notice string and the tag string each exist only in `src/lib/aiDueDiligenceNotice.ts`. `scripts/ai-dd-safeguards.test.ts` walks `src`.
- VERIFIED. A pass draft renders the full notice once, above the overall score. Ten scores carry the tag (overall plus nine area bars). Visible text includes `not due diligence`, `not an endorsement`, and `looks clear`, and does not contain the word pass. The attribute `data-dd-posture="pass"` stays. Test: `scripts/ai-dd-safeguards.test.ts:104`.
- VERIFIED. A missing area bar (`traction_evidence` on the partial fixture) has no tag. The same report still has the full notice once.
- VERIFIED. The claims view has the full notice once, above the percent cards, and the tag sits in the percent block. Visible text includes both limit phrases.
- VERIFIED. The prior-notes list puts the tag on `40% publicly consistent` and not on `No percentage` or `Public checks not run`. Those rows do not include the full notice. The full notice is on the report the row opens.
- VERIFIED. The locked account sample renders the full notice once and ten score tags. That sample stays on the evidence-required draft, so it does not show `looks clear`. `scripts/ai-dd-safeguards.test.ts:208`.
- VERIFIED. Stored label map is unchanged: `POSTURE_LABEL.pass` is still `Pass`. `POSTURES` still includes `pass`. No migration.
- VERIFIED. `scripts/deck-analysis.test.ts`, `scripts/due-diligence.test.ts`, and `scripts/prior-notes.test.ts` passed locally after the layout change.
- VERIFIED. 390 shots. The top shot shows the notice, `looks clear`, the score, and the tag. The score shot shows the tag beside `4 of 5`. Both images are 390 by 844. Bottom tabs match the five member destinations. The sidebar class is `hidden md:flex` at `src/shell/AppShell.tsx:199`, and the 390 shots do not show a sidebar.
- VERIFIED. Contrast of the notice ink `#1c1343` on porcelain `#f6f5fb` is 15.83:1. The tag muted `#4a4468` on porcelain is 8.36:1. Both clear 4.5:1. Measured from the token values in `src/index.css`.
- VERIFIED. Empty, loading, error, and permission branches in `DueDiligencePage` were not edited. Desk status tests in `scripts/due-diligence.test.ts` passed.
- VERIFIED. No locked file in this diff: `scripts/public-nammco.mjs`, `prerender.mjs`, `scripts/check-pages-artifact.mjs`, `.github/workflows/pages.yml`, `src/content/legal/*`, `src/lib/aiReportOperator.ts`, the `/apply` route, mail-sending code.
- INFERRED. The conflict color on stored posture `pass` is unchanged (`DueDiligenceMemo.tsx:319`). Members still read `looks clear` on that chip. Color was left alone because this brief is the notice layout.
- INFERRED. Safe-area classes in `src/index.css` (`.shell-safe-bottom`, `.shell-main` tab padding) were not edited. The 390 score shot keeps the last card above the tab bar.
- UNKNOWN. A pass on a physical phone. Shots are headless Chrome at 390 by 844.
- UNKNOWN. Live production until this merges and the Pages deploy runs. No Edge redeploy is required for this change.

## Migration

None. No database change. Do not redeploy Edge.

## Secrets grade

VERIFIED.

The diff adds no mailbox, API key, token, password, service-role key, project ref, or staff allowlist. Fixture addresses stay example.com. The handoff names no staff mailbox. `.env` was not committed.
