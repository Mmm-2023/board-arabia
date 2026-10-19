# MJ-3 handoff: virtual majlis on Google Meet

Base: `main` at `f20231aa2098c165241de567ab485ea91125bb6b`. One migration, `supabase/migrations/20270102120000_majlis_virtual_meet.sql`. Nothing here is applied, deployed, or scheduled. No reminder, cron, or send was added.

`20270101120000` was free on `origin/main` when this branch was cut. This change uses `20270102120000`, the slot named in the brief, so it does not take the earlier name.

## Apply list

Apply `20270102120000_majlis_virtual_meet.sql` only, after `20261231120000_newsletter_analytics.sql`, via the database MCP. Do not run `supabase db push`. Do not deploy from this change. Set the Edge secrets below, then redeploy the three functions.

## Secrets grade

- `GOOGLE_MAJLIS_CLIENT_ID`: UNKNOWN. Not in this diff. Not created here.
- `GOOGLE_MAJLIS_CLIENT_SECRET`: UNKNOWN. Not in this diff. Not created here.
- `GOOGLE_MAJLIS_REFRESH_TOKEN`: UNKNOWN. Not in this diff. Not stored in the database.
- `MAJLIS_CALENDAR_ID`: UNKNOWN. Optional. If unset, the first sync creates the secondary calendar and stores only its id in `public.majlis_google_calendar`.
- Fail closed: VERIFIED. If any of the three OAuth values is missing, `performMajlisGoogleSync` does not call Google. The majlis row still saves. Staff see "Google not connected."
- Repo scan of this diff: VERIFIED. No API key, refresh token, service role key, project ref, or mailbox outside example.com. The Meet sample in tests is the public documentation code, not a live room.

## What staff do

A staff create or update with format `virtual` saves the majlis, then calls `syncStoredMajlis` (`supabase/functions/_shared/majlis_calendar.ts`). Cancel calls the same path with `cancel`. The HTTP entry is `majlis-calendar-sync` (`supabase/functions/majlis-calendar-sync/index.ts`). It requires a staff JWT. A second factor is not required.

The Google call uses scope `https://www.googleapis.com/auth/calendar.app.created` only. The event is inserted with `conferenceData.createRequest`, `conferenceSolutionKey.type` `hangoutsMeet`, and `conferenceDataVersion=1`. The body sets `guestsCanSeeOtherGuests` and `guestsCanInviteOthers` to false and does not send `attendees`.

The calendar summary is `Board Arabia Majlis`, time zone `Asia/Riyadh`.

A staff field "Fallback if sync fails" accepts `https://meet.google.com/{code}` only. The member view prefers the Google link, then the fallback. Query strings are rejected.

## Who can see the link

`private.majlis_events_member_rows` reveals `meet_url` the way it reveals `venue_address`: staff, the host, or a signed-in member with a registered RSVP. It is null after `ends_at`, and null when the majlis is cancelled, except for staff. Waitlist, maybe, and declined do not see it. `majlis_events_sponsor` is not recreated and has no Meet column. The base table is not granted to anon or authenticated.

`majlis-ics` adds the link to `LOCATION`, `DESCRIPTION`, and `URL` only for a registered member, and only while the majlis is still running and not cancelled. The file has no `ATTENDEE` line.

Virtual RSVP seats are 149 when there is no member host, and 148 when there is one. That is 149 members plus one staff organizer, or 148 members plus the member host plus one staff organizer. The total stays at or under 150. A further Yes uses the existing waitlist. Co-hosts are out of this change. A host adds them in Meet by hand.

## One-time Google sign-in

The owner signs in. The owner runs the exchange and writes the refresh token straight into Edge secrets. The token does not go in the database or the repo.

1. The owner opens Google Cloud Console while signed in as the Workspace user who should own the Majlis calendar (the Meet organizer). Use a project that is only for this calendar. Enable the Google Calendar API.
2. OAuth consent screen: User type Internal. App name: Board Arabia Majlis. Add one scope: `https://www.googleapis.com/auth/calendar.app.created`. Google's consent text for that scope is "Make secondary Google calendars, and see, create, change, and delete events on them." Do not add Gmail, Drive, Meet member, or any other Calendar scope. Do not reuse the Gmail OAuth client.
3. Create an OAuth client of type Desktop. The operator keeps the client id and client secret out of git and out of chat.
4. The owner opens this URL (client id only, no secret). If the Desktop client shows a different loopback redirect, use that exact URI in both this URL and the exchange:

`https://accounts.google.com/o/oauth2/v2/auth?client_id=CLIENT_ID&redirect_uri=http://127.0.0.1&response_type=code&scope=https://www.googleapis.com/auth/calendar.app.created&access_type=offline&prompt=consent&include_granted_scopes=false`

5. The owner signs in with the Workspace account, not a personal Gmail account. The consent screen shows the app name and the single permission above. Allow.
6. The browser goes to `http://127.0.0.1/?code=...` and may not load a page. The code is in that address. It expires in minutes. It is not the refresh token. Never paste the code or the refresh token into chat or the repo.
7. Run the code exchange on the owner's own machine, then clear the terminal:

```
curl -s https://oauth2.googleapis.com/token \
  -d client_id=CLIENT_ID \
  -d client_secret=CLIENT_SECRET \
  -d code=CODE \
  -d grant_type=authorization_code \
  -d redirect_uri=http://127.0.0.1
```

8. Paste `GOOGLE_MAJLIS_CLIENT_ID`, `GOOGLE_MAJLIS_CLIENT_SECRET`, and `GOOGLE_MAJLIS_REFRESH_TOKEN` into Supabase Dashboard, Edge Functions, Secrets. Do not pass those values to `supabase secrets set`. That command would keep them in the shell history.
9. After the first sync creates the Board Arabia Majlis calendar, paste its id into the same secrets screen as `MAJLIS_CALENDAR_ID`. Set it once so a later sync does not create a second calendar.

10. Apply the migration via MCP, then redeploy `majlis-calendar-sync`, `majlis-admin-action`, and `majlis-ics`.

To stop it: the owner removes the app at myaccount.google.com, Security, Third-party connections, or the operator deletes the three secrets.

## Join redirect

Not built. The gated raw link stays.

A Join URL on our server would need to 302 only for a signed-in member who has registered, and both the page button and the `.ics` URL would have to point at that URL. That is not a small add on this app:

- Sign-in is the Supabase session in local storage, not a cookie. A normal link, including a URL inside a calendar file, does not send that session. The function cannot tell that the caller is signed in.
- The function host is not the site host. A signed-in page that fetches a cross-origin 302 cannot read the Location header, so the browser cannot follow it to Meet.
- A token inside the `.ics` URL would open the meeting without a signed-in session, and it would put a credential in a file the member downloads.
- Cookie sign-in, so one same-origin 302 could serve the button and the calendar file, would change how members sign in.

Registered members still receive the Meet link from the member view and in their own `.ics`, and only while the majlis is running. The host and staff see it too. It is hidden after the event and when the majlis is cancelled, except for staff. Nothing records join clicks. Attendance capture waits for the owner.

## Copy

The majlis page may say the session runs on Google Meet with Q&A and polls. It does not mention co-hosts, attendance reports, or livestream.

## Screens

Shots are under `/opt/cursor/artifacts/mj-3-virtual-majlis/`. The browser pass is local. On GitHub Actions the admin shell does not finish compiling while the rest of the suite is running, so that test skips there. The copy checks still run in CI.

- `staff-create-1440.png`, `staff-create-390.png`
- `member-before-1440.png`, `member-before-390.png`
- `member-after-1440.png`, `member-after-390.png`

Shell: Board Arabia UX UI (member and admin majlis, decision first, same destinations) and Dashboard UX desktop and mobile (sidebar and bottom tabs, 44px targets, empty queue, honest Google state).

## Checks

1. Link gate: VERIFIED in `20270102120000_majlis_virtual_meet.sql` (`meet_url` case) and `icsMeetLink`.
2. No Google attendees: VERIFIED in `buildMajlisGoogleEventBody` and the sync test.
3. Fail closed: VERIFIED. Missing secrets do not call Google. The majlis still saves.
4. 150 cap: VERIFIED. 149 member seats plus one staff organizer, or 148 member seats plus the member host plus one staff organizer. The next Yes waits. The postgres check is in `scripts/majlis-calendar-rsvp.test.ts`.
5. Copy: VERIFIED. The page may say Google Meet with Q&A and polls. No co-host claim, no attendance report, and no livestream.
