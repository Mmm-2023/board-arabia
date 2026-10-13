# Daily market brief

One PR. Outlets, days, settings, the daily Edge function, the admin panel, and the member card and page ship together. The function is not scheduled.

## Secrets grade

VERIFIED. This diff adds no live mailbox, API key, token, password, service-role key, user id, or staff name. Tests use example.com and fixture URLs on the seeded outlet domains. `.env` is not in the commit. The search secret name is the existing `BA_DD_SEARCH_API_KEY`. Its value is parked and is not in the repo. The function also checks `MARKET_BRIEF_DAILY_SECRET`. Do not set that secret in this apply.

## What landed

Admin edits an outlet allowlist. A daily function can later pull headlines only from enabled outlets and store an AI summary in three groups: deals, regulation, and board and leadership. Every stored item keeps the outlet name, the source URL, and the date. The member page labels each item "AI summary" and ends with "AI-generated from the linked sources. Check the source before relying on it. Not investment advice."

The model id is written only on `market_brief_days.model_id` (`supabase/functions/market-brief-daily/index.ts:56`). No RPC and no HTTP body return it (`supabase/functions/_shared/daily_market_brief.ts:369-376`). The vendor is not named in the UI.

`enabled` and `members_visible` default to false (`supabase/migrations/20261211120000_daily_market_brief.sql:11-12` and `:26`). Members receive the latest ok brief only when both are true (`:128-129`). Otherwise the member RPC returns null, the Home card stays hidden (`src/pages/dashboard/DashboardHome.tsx:367`), and the page says "No brief today." (`src/pages/dashboard/DailyMarketBriefPage.tsx:41`). A member RPC error also becomes that empty state. No error is shown to members.

## Matching rule

`outletForUrl` at `supabase/functions/_shared/outlet_allowlist.ts:74`. https only, no credentials, port empty or 443, host lowercased with a trailing dot removed, label-boundary host match, optional path prefix, disabled outlets never match. The same function filters search hits and AI output items.

## Seeded outlets

`supabase/migrations/20261211120000_daily_market_brief.sql:64-76`. The same 11 rows are `STARTER_OUTLETS` at `supabase/functions/_shared/outlet_allowlist.ts:20`.

| Outlet | Domain | Path prefix |
| --- | --- | --- |
| Saudi Press Agency | spa.gov.sa | |
| Argaam | argaam.com | /en |
| Arab News | arabnews.com | |
| Saudi Gazette | saudigazette.com.sa | |
| Asharq Business with Bloomberg | asharqbusiness.com | /en |
| Zawya | zawya.com | |
| MEED | meed.com | |
| Saudi Exchange (Tadawul) announcements | saudiexchange.sa | |
| Capital Market Authority | cma.org.sa | |
| Ministry of Investment | misa.gov.sa | |
| Vision 2030 | vision2030.gov.sa | |

Path prefix rows keep English URLs only. `/en/article` matches. `/english` and `/ar/x` do not.

## Parked search key

The key is `BA_DD_SEARCH_API_KEY` (`supabase/functions/_shared/daily_market_brief.ts:19`). A blank key returns HTTP 200 `not_configured` before any outlet read, search call, model call, or database write (`:285-286`). The test replaces global fetch and counts every injected call. The count stays zero (`scripts/daily-market-brief.test.ts:78`). Admin sees "Not configured: search key not set." (`src/lib/dailyMarketBrief.ts:9` and `:92`).

## Schedule

Build and deploy only. `supabase/config.toml:155-159` pins `verify_jwt = false` and says not to set the secret, not to add a schedule, and not to invoke. There is no workflow file and no cron. An unset `MARKET_BRIEF_DAILY_SECRET` rejects every call (`daily_market_brief.ts:355-356`). POST only. `?dry_run=1` does not write.

## Retention

`marketBriefDayDue` keeps a day for 90 days (`daily_market_brief.ts:93`). A real run deletes older days after a successful write (`:337`). Dry runs and the parked-key path do not. `retention-sweep` is unchanged. Follow-up, only if a later decision wants the sweep to own this table while the daily function stays off: the sweep is off limits in this change, so it does not call the helper.

## Apply order for the operator

Do not apply this from the app or from CI. Do not call retention-sweep, suggest-intros, invite refill, PostHog, invite-sponsor, or any mail function. Do not invoke `market-brief-daily`.

1. Migration `supabase/migrations/20261211120000_daily_market_brief.sql` after `20261210120000_sectors_city_about.sql`.
2. Deploy Edge `market-brief-daily` only. Do not set `MARKET_BRIEF_DAILY_SECRET`. Do not add a cron or a routine. Do not invoke the function, including `?dry_run=1`.

The search key stays parked. Turning the two admin switches on is a later decision, after a schedule exists and a dry run has been reviewed. Do not do that as part of this apply.

## Smoke for the operator

After the migration only, with no Edge invoke:

1. Admin Settings shows Daily market brief, the 11 seeded outlets, both switches off, and "Not configured: search key not set."
2. A member Home has no Daily market brief card.
3. `/dashboard/market-brief` says "No brief today."

## Checks

`scripts/daily-market-brief.test.ts` covers the allowlist accepts and rejects, the zero-network parked key, dropped invented URLs, staff `private.is_staff()` on the four admin RPCs, both switches defaulting off, and the member route. `private.is_staff()` already requires aal2 (`supabase/migrations/20261127120000_staff_aal2_private_files.sql:8-21`). This migration does not replace that function.

The existing per-member market entry brief and `supabase/functions/_shared/suggest_intros.ts` are not in this diff.

## Claims

| Claim | Grade |
| --- | --- |
| Base at start was `7c3f0ad9`. Migration slot `20261211120000` was free and sorts after `20261210120000`. Main later added the weekly digest at `20261212120000`. This branch merges that commit. Both routes stay. | VERIFIED at start, then by the merge. |
| A blank search key makes zero network calls and returns `not_configured`. | VERIFIED by `scripts/daily-market-brief.test.ts:78`. |
| Both switches default to false, and the member RPC returns null unless both are on. | VERIFIED at `20261211120000_daily_market_brief.sql:11-12`, `:26`, `:128-129`. |
| Staff writes go through `private.is_staff()`, which requires aal2. RLS is forced. Definers use `search_path = ''`. | VERIFIED in this migration and in `20261127120000_staff_aal2_private_files.sql:8-21`. |
| No cron, no routine, and no schedule secret is set by this PR. | VERIFIED. No workflow file. `config.toml:157` says not to set it. |
| The model vendor is not named in member or admin UI. | VERIFIED by the client copy test. A built-bundle scan runs when `dist/assets` exists. |
| A live dry run on the hosted project. | UNKNOWN. The function must not be invoked as part of this apply. |
| Hosted Edge accepts the new function folder. | INFERRED from the existing function layout. UNKNOWN until deploy. |
