# APP-4 handoff: push registration, sending off

Base: `5455913` (main, APP-3). Migration `supabase/migrations/20261228120000_push_registration.sql`. It sorts after `20261225120000_member_self_delete.sql` and `20261224120000_board_seats_notifications.sql`. It is not applied. No Edge. No schedule. No message is sent.

## What changed

| Item | Where | Grade |
| --- | --- | --- |
| `public.member_push_tokens` (member, ios or android, token, created, last seen, revoked). RLS enabled and forced. A member selects only their own rows. Anon has no grant | `supabase/migrations/20261228120000_push_registration.sql` | VERIFIED |
| `push_enabled` on `member_notification_prefs`, default false. A missing row stays off | same migration | VERIFIED |
| Definer `register_push_token`, `revoke_my_push_tokens`, `set_push_notifications` with `search_path ''`. Revoke from public, then grant execute to authenticated | same migration | VERIFIED |
| No staff policy. A later staff read must call `private.is_staff()` first | same migration | VERIFIED |
| Account delete removes the rows by replacing `confirm_account_delete` from `20261225120000` | same migration | VERIFIED |
| Push notifications toggle under Notifications. Off unless the member turns it on. Permission is asked only then. The web hides it | `src/components/privacy/PushNotificationSetting.tsx`, `src/pages/dashboard/PrivacyPanelPage.tsx` | VERIFIED |
| Sign-out calls `revoke_my_push_tokens` before the session ends | `src/lib/endSession.ts` | VERIFIED |
| A tapped notification is classified with the APP-2 incoming link helper | `src/shell/pushRegistration.ts` | VERIFIED |
| iOS push capability (`aps-environment` development) and remote-notification background mode | `ios/App/App/App.entitlements`, `ios/App/App/Info.plist` | VERIFIED |
| Android `POST_NOTIFICATIONS`. `google-services.json` stays gitignored | `android/app/src/main/AndroidManifest.xml`, `android/.gitignore`, `README.md` | VERIFIED |
| `@capacitor/push-notifications` 8.0.2 | `package.json` | VERIFIED |

## Shots

Web, toggle hidden, captured in the browser:

- `handoff/app-4-push-registration/web-privacy-1440.png`
- `handoff/app-4-push-registration/web-privacy-390.png`

iOS simulator and Android emulator shots come from the existing app test build jobs (`ios-push-screenshot` and `android-home-screenshot`). They open `/native/push-shot/settings`.

## What the owner sets later

Names only. Nothing here is required for this change to merge. Sending stays off.

- `ANDROID_GOOGLE_SERVICES_JSON` (the gitignored Android services file, only when sending is connected)

A signed iOS build still uses the existing `APPLE_TEAM_ID` variable. This change does not put that value in git.

## Not done

This work did not apply the migration, did not run `supabase db push`, did not deploy Edge, did not merge, and did not send a push or an email.

## Secrets grade

VERIFIED. The diff has no mailbox, API key, token value, Firebase or APNs credential, team id, or certificate fingerprint. Tests use `example.com` only for an external link. The migration has no address.
