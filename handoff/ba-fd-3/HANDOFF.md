# FD-3 Sign-in page restyle

Porcelain and Night Indigo sign-in at `/login`. Tokens, layout, and the sign-in error sentences. No auth logic change. No migration. Not merged. Not deployed.

Base: `main` at `f33a4362811d885e9a2fe1d4fbbb53415cd2561a`.

## What changed

Member sign-in (`src/pages/LoginPage.tsx`) is a porcelain page with white fields, an indigo Sign in button at 17px sentence case, stacked 44px links, the Not a member yet card, and Admin sign in in the footer.

- Eyebrow, title, and lead: Members / Sign in / For members of Board Arabia. `src/pages/LoginPage.tsx` line 263.
- Card: Not a member yet? Board Arabia is by application. Apply for consideration goes to `/apply`. Accepted already? Use the link in your acceptance email to create your account. Email me a new link. `src/pages/LoginPage.tsx` lines 396 to 409.
- Footer: Back to the site, Admin sign in (`/login/staff`). `src/pages/LoginPage.tsx` lines 429 to 433.
- The sentence "Admission is by invitation. This page does not create accounts." is gone from the member page.
- Password has a Show control. Use a one-time code instead opens the code step. Use my password instead returns.
- Errors use text and an icon. Field errors sit under the field and are repeated in the alert above the form. A network or server failure does not clear the email or password.

Staff sign-in at `/login/staff` uses the same porcelain chrome. Its heading, lead, Back to site link, and Member sign in link stay. It does not show the member card.

## Auth calls left in place

`src/pages/LoginPage.tsx` line 130 still calls `signInWithPassword`. The code step still calls `verifyOtp`. Forgot your password? and Email me a new link still call `sendPasswordReset`. A successful password sign-in still calls `clearPasswordFlag`. The signed-in redirect, `routeHold`, and `MfaHold` `signOutTo` are unchanged.

`src/lib/signInNotice.ts` only maps an auth failure onto a sentence. It does not call auth.

| Failure | Sentence | Where |
|---|---|---|
| Wrong email or password, or any other password refusal that is not a network or rate limit | That email and password do not match. Check them and try again, or reset your password. | `src/lib/signInNotice.ts` line 16 |
| Too many attempts | Too many attempts. Wait a few minutes, or reset your password. | line 17 |
| Network, or HTTP 500 and above | We could not reach Board Arabia. Check your connection and try again. | line 15 |
| One-time code wrong or used | That code did not work. Ask for a new link on the sign-in page. | line 18 |

## Shots

`handoff/ba-fd-3/default-390.png`, `default-1440.png`, `error-390.png`, `error-1440.png`, `network-390.png`, `network-1440.png`. Also `code-390.png` and `fields-390.png`. Playwright, reduced motion, Vite, fixture host `example.supabase.co`. The error shot is a mocked invalid password. The network shot aborts the token request. The typed email stays `layla@example.com`.

## Checks run here

- `scripts/fd3-signin.test.ts`: notice mapping, member copy, and a browser pass at 390 and 1440 (15px text, 44px controls, 17px sentence-case Sign in, border `#6d6593`, no overflow, mismatch, network, rate limit, empty fields, code step, staff page).
- `scripts/ux-b-auth.test.ts`, `scripts/shell-nav.test.ts`, `scripts/trust-surfaces.test.ts`, `scripts/login-return.test.ts`, `scripts/password-set.test.ts`, `scripts/review-quickwins.test.ts`.
- `tsc -b` and oxlint on the edited files.

## Claims

- Porcelain page, stacked links, Not a member yet card linking to `/apply`, Admin sign in in the footer. VERIFIED. Shots and `scripts/fd3-signin.test.ts`.
- Admission sentence removed from the member page. VERIFIED. Source assertion and the rendered body.
- Wrong password, too many attempts, and network sentences, with typed input kept on network and mismatch. VERIFIED. Browser test and the error and network shots.
- Sign in button is 17px and not uppercase. Controls are at least 44px tall. Text is at least 15px. VERIFIED. Browser audit at 390 and 1440.
- `signInWithPassword`, `verifyOtp`, `sendPasswordReset`, and `clearPasswordFlag` are still the calls. VERIFIED. Source assertions in `scripts/fd3-signin.test.ts` and `scripts/password-set.test.ts`.
- Staff door still says Staff sign in and returns to the site and to member sign-in. VERIFIED. `scripts/ux-b-auth.test.ts` browser pass.
- No em dash, no sponsor, no nammco, no "the desk" on the sign-in page. VERIFIED. Source assertions. English only.
- Locked files were not edited: `scripts/prerender.mjs`, `scripts/check-pages-artifact.mjs`, `.github/workflows/pages.yml`, `scripts/public-nammco.mjs`, `src/content/legal/*`, `src/pages/apply/*`, `src/shell/destinations.ts`, `src/components/WhoRunsTheDesk.tsx`. VERIFIED. They are absent from the diff.
- No migration. Latest migration on main at the start of this work was `20270111120000_application_withdrawn_closed_retention.sql`. Nothing was applied and nothing was pushed to the database. VERIFIED.
- Secrets. VERIFIED. The diff has no key, token, password, staff mailbox, or staff allowlist. The only addresses are `you@example.com` in the field placeholder and `layla@example.com` in the test and the shots.

## Inferences

- The code step still shows Email. INFERRED. `verifyOtp` needs the email, and the current page collected it. The code mockup shows only the code field.
- Empty email uses "Enter the email address you use for Board Arabia." INFERRED from the reset row in the front-door brief, because the sign-in table has no empty-field sentence. "Enter your password." and "Enter the one-time code." are the same kind of field sentence. INFERRED.
- HTTP 500 and above uses the network sentence. INFERRED. The sign-in table has a network sentence and no separate server sentence, and a 500 must not be shown as a wrong password.
- "Signed-in area. Never share your one-time code." stays, once, above the footer. INFERRED that it should stay: the brief names only the admission sentence for replacement, and `scripts/trust-surfaces.test.ts` plus the CSP crawl wait for this exact line.
- Forgot your password? and Email me a new link both call the existing reset function. The success line stays "If this inbox can sign in, a reset link is on its way." INFERRED. Re-issuing an acceptance link is the later link-problem change, not this page.
- The form sits on porcelain with white fields. The HTML mockups do that. The prose also says a white card for the form. INFERRED that the HTML is the layout to follow, so there is no extra white card around the fields. The mist card is the Not a member yet card.
- Staff sign-in shares the porcelain chrome. INFERRED. It is the same component. Staff copy that existing tests pin was left in place.

## CI

Head `29e005248013785c1ca884e948396ca0c0c04d88` passed crawl, Android debug APK, Android emulator Home, and iOS simulator. pr-checks failed one test: `scripts/partner-logo-storage.test.ts`, `tuple concurrently updated` on the shared role grant. That grant is cluster-wide and the suite applies it from many databases at once. It is not a sign-in failure. VERIFIED from the job log.

The shared test stub now retries that one error. `scripts/sponsor-directory-opt-in.test.ts`. The sign-in page did not change in that commit.

## Unknown

- Whether the retried grant is green on the new head. UNKNOWN until pr-checks finishes again.
- Whether a later brief removes the one-time-code warning from this page. UNKNOWN.
