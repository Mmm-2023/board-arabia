# LM-3 Who runs the desk booking sentence

Marketing About and Apply. The job is to name the person who reads applications.

The sentence "There is no public booking calendar." is removed from Who runs the desk. The heading, the name, and "A named person reads applications." stay.

Base is `origin/main` at `21892a25787fa293d535e8d6b9fea6eed00071ad` (LM-2, "Drop the public booking calendar sentence from How it works"). No rebase. No force-push. No migration. No Edge change. Do not merge this PR.

Product commit: `4cca8330b3fc15bd749f8f875cdb38fe669e797d`. Grade: VERIFIED by `git rev-parse` on that commit. The follow-up commit that records this SHA is the PR head until a later CI note lands.

## Skills and rules

Cited and applied:

- Board Arabia UX / UI. Surface is marketing (About and Apply). Checklist: English, no em dashes, indigo left as it was, primary path still Apply for consideration and Log in, no public booking sentence, same section on About and Apply. This is not a logged-in shell, so the dashboard shell skill does not apply. The research note named by the skill (`handoff/ba-ux-ui-best-practices-2026-09-27.md`) is not in this checkout.
- COMMON-RULES.md (every agent), the copy attached to this task.
- LOCKS.md (standard locks, 13 Oct). It also points at `handoff/ba-resume-2026-10-12/COMMON-RULES.md`. That file is not in this checkout. The attached COMMON-RULES.md was applied in its place.

## Guardrails

- Locked file edited: `src/components/WhoRunsTheDesk.tsx`. The only product hunk deletes the sentence "There is no public booking calendar." The heading "Who runs the desk" and the line "Michael Mateer, Co-Founder and CEO" are unchanged.
- Tests updated because they required that sentence, or because this task asked for a route test on `/`: `scripts/admin-wording.test.ts`, `scripts/landing-mobile-copy.test.ts`.
- Not edited: `scripts/public-nammco.mjs`, `scripts/prerender.mjs`, `scripts/check-pages-artifact.mjs`, `.github/workflows/pages.yml`, `src/content/legal/*`, `src/lib/aiReportOperator.ts`, the `/apply` route (`src/App.tsx` and `scripts/apply-route.test.ts`), the Sadu files, mail-sending code. `scripts/prerender.mjs` no longer requires the home substring. LM-2 removed that check. This sentence was not a prerender requirement, so the prerender file stays untouched.
- No migration. No `supabase db push`. No Edge deploy. No live settings change. No email sent. No merge.
- English only. No em dash and no en dash in the diff, this handoff, or the section.
- Partner wording only. The banned commercial word is not added.
- nammco stays the footer credit "powered by nammco".
- No prices or package names.
- example.com only. No new address. Public repo: no mailbox, API key, token, password, service-role key, or project ref in the diff. `.env` is gitignored and not committed.

## Secrets grade

VERIFIED. The diff is the component, two tests, this handoff, and one screenshot. No secret material is in those files.

## What changed

| Item | Where | Grade |
| --- | --- | --- |
| Booking sentence removed | `src/components/WhoRunsTheDesk.tsx:17` | VERIFIED |
| Name line kept | `src/components/WhoRunsTheDesk.tsx:15` | VERIFIED |
| Wording test no longer requires the sentence, and now requires it to be absent | `scripts/admin-wording.test.ts:78-79` | VERIFIED, test passed |
| Route test for `/` asserts the sentence is absent from the rendered home and from `src/` | `scripts/landing-mobile-copy.test.ts:123-156` (assertion at line 134, `src/` walk at lines 152-155) | VERIFIED, test passed |
| Prerender file | not in the diff | VERIFIED |
| `/` still renders LandingPage | `src/App.tsx` route for `/` | VERIFIED, file not edited. The route test asserts that line |
| `/about` and `/apply` still render WhoRunsTheDesk | `src/pages/AboutPage.tsx:49`, `src/pages/ApplyPage.tsx:248` | VERIFIED, files not edited |

## Acceptance

`rg -i 'no public booking calendar' src` prints nothing and exits 1. Grade: VERIFIED.

`rg -i 'no public booking calendar' dist` prints nothing and exits 1 after `node scripts/build-for-csp-crawl.mjs`. Grade: VERIFIED. Prerender of `/about` still contains "Who runs the desk", "Michael Mateer, Co-Founder and CEO", and "A named person reads applications."

## Rendered section

Chrome, viewport 390 by 844, vite dev server. Screenshot width is 390 pixels.

| Check | About | Apply | Home `/` | Grade |
| --- | --- | --- | --- | --- |
| Sentence absent | absent | absent | absent | VERIFIED |
| Who runs the desk | present | present | section not on this route | VERIFIED |
| Michael Mateer, Co-Founder and CEO | present | present | not on this route | VERIFIED |
| A named person reads applications. | present | present | not on this route | VERIFIED |
| Footer nammco count on About | 1, and the text is "powered by nammco" | not re-counted | not re-counted | VERIFIED on About |
| Page errors | 0 | 0 | 0 | VERIFIED |

Screenshot: `handoff/ba-lm-3-who-runs-the-desk/who-runs-the-desk-390.png`

A physical phone was not used. Grade for a device in hand: UNKNOWN. The 390 shot is desktop Chrome.

## Tests

VERIFIED passed locally: `scripts/admin-wording.test.ts`, `scripts/landing-mobile-copy.test.ts`, `scripts/landing-polish.test.ts` (the desk copy case), `scripts/ux-b-auth.test.ts`, `scripts/wave2-ae.test.ts`, `scripts/public-nammco.test.ts`.

`scripts/landing-polish.test.ts` case "organization logo and image are absolute URLs that exist in dist" failed once against a partial `dist` from an earlier test build. The full `node scripts/build-for-csp-crawl.mjs` then prerendered every route, including `/about`. Grade for that one failure: VERIFIED as a stale artifact, not a copy failure. It was not re-run after the full build.

The full `scripts/*.test.ts` run is the pr-checks job. Grade for that job before GitHub reports it: UNKNOWN.

## Head and checks

| Check | Result | Grade |
| --- | --- | --- |
| pr-checks | not reported yet | UNKNOWN |
| crawl | not reported yet | UNKNOWN |
| Android debug APK | not reported yet | UNKNOWN |
| iOS simulator | not reported yet | UNKNOWN |
| Android emulator Home | not reported yet | UNKNOWN |

## UX checklist

- No em dashes. The section tokens are unchanged apart from the deleted sentence. VERIFIED.
- Trust before the apply ask is unchanged. This cut does not add a form field. INFERRED from the one-sentence diff, plus VERIFIED that About and Apply still render the same section.
- No public booking sentence in the section, on `/`, or in `src/` and `dist`. VERIFIED.
- Same section copy on About and Apply. VERIFIED by the two rendered reads. Layout was not redesigned.
- Empty, loading, and error states are not part of this cut.
- No AI surface in this cut.
- No new proof, KPI, or price. VERIFIED by the one-sentence diff.
- Checked at 390 in Chrome. A real phone was not used. Grade: UNKNOWN for a device in hand.
