# SEO-1

PR: https://github.com/Mmm-2023/board-arabia/pull/173
Base: e29ca722068f2bba0b525b33269610c5a4ff4338 (main, includes #163 and #160)

## What changed

Each public route uses the brief title and description for the document title, Open Graph, and Twitter tags. Canonical, og:url, sitemap loc, and JSON-LD WebPage url use the trailing-slash form. `/about` has a visible FAQ and FAQPage. `public/llms.txt` is a real file. `robots.txt` allows the named AI crawlers and keeps the private paths disallowed.

## Locked files

`scripts/prerender.mjs`:

- FAQPage allowlist adds `/about` (was line 64).
- Title and og:title checks accept the brief titles (was lines 123-130).
- `writeSitemap()` emits trailing-slash locs (was lines 206-216). `lastmod` stays the build date.

`.github/workflows/pages.yml` line 39 sets `VITE_LEGAL_CONTACT_EMAIL` from the Actions variable of the same name. That is the only pages.yml change.

`check-pages-artifact.mjs` and `public-nammco.mjs` were not edited.

## Email

`PARTNER_EMAIL()` in `src/content/marketing.ts` and Organization JSON-LD read `legalField('contactEmail')`. No mailbox literal. When `VITE_LEGAL_CONTACT_EMAIL` is unset, prerender omits `email` and `contactPoint`. The public footer does not show a contact email. README uses "the contact email in the legal config". The sign-in placeholder is `you@example.com`.

## Not redone

Privacy 1.1: `src/content/legal/privacy.en.ts` line 27.
Terms 1.1: `src/content/legal/terms.en.ts` line 27.
Terms section 13: `src/content/legal/terms.en.ts` line 495.
Footer credit: `src/components/Footer.tsx` line 73.

## Migration

None.

## Secrets grade

VERIFIED. The diff adds no mailbox, key, token, password, or project ref. The only new address-like string is the placeholder `you@example.com`.
