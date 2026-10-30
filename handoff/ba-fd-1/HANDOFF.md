# FD-1 handoff

Brief A, first change. One public button on the landing page, the nav, How it works, and About. Base `6e507096f0a423ad4b7b9905dafc47191c6aa6e9` on main. No merge. No force push.

## What changed

Public consideration always opens `/apply` with the label Apply for consideration. The env switch `VITE_TWO_TIER_REGISTER_ENABLED` is no longer read. Sign in is a text link at the top right. The line under the page button is `Three short steps. No account needed yet.` The three How it works steps are the Brief A sentences.

## Screenshots

390px and 1440px, before and after, in this folder:

- `before-landing-390.png`, `before-landing-1440.png`
- `after-landing-390.png`, `after-landing-1440.png`
- `before-how-390.png`, `before-how-1440.png`
- `after-how-390.png`, `after-how-1440.png`
- `before-about-390.png`, `before-about-1440.png`
- `after-about-390.png`, `after-about-1440.png`

## Claims

| Claim | Grade |
|---|---|
| `publicConsiderationCta()` always returns `{ to: '/apply', label: 'Apply for consideration' }`. Calling the old test setter cannot point it at `/register`. | VERIFIED. `src/lib/twoTierRegister.ts`. `scripts/two-tier-public.test.ts` passed. |
| Landing, nav, How it works, and About use that one button label. | VERIFIED. Render test and the after screenshots. |
| The support line sits under the hero button, the mobile menu button, the How it works buttons, the About button, and the landing close. | VERIFIED. Screenshots and source. |
| The desktop header button does not have a second line under it. The header row is 64px on a phone and 80px on a wide screen, and the line is already under the hero. | VERIFIED by layout. The brief drawing places the line under the hero button. |
| Sign in is a quiet top right link to `/login`, 16px, 44px tall, sentence case, no border. | VERIFIED. Playwright measurement on `/`, `/how-it-works`, and `/about` at 390 and 1440. |
| Footer still says Log in, and the landing close still says Already a member? Log in. | VERIFIED. `src/components/Footer.tsx` and `src/components/CtaBand.tsx`. `scripts/prerender.mjs` (not edited) requires both strings. |
| The three steps match Brief A on landing, How it works, and About. | VERIFIED. `src/content/twoTierCopy.ts` and the after screenshots. |
| There is no Book button on these pages. There was not one in the previous source either. | VERIFIED. Search of `src/pages/LandingPage.tsx`, `src/pages/HowItWorksPage.tsx`, `src/pages/AboutPage.tsx`, and `src/components/Nav.tsx`. |
| The Register label cannot be selected for these buttons. | VERIFIED. The helper no longer has a `/register` branch. |
| No redirects were added. `src/App.tsx` was not edited. | VERIFIED. Diff. |
| The Register page and the Apply form were not edited. | VERIFIED. Diff does not include `src/pages/RegisterPage.tsx`, `src/pages/ApplyPage.tsx`, or `src/pages/apply/*`. |
| Apply heading already says Apply for consideration. The submit control still says Submit for consideration. The three steps are not on the Apply form. | VERIFIED by reading `src/pages/ApplyPage.tsx` and leaving it unchanged. This PR does not need a locked `src/pages/apply/*` edit. |
| How it works document title stays `How Board Arabia works: apply, review, invite`. The visible heading is `Apply. Review. Create your account.` | VERIFIED. Title is unchanged in `src/content/seo.ts` because `scripts/prerender.mjs` checks that exact title. The file was not edited. |
| `src/components/WhoRunsTheDesk.tsx`, `scripts/prerender.mjs`, `scripts/check-pages-artifact.mjs`, `.github/workflows/pages.yml`, `scripts/public-nammco.mjs`, `src/content/legal/*`, and `src/shell/destinations.ts` were not edited. | VERIFIED. Diff. |
| `isTwoTierRegisterEnabled()` remains and always returns false, so the locked imports in `src/shell/destinations.ts` and `src/pages/apply/RegisterScreen.tsx` still compile. Staff Review stays off the phone tab. | VERIFIED. `scripts/shell-nav.test.ts` passed. |
| `pages.yml` and `scripts/build-for-csp-crawl.mjs` still set `VITE_TWO_TIER_REGISTER_ENABLED`. Application code does not read it. `.env.example` no longer documents the switch. | VERIFIED. `pages.yml` was not edited (locked). The two tier test asserts the workflow line remains and that `src` does not read the name. |
| No migration, no Edge function, no email template, emails stay off. | VERIFIED. Diff has none of those files. |
| English only. No em dash or en dash in the diff. No user-facing sponsor. nammco only in the existing footer line. No prices. | VERIFIED. Diff scan, and `scripts/partner-wording.test.ts` plus the landing nammco assertion passed. |
| Secrets: no email address, key, token, or password in the diff. Local `.env` is the example file and is gitignored. | VERIFIED. |
| Touched Apply buttons are 17px, sentence case, and at least 44px tall. | VERIFIED. Playwright on the hero, header (1440), menu, sticky, How it works, and About buttons. |
| New step and support sentences are 16px. | VERIFIED. Computed style. |
| No horizontal overflow at 390 or 1440 on the three pages. | VERIFIED. `scrollWidth` matched the viewport. |
| Pre-existing footer blurb (14px), copyright (14px), powered by nammco (12px), and the landing preview chips (14px) are still under 15px. This PR did not restyle them. | VERIFIED they are still small. They were already small before this change. |
| Loading, empty, and error states: these three pages are static copy. The landing deal preview still falls back to the built in examples if the list call fails. That path was not changed and was not failed on purpose in the browser. | INFERRED that no new state was required. UNKNOWN for a live failed list call in this session. |
| GitHub checks (pr-checks, crawl, Android debug APK, iOS simulator, Android emulator Home). | UNKNOWN until the pull request run finishes. |

## Not in this PR

Redirects, the Register page, the Apply form steps, and the emails. Those are later changes in Brief A.
