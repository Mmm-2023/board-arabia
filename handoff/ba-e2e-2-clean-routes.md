# E2E-2 clean routes

Base: `af3c4b91e9bdf349f881f54cd98c9b867b48ad3d` (Add a weekly digest that admin approves, with sending left off, #158). Branch started from that commit after `git fetch origin main`.

PR: https://github.com/Mmm-2023/board-arabia/pull/160

## What changed

- Three stale paths are app shells, so Pages answers 200 and React hops. `/ar` and `/ar/for-members` are `public-utility`. `/admin/intros` is `admin`. `scripts/shell-manifest.mjs:93-95`. VERIFIED by reading the list and by `appShells()` in `scripts/clean-routes.test.ts`.
- Prerender already writes one `index.html` per `appShells()` entry. That file was not edited. The built files are `dist/ar/index.html`, `dist/ar/for-members/index.html`, and `dist/admin/intros/index.html`. Each is `noindex, nofollow`, has no Arabic script (`[\u0600-\u06FF]`), and is absent from `dist/sitemap.xml`. VERIFIED by the built-shell test and by reading those files after `node scripts/build-for-csp-crawl.mjs`.
- `/admin/intros` is a child of `/admin` and renders `AdminIntrosRedirect`. `src/App.tsx:151`. The target is `/admin/people/intros` and keeps search and hash. `src/shell/adminIntrosRedirect.tsx:4-14`. VERIFIED by the router test.
- `/ar` and `/ar/*` still use `ArabicPrefixRedirect`. `/ar` resolves to `/`. `/ar/for-members` resolves to `/for-members`. Query `lang=ar` is dropped. Other query values and the hash stay. VERIFIED by `englishPath` cases and by the browser.
- The `/apply` line in `src/App.tsx` is unchanged. VERIFIED by the diff and by `scripts/apply-route.test.ts`.
- Other `/ar/*` paths, such as `/ar/about`, still use the 404 bounce. `/nonexistent-xyz` still answers 404. VERIFIED by `scripts/shell-og.test.ts` on the built artifact.
- No Arabic copy, language switcher, or hreflang. No sitemap entry for `/ar`.

## Browser

Local Pages-style server on the built `dist` (bare path 301 to the slash, slash 200, unknown path 404 with `404.html`).

| Request | First responses | After React | Arabic |
| --- | --- | --- | --- |
| `/ar` | 301 `/ar`, then 200 `/ar/` | `/` English home | none |
| `/ar/for-members?from=old#tools` | 301, then 200 `/ar/for-members/` | `/for-members?from=old#tools` | none |
| `/admin/intros?status=open#queue` | 301, then 200 `/admin/intros/` | staff sign-in, `next` keeps the original path, search, and hash | none |
| `/nonexistent-xyz` | 404 | stays on that path | n/a |

No console error on the three shells. Desktop and 390 px both show the English pages for `/ar` and `/ar/for-members`. VERIFIED.

An unsigned visit to `/admin/intros` stops at staff sign-in because `AdminLayout` checks the session before the child route renders (`src/pages/admin/AdminLayout.tsx:37-42`). A signed-in staff session that passes that gate renders the child `Navigate`. That signed-in landing was not opened in the browser. The target path, search, and hash are covered by the router test. Grade for the staff landing itself: INFERRED from the route tree and the unit test. The 200 shell and the unsigned sign-in hop are VERIFIED.

## Locked files

Not edited: `scripts/public-nammco.mjs`, `scripts/prerender.mjs`, `scripts/check-pages-artifact.mjs`, `.github/workflows/pages.yml`, `src/content/legal/*`, `src/lib/aiReportOperator.ts`, the `/apply` route, apply-route.test.ts, #37 Sadu files, mail-sending code. VERIFIED by `git diff origin/main --name-only`.

## Apply list

None. Pages deploy happens on merge. After deploy, `curl -sI` on `/ar/`, `/ar/for-members/`, and `/admin/intros/` should show 200. The bare path 301s to the slash, the same way every other shell does. `/nonexistent-xyz` should stay 404.

No migration. No Edge function change. No product mail.

## Secrets grade

Secrets hygiene: VERIFIED. This diff adds no mailbox, key, token, password, service-role key, user id, booking link, or staff allowlist. It adds no email address. example.com is not newly introduced. The handoff names no person. A scan of `git diff origin/main` for key and token markers returned only diff hunk headers.

## Local checks

- `node scripts/build-for-csp-crawl.mjs` with `GITHUB_PAGES=true` and `VITE_BASE_PATH=/`: passed. Wrote 10 routes and 66 app shells. VERIFIED.
- `bash scripts/pages-artifact-gate.sh`: passed. VERIFIED.
- `scripts/clean-routes.test.ts`, `scripts/shell-og.test.ts`, `scripts/member-nav-redirects.test.ts`, `scripts/partner-wording.test.ts`, `scripts/public-names.test.ts`, `scripts/public-nammco.test.ts`, `scripts/apply-route.test.ts`: passed after copying `.env.example` to the gitignored `.env`, the same step PR checks uses. VERIFIED.
