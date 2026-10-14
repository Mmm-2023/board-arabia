# AUTH-1 optional staff two-step

Owner decision, 14 Oct: admin and staff sign-in no longer requires a second factor. The owner was locked out of admin.

## What changed

- Sign-in never holds for a code and never holds staff for enrolment. `routeHold` returns `clear` for staff and for members. `src/lib/mfaFlow.ts`.
- Two-step stays optional on the Security page. Enrol and remove are unchanged. `src/pages/dashboard/TwoStepPage.tsx`.
- The member home 14-day nudge stays off, including after a dismissal expires. `homeMemberPrompt` returns false.
- Edge `staffApiDecision`, `dealRoomStaffFlag`, and `foreignRowRead` no longer check aal2. `supabase/functions/_shared/staff_auth.ts`.
- Migration `supabase/migrations/20261230120000_staff_aal1_access.sql` recreates six definers with only the aal2 condition removed. `search_path` stays empty. Grants and revokes stay as they were. Slot `20261230120000` was free. `20261223120000` and `20261229120000` stay reserved by open pull requests.
- Trust copy on `/security` now says two-step is optional for admin and for every member. `src/content/trust.ts`.
- No legal file changed.

## Functions to redeploy

Every Edge function that imports `requireStaff` or `staff_auth`, directly or through shared code:

- admit-li-share-dry-run
- admit-member
- ai-tool-job
- contact-desk
- deal-room-create
- deal-room-documents
- deal-room-invite
- deal-room-manage
- deal-room-respond
- deal-room-staff
- decide-application
- due-diligence-start
- due-diligence-status
- email-send
- invite-master
- invite-sponsor
- majlis-admin-action
- majlis-apply
- majlis-approve
- marketing-stats
- notify-application
- review-membership
- set-member-status

## Not done here

This change is not applied. No `supabase db push`. No Edge deploy. No merge.

## Checks

- `npx tsc -b` passed.
- A staff session at aal1 passes `staffApiDecision` and `private.is_staff()` on local Postgres. The test names the migration file and does not treat it as the newest file in the directory.
- `/security` shows the optional sentence at 1280 and 390.
- Pull request: https://github.com/Mmm-2023/board-arabia/pull/189
- Head `68a27ef` failed crawl with 0 CSP violations. The crawl waited for the heading "Enter your code" after sign-in, and the page was already the member home. A re-run of that job was refused with HTTP 403. The crawl now expects that session to open the dashboard, then the optional two-step page. A local crawl covered 171 checks with 0 violations.
- `email-send` calls `requireStaff` and has no extra aal check. It is on the redeploy list.

## Secrets

VERIFIED. The new migration and tests use example.com only. No keys, tokens, mailbox names, or project refs were added.
