# Board Arabia Sadu right rail Waves 1+2

**PR:** https://github.com/Mmm-2023/board-arabia/pull/37
**Branch:** `cursor/sadu-right-rail-785d`
**Base:** `main`
**Next owner:** Michael merge, then Pages.

## What shipped

One SVG, `public/brand/ba-sadu-rail.svg`, traced from the art reference and filled with locked tokens (`--ba-indigo`, `--ba-sadu-green`, `--ba-lavender-mist`). `.ba-sadu-rail` is the 64px landing hero edge. `.ba-sadu-rail--quiet` is the same file at 32px on `/for-members`, `/for-capital`, `/partners`, and the landing Why, Founding, Process, and Partners bands. Below 768px the rail is hidden. The hero title uses the existing Najdi mark and serif lockup. Apply, Directory, dashboard chrome, `src/index.css`, Edge functions, and migrations were not changed.

## Secrets

VERIFIED: the diff has no email addresses, API keys, JWTs, booking links, or staff allowlists. New hex values are only `#4B3F9A`, `#3A8A4C`, and `#E8E4F7`.

INFERRED: screenshots used the public anon values already in `.env.example`, through a gitignored `.env` that is not in the commit.

UNKNOWN: secrets outside this diff (older history, hosted env). This change does not touch Edge functions or migrations.
