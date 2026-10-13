# DL-1 public copy no longer names a data location

Base: `6da30503c4f4ebf4c1fbbb739ced8447a106d0e8` (Polish public copy, member layout, AI tools, and admin tap targets, #154). PR: https://github.com/Mmm-2023/board-arabia/pull/155 against `main`.

No migration. No Edge function change. No deploy.

## What changed

Public marketing and trust copy no longer says the data is held in a city, country, or region. The replacement sentence is `All your data is secure and fully encrypted, in transit and at rest.`

- `src/content/landingFeatures.ts:189` tile id is `secure`, title `Secure and encrypted`, body `WHERE_DATA_LIVES[0]`. The existing `encrypted` tile stays at `src/content/landingFeatures.ts:197`, so the new id is `secure`. VERIFIED by reading the file and by `scripts/landing-features.test.ts`.
- `src/content/trust.ts:24` `DATA_SECURE_LINE` is that sentence. `WHERE_DATA_LIVES` at `:27` uses it as the first line. The landing strip (`:66`), apply strip (`:71`), and upload handling line (`:89`) keep members-only, admin-only, and `a specialist AI provider`, and no longer name a place. VERIFIED by reading the file and by `scripts/trust-surfaces.test.ts`.
- `src/content/seo.ts:103` `/security` description drops the hosting city and ends with the same sentence. VERIFIED by the public-page guard.
- `src/pages/SecurityPage.tsx:47` section title is `How your data is protected`. That heading is the user-visible name of the old location section. VERIFIED in the browser on `/security`.

## Left on purpose

- `src/content/legal/privacy.en.ts` still names Frankfurt at the processor, storage, and analytics-cookie paragraphs. The privacy policy was not edited. VERIFIED by an empty diff for `src/content/legal/`.
- `src/content/privacyNotice.ts:74` still says application data and site analytics are stored and processed in Frankfurt, Germany (European Union). That location disclosure stays. It is not rendered by the live `/privacy` page, which uses the legal policy. Flag only: this line does not need a marketing edit. VERIFIED by an empty diff for `src/content/privacyNotice.ts`.
- `src/content/privacyNotice.ts:109` consent banner still says data is hosted in Frankfurt, Germany. Left because `scripts/analytics-phase1.test.ts` pins that sentence and PostHog stays off. The banner returns null unless analytics is enabled, so it is not on the public pages while the flag is off. VERIFIED by reading `src/components/ConsentBanner.tsx` and by an empty diff for tracking files.
- PostHog host, CSP, and tracking tests are unchanged. VERIFIED by an empty diff for those files.

## Tests

- `scripts/landing-features.test.ts` pins the `secure` tile to the new sentence and fails if the rendered landing says Frankfurt or Germany.
- `scripts/trust-surfaces.test.ts` bans frankfurt, germany, and european union in trust copy, and renders every marketing route except `/privacy` and `/terms`. Those pages and their descriptions must not say Frankfurt or Germany. The rendered privacy page still contains both words, so the legal disclosure is still present.
- Local run with example Supabase env values: `scripts/landing-features.test.ts`, `scripts/trust-surfaces.test.ts`, and `scripts/legal-pages.test.ts` passed. VERIFIED.

## Browser

Desktop and phone landing shots show the Secure and encrypted card. The trust page shot shows How your data is protected. A page search on both routes found no Frankfurt, Germany, or European Union. VERIFIED in the browser at `http://127.0.0.1:5173/` and `/security`.

## Secrets grade

Secrets hygiene: VERIFIED. This diff adds no mailbox, key, token, password, service-role key, booking link, user id, or staff name. example.com is not newly introduced.
