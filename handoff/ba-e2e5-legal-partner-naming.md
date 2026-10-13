# E2E-5 legal partner naming

Base: `af3c4b91e9bdf349f881f54cd98c9b867b48ad3d` (main after the weekly digest commit). Branch: `cursor/legal-partner-naming-820b`.

## What changed

- Terms and privacy copy now says partner where the brief listed sponsor. `rg -n -i sponsor src/content/legal` is empty. VERIFIED by that search.
- Clause 1.1 on both pages names Board Arabia as the operator. Privacy also names Board Arabia as the controller. The commercial registration placeholder is gone from those sentences.
- `publishedLegalIdentity()` no longer reads `VITE_LEGAL_BA_ENTITY` or `VITE_LEGAL_CR`. Choice: stop rendering, not delete the function. `src/content/legal/resolve.ts` stays byte-identical to main (sha256 `f5740b538295e39e5be8344201e2dd6bc90b7c3c3ad7eabf26e6a7e4ed61fe9c`). The env names remain in `src/config/legal.ts` and `.env.example`. Nothing under `src/` reads them, so the production build cannot inline the old entity. The Pages workflow no longer sets those two build values.
- The logged-in AI report credit is `Provided by Board Arabia`. The stored name and registration number are not shown. `src/lib/aiReportOperator.ts` and `scripts/ai-report-operator.test.ts` are the only AI-report files edited for that.
- `scripts/no-public-entity.test.ts` builds the banned needles from fragments. It scans `src/`, `scripts/` (except itself), the built bundle, and prerendered pages. No path exception.

## Locked files

`scripts/prerender.mjs`, `scripts/check-pages-artifact.mjs`, and `.github/workflows/pages.yml` are not edited. `scripts/public-nammco.mjs` lost only the entity constant and the registration constant. The footer credit `powered by nammco` is unchanged. `scripts/with-public-legal-env.mjs` and `scripts/legal-pages.test.ts` no longer import those constants.

## Not changed

- AI provider sentences in terms (9.6, 10.3, 10.5) and privacy (5.4, 7.1), and the `[AI PROVIDER]` line in `resolve.ts`.
- Last updated date.
- Database, routes, RPC names, and the seat value `sponsor`.
- Migration `supabase/migrations/20261126120000_ai_report_operator.sql` still seeds the old name. The client does not render it. No migration was added.

## Cross references

"See section 12" and "See section 13" do not name the section title, so those sentences were left as they were. The only section 13 title is the heading, now "13. Partners".

## Checks

- `node scripts/build-for-csp-crawl.mjs`: passed. Prerendered `/terms` and `/privacy` contain no sponsor word and no holding entity.
- `node --experimental-strip-types --test` on partner-wording, legal-pages, public-names, public-nammco, ai-report-operator, ai-tools-frame, no-public-entity, and the legal opt-in assert: passed.
- Full `scripts/*.test.ts`: the legal assert failed once, then was updated. Remaining local failures are `spawnSync dropdb ENOENT` because this machine has no Postgres. CI starts Postgres.

## Apply list

The legal reviewer approves the wording table in the PR. Do not merge until that written OK is on the PR. Do not bump the last updated date unless the reviewer asks. No database or ops step.

## Secrets grade

VERIFIED. The diff adds no mailbox, API key, token, password, service-role key, or staff allowlist. The registration number is removed from smoke previews and from rendered copy. Test files still name it only to assert that output does not contain it.
