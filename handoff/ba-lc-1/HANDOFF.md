# LC-1 legal copy

One copy pull request. Base is `main` at `4f6c510ce7f60c1856eeb1d7e5c6f6292e5215f6`. No rebase. No force push. Not merged.

## LEGAL CHANGE

This pull request changes legal copy on purpose.

| Locked file | What changed |
| --- | --- |
| `src/content/legal/privacy.en.ts` | Clause 1.1 entity line. New staff access log row in the retention table. |
| `src/content/legal/terms.en.ts` | Clause 1.1 entity line. |

`src/pages/apply/*` was not edited. The line under the Apply submit button is in `src/pages/ApplyPage.tsx`, which is outside that folder.

`src/components/WhoRunsTheDesk.tsx` was not edited. The heading and the name line stay as they were.

`scripts/prerender.mjs` was not edited. It already calls `strayPublicNammco(html, artifactPath(route))`.

`scripts/public-nammco.mjs` was edited. Flag: the allowlist now removes one exact string, `NAMMCO Holdings LLC, CR 1009167564`, and only on `privacy/index.html`, `terms/index.html`, and `assets/legal-pages-*.js`. Every other nammco spelling still fails, including on those files. The name without the registration number still fails.

`src/components/LegalDocumentView.tsx` keeps clause 1.1 as one text node so that exact string stays together in the HTML. Other clauses still use the existing letter layout.

No migration was added or edited. No Edge function was edited. No workflow was edited. Transactional copy in `supabase/functions/_shared/transactional_copy.ts` was not edited, so no Edge function needs a redeploy for this pull request.

## What changed

Privacy 1.1 and Terms 1.1 now read that Board Arabia is operated by `NAMMCO Holdings LLC, CR 1009167564`, of `[POSTAL ADDRESS TBC]`. Privacy still says Board Arabia is the controller. The postal line stays the placeholder even when `VITE_LEGAL_ADDRESS` is set. The street is not in this pull request.

`legalField('contactEmail')` returns `contact@boardarabia.com` when that env value is empty. A set value still wins, so tests keep `example.com` fixtures. Privacy and terms still store the `[CONTACT EMAIL]` token. The mailbox literal is only in `src/config/legal.ts`.

The privacy retention table has one new row: Staff access log. The second cell says a record that staff opened your member record or a file you shared, kept for 13 months.

Under Submit for consideration, Apply now says: Questions about your application go to the contact mailbox. The existing admin strip stays under that line.

## Audit of migration 20261128120000

Read only. `git diff` does not include `supabase/migrations/20261128120000_retention_privacy_audit.sql`.

| Finding | Grade |
| --- | --- |
| The file comment on `staff_access_log` says the record is kept 13 months. The sweep deletes rows older than `interval '13 months'`. The privacy table had no row for it. This pull request adds that row. | VERIFIED by reading the migration comment, the delete, and the new privacy row. The sentence in the row is the plain reading of that comment. |
| Unverified sign ups are deleted after 7 days. The privacy row "Sign-up that never confirms its email" already says 7 days. | VERIFIED match. Not edited. |
| A verified account that stays open is reminded at 90 days and deleted at 120 days. The privacy row already says that. | VERIFIED match. Not edited. |
| Declined or closed candidate accounts are deleted 12 months after `decided_at`. Applications in status rejected or declined are deleted 12 months after `decision_at`. The privacy row also names withdrawn applications. The migration delete for applications does not name withdrawn. | VERIFIED mismatch. Not edited. Carry forward. |
| Members with `left_at` older than 24 months and no legal hold are anonymised. The privacy member row describes deletion on request and a 24 month file period. It does not say the sign in is anonymised on that 24 month clock. | VERIFIED that both texts exist. UNKNOWN whether Legal wants the member row rewritten. Not edited. |
| Consent log and the staff access log both use 13 months. Marketing stats use 24 hours. AI tool jobs and due diligence decks, jobs, and reports use `retention_days`, default 30. The privacy AI row already says 30 days and the collection clause already names decks for AI due diligence. | VERIFIED in the migration. INFERRED that the existing AI row covers due diligence files. No second row was added. |
| `retention_sweep_plan` is security definer and sets `search_path` to `public, auth, private`. | VERIFIED by reading the function header. Not changed. |

## Carry forward

FD-5. Applications that are not accepted. Brief A open decision 5 asks Legal for new wording and says the old 120 day line should go away. This pull request leaves the 120 day row and the 90 day reminder as they are, because they still match the migration. Grade for the mapping from "FD-5" to that open decision: INFERRED. The attached brief file was not in this checkout. Grade that the row was not edited: VERIFIED.

FD-6. The password rule stays at least 8 characters. No password screen was edited. Grade for the mapping from "FD-6" to Brief A open decision 6: INFERRED, same reason. Grade that no password copy changed: VERIFIED.

## Claims

| Claim | Grade |
| --- | --- |
| Privacy 1.1 and Terms 1.1 contain the exact entity line and `[POSTAL ADDRESS TBC]`. | VERIFIED. Source and `scripts/legal-pages.test.ts`. |
| Apply, home, and about do not contain that entity line. | VERIFIED. Prerendered `dist/apply/index.html`, `dist/index.html`, and `dist/about/index.html`. |
| The nammco gate allows that exact string only on the two legal HTML files and the legal pages chunk. | VERIFIED. `scripts/public-nammco.test.ts` and a successful prerender. |
| Empty contact env renders `contact@boardarabia.com`. A fixture mailbox still overrides it. | VERIFIED. `scripts/legal-pages.test.ts`. The weekly digest preview also shows that mailbox when its contact override is empty. `supabase/functions/_shared/weekly_digest_copy.ts` was not edited. |
| The new retention row is in the privacy table. | VERIFIED. Source test and prerendered `/privacy/`. |
| The Apply note sits under Submit for consideration and above the existing admin strip. | VERIFIED. Route test and the Apply shots. |
| Who runs the desk was not edited. | VERIFIED. It is not in the diff. The Apply shot still shows the existing heading and name. |
| No migration, no Edge edit, no workflow edit. | VERIFIED. Diff. |
| English only. No em dash and no en dash in the diff. No prices. The public word is partners. | VERIFIED. Diff scan. The route test rejects the banned commercial word on the rendered pages. |
| Shots at 390 and 1440 for `/privacy/`, `/terms/`, and `/apply/`. The script checked the clause text, the staff row, the Apply note, and that Apply does not show the entity. No page error. No horizontal overflow. | VERIFIED. |
| A physical phone was not used. | UNKNOWN for a device in hand. The 390 shots are desktop Chrome. |
| GitHub checks. | UNKNOWN until the pull request run finishes. |

## Shots

- `handoff/ba-lc-1/privacy-390.png`
- `handoff/ba-lc-1/privacy-1440.png`
- `handoff/ba-lc-1/terms-390.png`
- `handoff/ba-lc-1/terms-1440.png`
- `handoff/ba-lc-1/apply-390.png`
- `handoff/ba-lc-1/apply-1440.png`

## Tests

`npx oxlint` on the edited source files: exit 0.

`node scripts/build-for-csp-crawl.mjs`: exit 0. Prerender includes `/privacy` and `/terms`.

`bash scripts/pages-artifact-gate.sh` on that build: exit 0.

`node --experimental-strip-types --test scripts/*.test.ts` after `.env.example` was copied to `.env` (gitignored): 952 passed, 10 skipped, 41 failed. 38 of the failures are `spawnSync dropdb ENOENT` because this machine has no Postgres client. CI starts Postgres. One phone layout failure was a timeout while other Vite servers were still up. Run alone, `scripts/dm1-mobile.test.ts` passed. The digest contact assertion and the Apply line number were updated for this change and then passed.

## Secrets grade

VERIFIED for the diff. The only mailbox added is `contact@boardarabia.com`, in `src/config/legal.ts`. Tests that set a mailbox use `example.com`. No key, token, or street address was added. The registration number is the one named for the legal pages.

## After merge

Do not merge from this handoff. Do not apply a migration. Do not redeploy an Edge function. Do not enable a workflow.

If the Pages variable `VITE_LEGAL_CONTACT_EMAIL` is set, that value is what the contact token shows. If it is empty, a Pages build still stops, because that check was already there. Leave `VITE_LEGAL_ADDRESS` unset until the postal line is confirmed. The placeholder stays on the page either way.
