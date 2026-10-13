# A3 + A4 + A5 + A13: account menu

Base: `156917b`, then merged main through `350de40` (staff owner gate, daily market brief, legal partner copy). No migration in this change. No Edge. Pages deploys on merge.

## What changed

One account list, in this order: Profile, This week, Your privacy, Two-step sign-in, Membership, Help. A partner seat adds Partnership first. The label is Partnership. The seat value stays `sponsor`. Delete account is not in that list. It stays on `/dashboard/account/delete` with the same checkbox, disabled confirm, and `deleteCandidateAccount` call. Your privacy links to it.

The header keeps one avatar button. The Account text label is gone. Escape and the backdrop still call `closeAccount`, and focus returns to the avatar. Desktop still shows the sidebar account entry. Phone uses the same list in the sheet. There is no sixth tab.

Digest uses "Back to Home" (`/dashboard`). Privacy, two-step, membership, and the membership checklist use "Back to account" (`/dashboard/profile`). Delete uses "Back to Your privacy". Help links to This week, Your privacy, Two-step sign-in, and AI tools.

## File:line

- List and partner row: `src/shell/destinations.ts:97-127`
- Delete path and header title: `src/shell/destinations.ts:110`, `src/shell/destinations.ts:172`
- Active ring derived from the list: `src/shell/AppShell.tsx:77`, `src/shell/AppShell.tsx:372-390`
- Close, Escape, focus return: `src/shell/AppShell.tsx:115-138`, `src/shell/AppShell.tsx:151`
- Loading and member shells: `src/pages/dashboard/DashboardLayout.tsx:320`, `src/pages/dashboard/DashboardLayout.tsx:376`, `src/pages/dashboard/DashboardLayout.tsx:437-442`
- Member routes: `src/App.tsx:195-196` (`/apply` at `src/App.tsx:117` is unchanged)
- Candidate routes for digest, privacy, two-step, and delete: `src/pages/dashboard/account/AccountRoutes.tsx:187-191`
- Back links: `src/pages/dashboard/DigestPage.tsx:37`, `src/components/privacy/PrivacyPanelView.tsx:41`, `src/pages/dashboard/TwoStepPage.tsx:72`, `src/pages/dashboard/MemberMembershipPage.tsx:21`, `src/pages/dashboard/account/MembershipChecklistView.tsx:96`, `src/pages/dashboard/account/DeleteAccountView.tsx:20`
- Delete under privacy, safeguards unchanged: `src/components/privacy/PrivacyPanelView.tsx:206-220`, `src/pages/dashboard/account/DeleteAccountView.tsx:34-46`, `src/pages/dashboard/account/DeleteAccountScreen.tsx:14`
- Help links: `src/pages/dashboard/HelpPage.tsx:90-104`

## Tests

- `scripts/shell-destinations.test.ts` list order, count, partner row, no sponsor label, delete off the list
- `scripts/shell-chrome.test.ts` sheet row order and active ring on digest, privacy, and two-step
- `scripts/shell-nav.test.ts` one header control, Escape, backdrop close, focus return
- `scripts/account-menu.test.ts` route, back link, and help link targets, plus menu behaviour at 1440 and 390
- No test treats a migration as the newest file

## Shots

Fixture account `member@example.com`. Both widths. The six review shots are committed under `handoff/ba-a3-account-menu/`:

- `menu-1440.png`, `menu-390.png` (open account menu)
- `privacy-1440.png`, `privacy-390.png` (Your privacy, with the Delete account link)
- `partner-menu-1440.png`, `partner-menu-390.png` (partner seat, Partnership first)

The wider set captured for the same fixture session:

- `chrome-1440.png`, `chrome-390.png` (avatar only, no header Account label)
- `menu-1440.png`, `menu-390.png`
- `staff-menu-1440.png`, `staff-menu-390.png` (Switch to admin, 8 rows with Sign out)
- `partner-menu-1440.png`, `partner-menu-390.png` (Partnership, no sponsor label)
- `home-1440.png`, `home-390.png`
- `digest-1440.png`, `digest-390.png`
- `privacy-1440.png`, `privacy-390.png`
- `two-step-1440.png`, `two-step-390.png`
- `membership-1440.png`, `membership-390.png`
- `membership-checklist-1440.png`, `membership-checklist-390.png`
- `help-1440.png`, `help-390.png`
- `delete-1440.png`, `delete-390.png`
- `ai-tools-1440.png`, `ai-tools-390.png`
- `profile-1440.png`, `profile-390.png`

## Apply

None. No migration, no Edge, no settings. After deploy, open the changed screens at 1440 and 390 on the public site and compare with these shots.

## Secrets

VERIFIED. The diff was read. No emails other than `member@example.com`, no keys, tokens, passwords, project refs, or staff allowlists. The menu test uses `example.supabase.co` and an unsigned fixture token, the same shape as the existing shell nav test. `.env` was not committed.
