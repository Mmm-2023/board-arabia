# FD-2 handoff

Front door redirects. Branch started from `f33a4362811d885e9a2fe1d4fbbb53415cd2561a` (main). No rebase. No force push. The pull request is not merged. Nothing was deployed.

GitHub Pages is the live host. `vercel.json` is kept in step, and the pages that actually answer are static stubs written after prerender. `scripts/prerender.mjs`, `scripts/check-pages-artifact.mjs`, and `.github/workflows/pages.yml` were not edited.

## What changed

| Old path | What a visitor gets | `/register/verify` |
|---|---|---|
| `/register` | Apply, and `?invite=` stays | Still the confirm page |
| `/apply/verify` | Apply | |
| `/book` | Apply | |
| `/verify` | Apply | |

The stub is `dist/<path>/index.html`: noindex, canonical `https://boardarabia.com/apply/`, a meta refresh, and a script that does `location.replace("/apply/" + location.search + location.hash)`. Visible stub copy is "This page has moved." at 16px and "Continue to apply" at 17px, with a 44px link.

The same hop is in the React router (`ApplyRedirect`) so the native shell and the Pages 404 bounce do it too. The Register page file is still in the repo. The public route no longer mounts it, because that is what makes the hop work. `twoTierRegister` is unchanged.

`/register`, `/book`, `/verify`, and `/apply/verify` are no longer app shells. `/register/verify` still is. `robots.txt` allows `/register/verify` and disallows `/register` and `/apply/verify`. App links no longer claim `/register` or `/register/*`. The CSP crawl opens the redirects and still opens `/register/verify`.

## Screenshots

Built `dist`, served as folder indexes, Chrome, reduced motion.

- `register-invite-390.png`, `register-invite-1440.png`: opened `/register?invite=x`, landed on `/apply?invite=x`, Apply form, invalid invite line visible.
- `book-390.png`, `book-1440.png`: opened `/book`, landed on `/apply`.
- `stub-390.png`, `stub-1440.png`: the stub held still (script and refresh removed) so the text can be read.

## Claims

| Claim | Grade |
|---|---|
| `/register?invite=x` lands on Apply and keeps `invite=x`. | VERIFIED. Playwright URL `http://127.0.0.1/.../apply?invite=x` and the invalid invite line. `scripts/fd-redirects.test.ts`. |
| `/book`, `/verify`, and `/apply/verify` land on `/apply/`. | VERIFIED. Playwright. `/book?invite=kept` kept the query. |
| `/register/verify` still serves the confirm shell and does not use the stub. | VERIFIED. Playwright stayed on `/register/verify/`. Built HTML has `id="root"` and no `data-fd-redirect`. |
| A local static server answers `/register?invite=x` with 301 to `/register/?invite=x`, then 200 stub HTML whose script appends `location.search`. | VERIFIED. `scripts/fd-redirects.test.ts`. |
| The live GitHub Pages response for these paths is that 200 stub, not an HTTP 301. Pages cannot send a 301 from a file. | VERIFIED from the stub and from the brief. The directory slash hop is a 301 on Pages and on the local server. |
| `vercel.json` sends 301 to `/apply/` for `/register`, `/apply/verify`, `/book`, and `/verify`, with and without a trailing slash, and does not list `/register/verify`. | VERIFIED. File read in `scripts/fd-redirects.test.ts`. |
| Vercel keeps the query when the destination has none of its own. | INFERRED from Vercel redirect behaviour. The live site does not use this file. |
| Stub text is 16px and 17px, the link is 44px tall, no overflow, no em dash or en dash. | VERIFIED. Computed style at 390 and 1440 on the held stub. |
| Apply landing at 390 and 1440 has no horizontal overflow and no em dash or en dash in the visible text. | VERIFIED. Playwright on both redirect landings. |
| Apply field labels are still about 11.5px and one hint is about 13.6px. | VERIFIED they are still small. They were already small. `src/pages/ApplyPage.tsx` was not edited. |
| The `/apply` route line is still `ApplyPage`. | VERIFIED. `src/App.tsx`. |
| Register page file and `twoTierRegister` remain. The route does not render `RegisterPage`. | VERIFIED. `src/pages/RegisterPage.tsx` is in the tree and absent from `src/App.tsx`. |
| `/register/verify` stays in the shell list. The four old paths do not. | VERIFIED. `scripts/shell-manifest.mjs` and `scripts/shell-og.test.ts`. |
| `robots.txt` allows `/register/verify` and disallows `/register` and `/apply/verify`. `/book` and `/verify` were already disallowed. | VERIFIED. `public/robots.txt` and `dist/robots.txt` after build. |
| A non-root Pages base still gets those robot lines, because the stub script patches `dist/robots.txt` after prerender. | VERIFIED for the helper in `scripts/fd-redirects.test.ts`. The production base is `/`, so prerender does not replace `robots.txt`. INFERRED that a project-site base would be patched the same way. `scripts/prerender.mjs` was not edited. |
| App links no longer include `/register` or `/register/*`. | VERIFIED. `scripts/write-well-known.mjs`. |
| The candidate email still links at `/apply/verify`. Mail code was not edited. That URL now opens Apply and keeps the query, so the token is not used as a confirm code. | VERIFIED the mail file was not in the diff. INFERRED the effect on letters already sent. |
| The confirm page still has a Change email link to `/register`. That file is locked, so the link text was left. The route now continues to Apply. | VERIFIED `src/pages/apply/VerifyScreen.tsx` was not edited. INFERRED the click destination. |
| `DashboardLayout` still sends an unconfirmed member to `/register/verify`. That page still works. Sending them to `/login` is a later item. | VERIFIED the layout file was not edited. |
| Locked files were not edited: `scripts/prerender.mjs`, `scripts/check-pages-artifact.mjs`, `.github/workflows/pages.yml`, `scripts/public-nammco.mjs`, `src/content/legal/*`, `src/pages/apply/*`, `src/shell/destinations.ts`, `src/components/WhoRunsTheDesk.tsx`, `aiReportOperator.ts`, and mail sending. | VERIFIED. Diff. |
| No migration. Latest slot on main is `20270111120000_application_withdrawn_closed_retention.sql`. The next free slot is `20270112120000`. It was not used. | VERIFIED. No files under `supabase/migrations`. |
| No Edge deploy, no email send, no force push, not merged. | VERIFIED for this branch. |
| English only. No em dash or en dash in the diff. No new price. nammco only in the existing footer credit. | VERIFIED. Diff scan, and `scripts/partner-wording.test.ts` plus `scripts/public-names.test.ts` passed. |
| Secrets. The diff has no email address, key, token, password, or staff allowlist. Shots are the public Apply page and the stub. `.env` is gitignored and not committed. | VERIFIED. |
| Apply form labels under 15px, empty, loading, and error states of Apply were not redesigned. | VERIFIED they were not edited. UNKNOWN for a failed submit in this session. The invalid invite line was shown. |
| Local CSP crawl on the built site, including `/register?invite=x`, `/book`, `/verify`, `/apply/verify`, and `/register/verify`. | VERIFIED. 177 checks, 0 violations. |
| GitHub checks (pr-checks, CSP crawl, Android debug APK, iOS simulator, Android emulator Home). | UNKNOWN until the pull request run finishes. |

## Not in this PR

Removing `twoTierRegister`, deleting the Register page, the three step Apply form, the acceptance email, and the later decision to retire `/register/verify`.
