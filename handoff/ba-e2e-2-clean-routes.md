# E2E-2 clean routes

Base: `af3c4b91e9bdf349f881f54cd98c9b867b48ad3d`. Branch `cursor/clean-ar-admin-intros-routes-67d4`.

PR: https://github.com/Mmm-2023/board-arabia/pull/160

## What changed

- `/ar` and `/ar/*` are no longer React routes. `ArabicPrefixRedirect` is gone. `src/App.tsx` no longer imports it. `src/components/EnglishOnly.tsx` only drops `?lang=ar` through `englishPath`. VERIFIED by `scripts/clean-routes.test.ts`.
- `/ar` and `/ar/for-members` are not app shells. `/admin/intros` stays an admin shell. `scripts/shell-manifest.mjs`.
- `scripts/write-ar-redirects.mjs` runs at the end of `npm run build`. It writes one bare HTML file for `/ar` and for each public route and fixed shell under `/ar`. Each file is `noindex`, a meta refresh, and a canonical link to the matching English URL. No app root, no Arabic text, no hreflang. VERIFIED by reading `dist/ar/index.html` and `dist/ar/for-members/index.html`, and by the built-output test.
- A request for `/ar/` and `/ar/for-members/` answers 200. `/nonexistent-xyz` stays 404. VERIFIED by the static server test.
- The built `dist` tree has no `hreflang="ar"` and no link whose target is `/ar` or `https://boardarabia.com/ar`. The stub targets are English, so they do not count. Sitemap has no `/ar` loc. VERIFIED by `arabicLinkHits` over the built files.
- `/admin/intros` still renders `AdminIntrosRedirect` to `/admin/people/intros` and keeps search and hash. `src/App.tsx:149` and `src/shell/adminIntrosRedirect.tsx:4-14`. A local fixture staff session (example token, role `staff`, no real account) landed on `/admin/people/intros?status=open#queue` with the Intros heading. VERIFIED in the browser.

## Removed

- React routes `path="/ar"` and `path="/ar/*"`.
- The `ArabicPrefixRedirect` component.
- App shell entries for `/ar` and `/ar/for-members`.
- No in-app `/ar` link, hreflang tag, or alternate tag was present to delete. None were added.
- `/ar` was not in the sitemap. The new test fails if it appears.

## Locked files

Not edited: `scripts/public-nammco.mjs`, `scripts/prerender.mjs`, `scripts/check-pages-artifact.mjs`, `.github/workflows/pages.yml`, `src/content/legal/*`, `src/lib/aiReportOperator.ts`, the `/apply` route, #37 Sadu files, mail-sending code.

## Apply list

None. Pages deploy happens on merge. After deploy, `/ar/` and `/ar/for-members/` should answer 200 and refresh to the English URL. `/nonexistent-xyz` should stay 404.

No migration. No Edge function change. No product mail.

## Secrets grade

Secrets hygiene: VERIFIED. This diff adds no mailbox, key, token, password, service-role key, user id, booking link, or staff allowlist. The fixture session in the local screenshot uses the label Example Member and an example token. It is not a real account and it is not committed.

## Local checks

- `node scripts/build-for-csp-crawl.mjs`: passed. 10 routes, 64 app shells, 74 English redirect stubs. VERIFIED.
- `bash scripts/pages-artifact-gate.sh`: passed. VERIFIED.
- `scripts/clean-routes.test.ts`, `scripts/shell-og.test.ts`, `scripts/legal-pages.test.ts`, `scripts/apply-route.test.ts`, `scripts/public-names.test.ts`, `scripts/public-nammco.test.ts`: passed. VERIFIED.
