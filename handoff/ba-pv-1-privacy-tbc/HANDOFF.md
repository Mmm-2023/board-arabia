# PV-1 privacy placeholders

PR: https://github.com/Mmm-2023/board-arabia/pull/205
Branch: `cursor/pv-1-privacy-tbc-28b3`
Base: `main` `ac041d4ae9226e554b4caf31d0c66afae7e5b3df`
Date: 28 Oct 2026

## What this changes

The Pages build and the PR check build now pass five more legal fields from GitHub Actions repository variables. The values are `${{ vars.NAME }}` only. An empty variable still renders `To be confirmed`.

| Field | Where it shows | Variable | Result |
| --- | --- | --- | --- |
| Registered address | privacy 1.1, terms 1.1 | `VITE_LEGAL_ADDRESS` | Wired |
| Privacy contact | privacy 1.2 and the other contact sentences, terms 1.2 and 18 | `VITE_LEGAL_CONTACT_EMAIL` | Already wired. No change |
| Data protection officer | privacy 1.3 | `VITE_LEGAL_DPO_CONTACT` | Wired, because 1.3 still uses `[DPO CONTACT]` |
| AI provider phrase | privacy 5.4(c) and 7.1, terms 9.6 | `VITE_LEGAL_AI_PROVIDER` | Wired. The phrase is "a third-party AI model provider". No provider name |
| Service mailbox | privacy 6.2 | `VITE_LEGAL_SERVICE_EMAIL` | Wired |
| Partner mailbox | not printed on `/privacy` or `/terms` | `VITE_LEGAL_PARTNERS_EMAIL` | Wired. No current screen reads it |

## LEGAL CHANGE

Privacy clause 11.2 (`src/content/legal/privacy.en.ts:508`, id `c-11-2`) now reads:

`We have not appointed a data protection officer. Questions about your data go to [CONTACT EMAIL].`

The mailbox is the existing `[CONTACT EMAIL]` token. `legalField()` fills it from `VITE_LEGAL_CONTACT_EMAIL`. The source has no mailbox literal.

Clause 1.3 is unchanged (`src/content/legal/privacy.en.ts:39`): `Data protection officer: [DPO CONTACT].` That is why `VITE_LEGAL_DPO_CONTACT` is in both Build steps (`.github/workflows/pages.yml:40-44`, `.github/workflows/pr-checks.yml:33-37`). Clause 11.2 no longer reads that token, so the variable fills 1.3 only.

The approved sentence was relayed by Code PM. The earlier draft that only dropped `[DPO CONTACT]` from the old "write to" sentence was not used.

## Claims

- VERIFIED. With every legal field set to an example.com fixture, privacy and terms plain text contain no `To be confirmed` and no `[TOKEN]`. Covered by `scripts/legal-pages.test.ts:370` and the route test at `:495`. The fixture prerender of `/privacy/` and `/terms/` also has a `To be confirmed` count of 0.
- VERIFIED. Privacy 1.1 renders `of 1 Example Road, Example City ("we", "us")` when the address fixture is set. Privacy 1.3 renders `Data protection officer: No DPO appointed, privacy questions to privacy@example.com.` Privacy 5.4(c) renders `a third-party AI model provider, for AI tools`. Privacy 6.2 renders `sent from service@example.com`. Privacy 7.1 renders `processed by a third-party AI model provider at its hosting location`.
- VERIFIED. Privacy 11.2 renders `We have not appointed a data protection officer. Questions about your data go to privacy@example.com.` and that sentence contains no `To be confirmed`. Test: `scripts/legal-pages.test.ts:392`.
- VERIFIED. Unsetting only the AI provider leaves exactly two `To be confirmed` hits in the privacy plain text, both on the AI provider sentences (`To be confirmed, for AI tools`). Test: `scripts/legal-pages.test.ts:407`.
- VERIFIED. Both workflow Build steps reference `VITE_LEGAL_CONTACT_EMAIL`, `VITE_LEGAL_ADDRESS`, `VITE_LEGAL_DPO_CONTACT`, `VITE_LEGAL_AI_PROVIDER`, `VITE_LEGAL_PARTNERS_EMAIL`, and `VITE_LEGAL_SERVICE_EMAIL` as `${{ vars.NAME }}`. Test: `scripts/legal-pages.test.ts:419`. No other lines in those workflow files were edited.
- VERIFIED. Terms 9.6, from the fixture prerender, reads: `Uploaded files are processed by our AI provider, a third-party AI model provider, as described in the Privacy Notice.` `src/content/legal/terms.en.ts` was not edited. INFERRED acceptable: the repetition is grammatical and the brief said to leave it.
- VERIFIED. `src/lib/aiToolConfig.ts` reads `legalField('aiProvider')`, and `fillLegal` in `src/lib/aiToolCopy.ts` substitutes `[AI PROVIDER]`. INFERRED: an AI tool footer built with the variable set will show "a third-party AI model provider". No AI tool screen was opened in the browser for this item.
- VERIFIED. `PARTNERS_EMAIL()` is defined in `src/config/legal.ts` and has no other production caller. The partner interest form does not read it. INFERRED: wiring `VITE_LEGAL_PARTNERS_EMAIL` does not change that form today. A later caller can use the same variable.
- VERIFIED. The privacy diff is the single 11.2 sentence. The backup sentences (about lines 432 and 474) are untouched. `src/content/privacyNotice.ts`, `src/config/legalPageIdentity.ts`, `src/content/legal/terms.en.ts`, `scripts/prerender.mjs`, `scripts/check-pages-artifact.mjs`, and `scripts/public-nammco.mjs` are untouched.
- VERIFIED. Open PR #198 edits the backup sentences in `privacy.en.ts` (around lines 429 and 471), `privacyNotice.ts`, and nearby assertions in `scripts/legal-pages.test.ts`. It does not edit clause 11.2. INFERRED: a merge should keep both hunks. If #198 lands first, merge `main` with a normal commit and do not put the backup sentence back by hand.
- VERIFIED. The footer on the rendered privacy and terms pages is `powered by nammco`. The route test rejects a `sponsor` match. `bash scripts/pages-artifact-gate.sh` exited 0 on the fixture build.
- VERIFIED. Shots below. Before shots are the unmodified main page with the legal env unset (old 11.2, `To be confirmed` still in 1.1, 1.3, 5.4(c), 6.2, and 7.1). After shots are `/privacy/` from a fixture build. Full page, viewports 390x844 and 1440x900. The capture checked the clause text before saving. The pictures use example.com only.
- INFERRED. After the operator sets all six variables and the Pages deploy runs, live `/privacy/` and `/terms/` should show zero `To be confirmed`. This was not curled against production. Production still has the old build until this merges and the deploy runs.
- UNKNOWN. Whether the repository variables are already set. Do not set them from this handoff. The real address and mailboxes stay in the operator note, outside the repo.
- UNKNOWN. The commercial registration extract, and the placeholders in `src/content/privacyNotice.ts`. Out of scope. Not edited.
- UNKNOWN. The backup day count on PR #198. Out of scope. Not edited.

## Shots

- `handoff/ba-pv-1-privacy-tbc/privacy-390-before.png`
- `handoff/ba-pv-1-privacy-tbc/privacy-1440-before.png`
- `handoff/ba-pv-1-privacy-tbc/privacy-390.png`
- `handoff/ba-pv-1-privacy-tbc/privacy-1440.png`

## Tests

`npm run lint` on the edited files: exit 0. Repo-wide `oxlint` still prints existing warnings in other files.

`npm run build` runs `tsc -b` first. It exited 0 with the legal env unset, and again with the example fixtures.

`node --experimental-strip-types --test scripts/*.test.ts`

- Legal env unset: 960 pass, 0 fail, 6 skipped. Exit 0.
- The six example fixtures exported: 960 pass, 0 fail, 6 skipped. Exit 0. Re-run after the AI tool test isolation, same result.

The 6 skips are existing browser-shot tests that skip when puppeteer's bundled Chrome is absent. They skipped on both runs. The privacy shots in this folder were taken with system Chrome.

`scripts/ai-tools-frame.test.ts:343` clears ambient `VITE_LEGAL_*` for the test named "with no env set", then restores them. The assertions at lines 361-369 still require `To be confirmed`. Without that clear, exporting `VITE_LEGAL_AI_PROVIDER` made Vite fill the provider and the assertion failed. The assertion text was not loosened.

`bash -eo pipefail scripts/pages-artifact-gate.sh` on the fixture build: exit 0.

## Secrets grade

VERIFIED.

Added lines in the diff were scanned for a mailbox that is not `example.com`, a JWT prefix, the street number and street name from the operator note, a boardarabia mailbox, and em or en dashes. Zero hits. Seven `example.com` fixtures. Ten `${{ vars.VITE_LEGAL_... }}` references. The one `sponsor` hit is the route test asserting the rendered HTML has none.

`pages.yml` already contained the public Supabase URL and anon key on the lines above this edit. Those lines were not added or changed. They are not repeated here.

No real address, mailbox, key, or token was added to the source, the tests, this handoff, or the shots.

## After merge

The operator sets `VITE_LEGAL_ADDRESS`, `VITE_LEGAL_DPO_CONTACT`, `VITE_LEGAL_AI_PROVIDER`, `VITE_LEGAL_PARTNERS_EMAIL`, and `VITE_LEGAL_SERVICE_EMAIL` under Actions variables, then re-runs the Pages deploy. `VITE_LEGAL_CONTACT_EMAIL` is already live. Leave a variable empty and that field stays `To be confirmed`.

Then curl `https://boardarabia.com/privacy/` and `https://boardarabia.com/terms/` and count `To be confirmed`. Expected count is 0 when all six variables are set.

No migration. No Edge function change. Do not merge from this handoff.
