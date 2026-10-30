# Daily brief

One pull request. Email stays off. No licensed feed. No extra groups. The brief that already exists gains a headline, a shorter summary, and a draft, approved, published gate. Members see a published brief only.

## Secrets grade

VERIFIED. This diff adds no mailbox, API key, token, password, service role key, user id, or staff name. Tests and screens use example.com style fixture URLs already on the outlet list, plus sample headlines. `.env` is not in the commit. The workflow references `secrets.MARKET_BRIEF_DAILY_SECRET` and `secrets.SUPABASE_URL` only. `DAILY_BRIEF_ENABLED` is a repository variable, not a secret.

## Apply order

Do not apply this from the app or from CI. Do not call retention sweep, suggest intros, invite refill, or any mail function. Do not invoke `market-brief-daily`. Do not set `DAILY_BRIEF_ENABLED`.

1. Migration `supabase/migrations/20270112120000_daily_brief_publish.sql` after `20270111120000_application_withdrawn_closed_retention.sql`.
2. Redeploy Edge `market-brief-daily` only. Do not set `MARKET_BRIEF_DAILY_SECRET`. Do not invoke the function, including `?dry_run=1`.

The repository variable to enable later is `DAILY_BRIEF_ENABLED`, the exact string `true`. Until the owner sets it, the workflow job is skipped. Setting the variable is not part of this change.

## What landed

A stored day has `publish_status` of draft, approved, or published. New rows start as draft, including an insert that asks to start as published (`20270112120000_daily_brief_publish.sql:129`). Admin moves draft to approved, then approved to published (`:284`). A draft with no publishable item cannot be approved. A published or approved day keeps its items if a later run tries to replace them (`:145`).

Members receive the latest published day only when `enabled` and `members_visible` are both true (`:190` and `:197`). Both switches still default to false in `20261215120000_daily_market_brief.sql`. This migration does not turn them on. Items need a headline of at most 90 characters, a summary of at most 300, an outlet, an https link, and a date. Groups stay deals, regulation, and board and leadership. At most 8 items, and at most 3 in one group.

The generator writes those headlines in its own words and drops a headline that copies the source title (`supabase/functions/_shared/daily_market_brief.ts:24`). Friday and Saturday in Asia/Riyadh return skipped and do not search or write (`:218` and `:318`). The Edge write skips a day that is already approved or published (`supabase/functions/market-brief-daily/index.ts`).

`.github/workflows/daily-brief.yml` runs at 02:00 UTC Sunday to Thursday and stays skipped unless `vars.DAILY_BRIEF_ENABLED == 'true'` (`:14` and `:22`). The call stores a draft. It does not publish and it does not send mail.

The member page is still `/dashboard/market-brief`. Home keeps the same five tabs. The card shows three headlines and opens the page. The page has loading, empty, error, weekend, and older brief states. Admin Settings can approve and then publish. Screenshots at 390 and 1440 are in this folder.

## Screenshots

`member-card`, `member-page`, `member-empty`, `member-error`, `admin-status`, and `admin-preview`, each at 390 and 1440.

## Claims

| Claim | Grade |
| --- | --- |
| Migration `20270112120000_daily_brief_publish.sql` sorts after `20270111120000_application_withdrawn_closed_retention.sql` and is the newest file. | VERIFIED by `scripts/daily-market-brief.test.ts` and the migration directory listing. |
| Members see a row only when it is published and both switches are on. Draft and approved rows stay hidden. | VERIFIED in `20270112120000_daily_brief_publish.sql:190` and `:197`. A throwaway local database confirmed a draft stays hidden, a skip from draft to published is rejected, and approve then publish is the path that members can read. |
| A generator insert cannot start as published, and a later write cannot replace an approved or published day. | VERIFIED by the guard at `:129` and `:145`, and by the same local database. |
| Headline max is 90 and summary max is 300. There is no Markets group and no email section. | VERIFIED in `daily_market_brief.ts:24` and the member page. |
| The workflow is inert until `DAILY_BRIEF_ENABLED` is the exact string `true`. It references secrets only. | VERIFIED in `.github/workflows/daily-brief.yml:22`. |
| The job is scheduled at 02:00 UTC so a draft exists before 07:00 in Riyadh. 02:00 UTC is 05:00 in Asia/Riyadh while that zone stays at UTC+3. | INFERRED. The binding text gives 07:00 Riyadh (04:00 UTC) as the time the brief should be in the app, and it requires approval before publish. The workflow therefore generates earlier. The zone offset is not pinned in the cron line. |
| Nothing is emailed. | VERIFIED. The workflow does not call a mail function. The page has no email choice. |
| Edge redeploy is `market-brief-daily` only. | VERIFIED. Only that function imports `daily_market_brief.ts`. |
| Hosted Postgres and hosted Edge accept this migration and this function. | UNKNOWN until the owner applies the migration and redeploys. This change does not apply or deploy. |
| `MARKET_BRIEF_DAILY_SECRET` is unset on the hosted project. | UNKNOWN. The previous brief said not to set it. This pull request does not set it. If it is unset, the function rejects every call even after the variable is turned on. |
| The enable decision belongs to the owner. | VERIFIED as a product gate. This file does not name a person, because public docs cannot carry staff first names. |
