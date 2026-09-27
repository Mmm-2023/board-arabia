# Board Arabia Sadu right rail Waves 1+2

**PR:** https://github.com/Mmm-2023/board-arabia/pull/37
**Branch:** `cursor/sadu-right-rail-785d`
**Base:** `main`
**Next owner:** Michael merge, then Pages.

## What shipped

One SVG, `public/brand/ba-sadu-rail.svg`, traced from the art reference. The field is lavender mist `#E8E4F7`. The selvedge stitch is deep indigo `#1C1343`. The star is indigo `#4B3F9A`. Accents are green `#3A8A4C`. The weave has no white and no porcelain cells. `.ba-sadu-rail` paints that same mist as its background, at 64px on the landing hero and 32px (`.ba-sadu-rail--quiet`) on `/for-members`, `/for-capital`, `/partners`, and the landing Why, Founding, Process, and Partners bands. Below 768px the rail is hidden. The hero title is the header lockup: Najdi mark, Instrument Serif “Board Arabia”, and tracked “Founding membership”, at 3x on desktop and 1.55x at 390px. Light type on the dark hero. Apply, Directory, dashboard chrome, `src/index.css`, Edge functions, and migrations were not changed.

## Secrets

VERIFIED: the diff has no email addresses, API keys, JWTs, booking links, or staff allowlists. New hex values are only `#1C1343`, `#4B3F9A`, `#3A8A4C`, and `#E8E4F7`.

INFERRED: screenshots used the public anon values already in `.env.example`, through a gitignored `.env` that is not in the commit.

UNKNOWN: secrets outside this diff (older history, hosted env). This change does not touch Edge functions or migrations.
