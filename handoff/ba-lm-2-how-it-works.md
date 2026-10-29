# LM-2 How it works booking sentence

Marketing home. The job is to show review before any conversation.

The sentence "No public booking calendar is offered." is removed from How it works. The review line stays. Founding 100 stays its own section. Section order is unchanged.

Base is `origin/main` at `93436dc1329e95bcb4770d159651cf9c616222a8` (fast-forward from `426d4b8`). No rebase. No force-push. No migration. No Edge change. Do not merge this PR.

## Skills and rules

Cited and applied:

- Board Arabia UX / UI. Surface is the marketing home. Checklist: English, no em dashes, indigo section left as it was, primary path still Apply for consideration and Log in, no public booking sentence on the home, same section jobs on 390 and 1440. This is not a logged-in shell, so the dashboard shell skill does not apply. The research note named by the skill (`handoff/ba-ux-ui-best-practices-2026-09-27.md`) is not in this checkout.
- COMMON-RULES.md (every agent).
- LOCKS.md (standard locks, 13 Oct), including `handoff/ba-resume-2026-10-12/COMMON-RULES.md` as that note points.

## Guardrails

- This PR edits locked `scripts/prerender.mjs`. That edit is approved for LM-2. The only hunk deletes the home check that required the substring "No public booking calendar" and pushed `home missing answer-first blurb`. Nothing else in that file changes.
- Not edited: `scripts/public-nammco.mjs`, `scripts/check-pages-artifact.mjs`, `.github/workflows/pages.yml`, `src/content/legal/*`, `src/lib/aiReportOperator.ts`, the `/apply` route (`src/App.tsx` line 149 and `scripts/apply-route.test.ts`), WhoRunsTheDesk, the Sadu files, mail-sending code.
- No migration. No `supabase db push`. No Edge deploy. No live settings change. No email sent. No merge.
- English only. No em dash and no en dash in the diff, the handoff, or the rendered home.
- Partner wording only. The banned commercial word is not added.
- nammco stays the footer credit "powered by nammco".
- No prices or package names.
- example.com only. No new address. Public repo: no mailbox, API key, token, password, service-role key, or project ref in the diff. `.env` is gitignored and not committed.

## Secrets grade

VERIFIED. `git diff` for this change is the four product files plus this handoff and two screenshots. No secret material is in those files.

## What changed

| Item | Where | Grade |
| --- | --- | --- |
| Booking sentence removed from How it works | `src/pages/LandingPage.tsx:298-300` | VERIFIED |
| Review line kept | same paragraph | VERIFIED |
| Prerender no longer requires that sentence | `scripts/prerender.mjs:81-86` (the check that sat between the staff sign-in check and the em dash check is gone) | VERIFIED |
| Home route test | `scripts/landing-mobile-copy.test.ts:123-155` | VERIFIED, test passed |
| Copy count updated from 1 to 0 | `scripts/landing-mobile-copy.test.ts:101-103`, `scripts/ux-e-polish.test.ts:103-108` | VERIFIED, tests passed |
| Founding 100 copy and section | `src/pages/LandingPage.tsx:173-185`, still after Why and before membership | VERIFIED, not in the product diff |
| Section order in source | `src/pages/LandingPage.tsx:51-73`: Hero, Why, Founding, membership, trusted partners, process, FAQ, closing, footer | VERIFIED, order lines not edited |
| `/` still renders LandingPage | `src/App.tsx:148` | VERIFIED, file not edited. Route test asserts that line |
| `/apply` still renders ApplyPage | `src/App.tsx:149` | VERIFIED, file not edited |

## SHA pin

VERIFIED. No test pins `scripts/prerender.mjs` by SHA or by a full-file digest.

Searched `createHash('sha256')` in `scripts/*.test.ts`. The pins are:

- `scripts/public-nammco.test.ts` pins `scripts/public-nammco.mjs`. That file is not in this diff, so the pin stays.
- `scripts/legal-pages.test.ts` pins `src/content/legal/resolve.ts`. That file is not in this diff, so the pin stays.
- `scripts/email-events-db.test.ts` hashes example.com addresses for a fixture. Unrelated.

The old prerender digest `45ac6613030fce7f2b639a0542fb717441cc89bb95cb76cd465b67ecad5f0151` is not referenced anywhere. No pin was updated because none existed. The sentence count assertions were presence checks, not a file hash, and those counts are now 0.

Other prerender reads (`public-nammco`, `shell-og`, `account-deletion` source checks, `trust-surfaces`, `w1d-help-fixes`, `wave2-ae`) match strings this hunk does not touch. Those tests passed, except the account-deletion database case below.

## Acceptance

`rg 'No public booking calendar' src dist` prints nothing and exits 1. Grade: VERIFIED after `node scripts/build-for-csp-crawl.mjs`.

The locked WhoRunsTheDesk line is a different sentence, with a lowercase "no": "There is no public booking calendar." It is not the home sentence and it is not the prerender requirement. It was not edited. A case-sensitive search does not match it. Grade: VERIFIED by reading `src/components/WhoRunsTheDesk.tsx:17`.

Rendered home at `/` (vite preview of `dist`, Chrome):

| Check | 390 | 1440 | Grade |
| --- | --- | --- | --- |
| Booking sentence absent | absent | absent | VERIFIED |
| Review line present | present | present | VERIFIED |
| Founding 100, Fifty and fifty, the places line | present | present | VERIFIED |
| Section ids | top, hero-apply, why, founding, membership, process, faq, faq-heading, closing | same | VERIFIED |
| nammco count | 1 | 1 | VERIFIED |
| Banned commercial word on the rendered home | absent | absent | VERIFIED |
| Em dash or en dash in rendered text | absent | absent | VERIFIED |
| Full sequence | leaves `/` for the how-it-works route | `/how-it-works/` | VERIFIED destination. At 390 the URL was read as `/how-it-works` because the waiter allows an optional slash, so the trailing slash timing is INFERRED |
| How we protect your data | `/security/` | `/security/` | VERIFIED |
| Those two links, height | 44px | 44px | VERIFIED by bounding box |

Screenshots:

- `handoff/ba-lm-2-how-it-works/how-it-works-390.png`
- `handoff/ba-lm-2-how-it-works/how-it-works-1440.png`

A physical phone was not used. Grade for a device in hand: UNKNOWN. The 390 and 1440 shots are desktop Chrome viewports.

## Tests

VERIFIED passed locally: `scripts/landing-mobile-copy.test.ts`, `scripts/ux-e-polish.test.ts`, `scripts/landing-polish.test.ts`, `scripts/shell-og.test.ts`, `scripts/public-nammco.test.ts`, `scripts/no-public-entity.test.ts`, `scripts/clean-routes.test.ts`, `scripts/two-tier-public.test.ts`, `scripts/w1d-help-fixes.test.ts`, `scripts/app-shell.test.ts`, `scripts/admin-wording.test.ts`, `scripts/trust-surfaces.test.ts`, `scripts/wave2-ae.test.ts`.

`scripts/account-deletion.test.ts` source checks passed. The database subtest failed with `spawnSync dropdb ENOENT`. Postgres is not installed in this environment. Grade: VERIFIED as an environment miss, not a copy failure. The full `scripts/*.test.ts` run is the pr-checks job. Grade for that job before GitHub reports it: UNKNOWN.

## Head and checks

Product commit: `49a59d4f5b3c55743a6b8aac238ed5aedad4ad15`. Grade: VERIFIED by `git rev-parse` on that commit.

That commit is the page change. A short note commit may sit on top of it to record this SHA. GitHub check status for pr-checks, crawl, Android debug APK, iOS simulator, and Android emulator Home starts UNKNOWN until those jobs finish.

## UX checklist

- No em dashes. Indigo How it works block unchanged apart from the deleted sentence. VERIFIED.
- Trust before the apply ask is unchanged: hero, why, founding, membership, then How it works, then the closing apply. INFERRED from the unchanged section order, plus VERIFIED that the hero CTA test still points at `/apply`.
- No public booking sentence on the home. VERIFIED.
- Same destinations on both widths. VERIFIED by the two shots and the two link clicks.
- Empty, loading, and error states are not part of this cut.
- No AI surface in this cut.
- No new proof, KPI, or price. VERIFIED by the one-sentence diff.
