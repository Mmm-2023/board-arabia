# SM-1 Seat matching

Two undrafted pull requests. Backend first, then the screens. Nothing here is applied, deployed, or merged. The admin switch stays off.

## Pull requests

- Backend: https://github.com/Mmm-2023/board-arabia/pull/228 against `main`. Head `5cb99d7bb4461d6ef34ce9652e499c167b8901d6`.
- UI: https://github.com/Mmm-2023/board-arabia/pull/229 against the backend branch. Head is the latest commit on `cursor/sm-1-seat-match-ui-ebc5`.

## Secrets grade

VERIFIED. The diff has no live mailbox, API key, token, password, service role key, project ref, or staff name. Addresses in tests are `example.com` only. `.env` is not committed.

## Migrations in apply order

Do not apply these from the app or from CI. Do not run `supabase db push`.

1. `supabase/migrations/20270113120000_seat_matching.sql` after `supabase/migrations/20270111120000_application_withdrawn_closed_retention.sql`.

VERIFIED: that file is the newest migration on this branch, and it sorts after `20270112120000` as the brief asked. Slot `20270112120000` was empty on `main` at `f33a4362811d885e9a2fe1d4fbbb53415cd2561a`. INFERRED: leaving that slot unused matches the brief example `20270113120000`.

## Edge redeploy list

None. VERIFIED: this work does not add or edit a Supabase Edge function. Do not deploy Edge.

## Switches to enable

Michael turns on one admin switch after the migration is applied:

- Seat suggestions. Default off. Helper: members see suggested seats and posters see suggested people only while this is on.

VERIFIED: `public.seat_suggestion_settings.enabled` defaults to false, and `staff_set_seat_suggestions` is the only writer. No repository variable. No cron. No email. No in app notice is sent.

## What the rules do

VERIFIED in `scripts/seat-matching.test.ts` against a local database:

- The switch off returns no seats and no people, and Not a fit is rejected.
- A seeker match needs Open to seats, one seat type, one place, and at least one of: Looking for Board seat, a shared sector, or expertise on Skills wanted.
- Company board maps to Chair, Independent director, and the three Committee seat types. Non-executive maps to Non-executive director and Independent director. Adviser maps to Adviser.
- Saudi Arabia or GCC matches. International alone does not.
- A hidden member is not suggested and does not see suggestions.
- A sample card is not suggested. An application removes that seat and that person. Not a fit hides the card, Undo restores it, and closing the seat deletes the row.
- A partner cannot post. A partner who already owns a published seat only sees people with Show my card to partners on.
- Changing the Focus line, the seat narrative, and the seat terms does not change the match.
- The poster payload has no email, phone, or turnover.

INFERRED: a held role of Committee chair counts for a company board, because the held title list uses Committee chair and the seat type list uses the three Committee types. Vice chair does not match, because the designer's type list does not include it.

INFERRED: Gate 5 stays for a seat a partner already posted. New posts by partners are rejected. The brief said partners cannot post in v1.

INFERRED: admitted means `members.status` in invited or active and seat `ksa` or `intl`, which is the check the board seat member functions already use. UNKNOWN: whether invited should be excluded from suggestions.

INFERRED: the introduction note stays at 280 characters because the existing `request_member_intro` reason is 280. The design copy said 400. The request is `Board seat: {title}` plus the optional note, so the seat is named.

INFERRED: the allowance message is the existing monthly allowance, not a weekly one. The brief said to use the existing introduction request.

INFERRED: the disclaimer omits the word endorsement. The brief forbids endorsement wording. The sentence is "Suggestions only, based on what members fill in. Do your own due diligence."

INFERRED: members who already said Yes are not asked again. There is no acknowledgement flag. Open to seats remains the opt in. New Yes saves require one seat type and one place. Older Yes rows are left as stored.

INFERRED: a hidden member who is already open sees the designed hidden note inside May fit you, not a new screen.

UNKNOWN: how many members are open to seats, so no count is quoted.

## Screens

English. No prices. Partners, not sponsors, in the new copy. Five tabs unchanged: Home, Deals, People, Majlis, AI tools. Desktop uses the sidebar. Phone uses the bottom tabs.

Shots at 390 and 1440:

- May fit you: `/opt/cursor/artifacts/seat-match/may-fit-390.png` and `may-fit-1440.png`
- Not open, no fit, loading, error: `not-open-*`, `no-fit-*`, `loading-*`, `error-*`
- Seat reasons: `seat-*`
- People who may fit, none, and not published: `people-*`, `people-none-*`, `pending-*`
- Open to new board seats: `open-card-*`
- Admin switch off: `admin-*`

VERIFIED: those files were captured from the smoke page in this workspace. INFERRED: the fixed bottom tab in a full page shot can sit over tall content in the image. The shell already pads the live page for the tab bar.
