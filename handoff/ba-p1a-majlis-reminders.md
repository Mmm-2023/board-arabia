# P1a majlis reminders

Base: `main` at `27d132b6aa6325adc5bf47c681e39435ccf7f429`. One migration, `supabase/migrations/20270110120000_majlis_reminder_windows.sql`. Nothing here is applied, deployed, scheduled, or merged. The send flag stays off. No cron was added. This change does not call a calendar or meeting API.

## Job

A registered member, and an accepted free account, can receive four service reminders for a majlis: one week, one day, about one hour, and at the start. The code and tests are in this PR. Sending is off.

## What shipped

- VERIFIED: `MAJLIS_REMINDERS_ENABLED` turns sending on only when the value is the exact string `true`. Unset, empty, `false`, `TRUE`, and ` true` stay off. While off, the function does not claim a stamp and does not send. It returns HTTP 200 `{ "enabled": false, "would_send": { "t7": n, "t1": n, "t1h": n, "live": n } }` from the read only due query. `supabase/functions/_shared/majlis_reminders.ts` lines 39 and 143.
- VERIFIED: the same flag covers the existing one week and one day kinds and the new one hour and start kinds. `scripts/majlis-reminders.test.ts`.
- VERIFIED: one hour is due when the start is 45 to 75 minutes away, including both edges. 44 and 76 minutes are not due. `reminderIsDue` at `supabase/functions/_shared/majlis_reminders.ts` line 49, and the SQL at `supabase/migrations/20270110120000_majlis_reminder_windows.sql` line 241.
- VERIFIED: the start reminder is due from the start through 15 minutes after the start. 16 minutes after the start is not due. SQL at line 318.
- VERIFIED: the one week window is still after 1 day and through 7 days. The one day window is still after now and through 1 day. Those branches do not use the new late registration rule. SQL comment at line 85.
- VERIFIED: cancelled RSVPs, waitlist, maybe, declined, pending, and rejected rows are not due. A cancelled event is not due. A past event outside the start window is not due. A second claim returns false.
- VERIFIED: a one hour or start row whose registration time is after that window closed is not due. The one week and one day windows are not given that extra rule.
- VERIFIED: accepted free accounts are returned by `majlis_due_reminders`. Pending, waitlist, and rejected requests are not. Postgres test in `scripts/majlis-reminders.test.ts`.
- VERIFIED: new stamp columns are nullable. The four definers use `security definer` and `set search_path = ''`. Anon and public cannot execute the three reminder RPCs or `service_event_reminder_blocked`. Service role can.
- VERIFIED: `supabase/config.toml` lines 26 to 29 say the flag is off, there is no schedule, and the owner approves the cron and the first live send separately.
- VERIFIED: no workflow file calls `majlis-reminders`.

## Draft wording

DRAFT. Nothing is sent. The owner still approves these words.

- One week, unchanged: subject `Board Arabia: {title} is one week away`. Lead `{title} is one week away.`
- One day, unchanged: subject `Board Arabia: {title} is tomorrow`. Lead `{title} is one day away.`
- About one hour, draft: subject `Board Arabia: {title} starts in about one hour`. Lead `{title} starts in about one hour.`
- Start, draft: subject `Board Arabia: {title} is starting now`. Lead `{title} is starting now.`

Each letter also has the region, the start time with the `Asia/Riyadh` label, the venue line, and the Join page link. `reminderLetter` is at `supabase/functions/_shared/majlis_mail.ts` line 264.

- VERIFIED: the Join page link is `majlisPageUrl`, `{site}/dashboard/majlis?event={id}`, from `supabase/functions/_shared/majlis.ts` line 554. The letter tests require that URL in the text and the HTML.
- VERIFIED: the letter text and HTML do not contain a meeting host. The due query returns `meet_ready` and does not return the stored link. The Postgres test fails if the due row text contains the meeting host.
- VERIFIED: when the majlis is virtual and the link is not ready, a member letter uses the existing sentence `The Meet link is not ready yet.` (`src/pages/dashboard/MajlisPage.tsx` line 854). An accepted free account uses the existing sentence `Your place is confirmed. The Join link appears here when it is ready.` (`src/pages/dashboard/account/FreeMajlisScreen.tsx` line 97).
- VERIFIED: the venue address is included only when `includeVenueAddress` says the person is registered. A `members_on_rsvp` address is omitted when that flag is false.
- VERIFIED: the letters have no em dash, no en dash, no other person's email, and no phone number.

## Audience and suppression

- VERIFIED: before this PR, `mailReminder` queued `event_reminder` and then called `sendEmail`. `sendEmail` does not read `email_suppressions`. The queue can skip, and the Gmail letter still went out. `supabase/functions/_shared/majlis_notify.ts` line 137 in the previous file, and `supabase/functions/_shared/mail.ts` `sendEmail`.
- VERIFIED: this PR calls `service_event_reminder_blocked` before claim and again inside `mailReminder` (`majlis_notify.ts` line 156). A blocked row is not claimed and is not sent. A failed check is not treated as permission to send.
- VERIFIED: the block is true when the address is missing, when the hash is in `email_suppressions` for `hard_bounce`, `complaint`, `admin`, or `invalid`, or when `email_preferences` for `event_reminder` is explicitly off. Postgres test.
- INFERRED: a missing preference does not block the Gmail letter. `event_reminder` has `requires_opt_in` false, and the privacy screen still says email choices are coming soon. Treating a missing row as opted out would mean the flag could never send.
- INFERRED: `email_settings.master_enabled` is not an extra gate on this Gmail path. That switch stays off. Requiring it would stop every reminder even after the flag is the exact string `true`. The notice queue still records a skip while the master switch is off, so the Resend notice stream does not send a second copy.
- INFERRED: a free account has no `email_preferences` row, because that table references `members`. A free account can still be blocked by the address hash.
- UNKNOWN: whether the owner wants the master switch to block these letters as well as the flag.

## Screen not built

No product screen was added. `src/App.tsx` has no new route. The `/apply` route is unchanged.

The screen that was not built is an admin reminder count. Staff would use it to see how many one week, one day, one hour, and start reminders are due before anyone turns the flag on, without invoking the function on live data. The off response already returns those four counts. A design brief comes first. This PR stops before that screen.

The shots below are a draft letter preview at `scripts/smoke/majlis-reminder-letters.html`. That file is not a route in the app.

## UX

Surface: service letters, not a logged in shell. Job: tell a registered person a majlis time and where to open it.

- VERIFIED: member destinations are unchanged (Home, Deals, People, Majlis, AI tools). No file under `src/shell` or `src/pages` was edited.
- VERIFIED: phone and desktop shots of the draft letters are `handoff/ba-p1a-majlis-reminders/letters-390.png` and `letters-1440.png`. The layout test checks both widths.
- VERIFIED: body copy in the letter HTML is 16px, which is at least 15px. The Open the majlis link box is at least 44 by 44. The 390px page does not scroll sideways.
- VERIFIED: the draft page uses plain English, no em dash, and no meeting link.
- INFERRED: loading, empty, and error states for an admin count belong on the screen that was not built. The existing majlis pages already have those states and were not changed.
- UNKNOWN: a physical phone was not used. The 390px check is a browser viewport.

## Apply

The operator applies this, in order. Factory does not.

1. Apply `supabase/migrations/20270110120000_majlis_reminder_windows.sql` only, after `20270108120000_boardroom_fields.sql`. `20270109120000` stays free for the other open PR. Do not run `supabase db push`.
2. Redeploy the Edge function `majlis-reminders` only.
3. Do not set `MAJLIS_REMINDERS_ENABLED`. Do not add a cron. Do not invoke the function, including a dry run on live data.

## Redeploy

- VERIFIED: `majlis-reminders` must be redeployed. It is the only function that calls `mailReminder`.
- VERIFIED: `majlis-admin-action`, `majlis-ics`, and `majlis-rsvp` import the shared mail files and do not call `mailReminder` or `reminderLetter`. They do not need a redeploy for this change.

## Secrets

Grade: VERIFIED.

The diff has no API key, service role value, project ref, or mailbox outside `example.com` fixtures. The SQL test builds a sample meeting host from pieces so the due row can be checked, and asserts that host is not in the function result. The migration keeps the host pattern used to set `meet_ready` and does not select the link. Live Edge secret values were not read and were not set. UNKNOWN whether those secrets exist in the hosted project.

## Checks

- `scripts/majlis-reminders.test.ts`: fixed clock, flag, letters, suppression gate, migration shape, Postgres windows, grants, and `search_path`.
- VERIFIED: `scripts/boardroom-fields.test.ts` no longer requires its migration to be the last file. The boardroom file is still present and still sits after the staff profile list migration.
- `scripts/majlis-reminders-shots.test.ts`: 390 and 1440 draft letters.
- Existing `scripts/majlis-m4.test.ts` and `scripts/email-transactional.test.ts` still pass.

## Open questions

1. UNKNOWN: keep the Gmail path for these four letters, or move them to the Resend stream first. This PR keeps Gmail and does not turn it on.
2. UNKNOWN: approve the one hour and start wording above. The cron and the first live send stay separate approvals. The flag stays off.
3. UNKNOWN: should a missing `event_reminder` preference block the Gmail letter, or only an explicit off plus suppression, as built here.
4. UNKNOWN: should a free account be able to turn these letters off without a member preference row.
5. UNKNOWN: is 15 minutes after the start the right end of the live window.
