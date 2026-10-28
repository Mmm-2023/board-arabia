# PF-4 handoff: one profile completeness card

Base when this started: main `3d8314b` (Fill privacy and terms placeholders from repo variables, #205).
Brief base was `ee1938d` on 7 Oct 2026. Main has moved. Drift is listed below.
Migration: none. Latest migration on main is `20270106120000_majlis_request_review.sql`. Slot `20270107120000` was free and was not used.
Edge: none. Nothing to apply.

## UX skills

Board Arabia UX UI and Dashboard UX desktop and mobile both apply. This is a logged-in member surface. The job is: see the directory card, then fill the first missing field so weekly intros can switch on.

Destinations stay the same on desktop and phone. Desktop uses the left sidebar. Phone uses the bottom tab bar. Both open Home, Deals, People, Majlis, and AI tools (five). Profile, Your privacy, and Two-step sign-in stay in the account list. No new tab and no new route.

Phone targets are at least 48px (`min-h-12`) on Save, the card link, and the password fields. The sticky Save bar sits above the tab bar with `bottom: calc(3.5rem + env(safe-area-inset-bottom))`. The shell header and tab bar already use safe-area insets.

States: the Home card shows a skeleton while the profile read is in flight, an error with Retry if that read fails, and nothing once every visible row is done or the member dismisses it. Profile tags keep their loading skeleton and Retry. Intros keep an empty line when weekly intros are off, and the existing "No suggested introductions this week." line when they are on. Staff do not see the card.

## Drift from the 7 Oct brief

VERIFIED against main `3d8314b` before this change:

- `ProfileCompletenessPrompt` still existed, but Home no longer mounted it. The live profile prompts were the Needs you line "Your profile is N steps from complete" (sector, theme, and location) and, when name, title, or city was empty, the attention item "Finish your profile". `profileMatchNudge` still built "Finish your profile: add sector and availability" inside `assembleHome`, and Home did not render that string.
- Password was still the bottom form on Profile (`#password`). Leave Board Arabia was still on Profile and also in Your privacy.
- Form labels were still Headline and Company. Directory cards still say Firm. That directory label was left as it is. The brief changes the form only.
- `src/shell/destinations.ts` is locked, and `resolveRedirect` is pathname-only. `/dashboard/profile#password` is not a new route. Profile redirects that hash to `/dashboard/two-step#password`.

INFERRED, and left in place: `primaryHomeCta` still returns "Complete profile" when name, title, or city is empty. That is the directory soft-gate, and `scripts/home-snapshot.test.ts` locks the CTA order. It is not a second completeness card. The one card is the only completeness prompt. On a short phone the next-action button can sit below the fold.

UNKNOWN: a pass on a physical phone. Shots are Chrome at 390 and 1440. CI results are in the PR after the checks finish.

## What changed

| Review item | Change | Test |
|---|---|---|
| One definition | `src/lib/profileCompleteness.ts` rows: Directory card complete (photo, name, title, organisation, city) and Weekly intros on (one sector and availability). A theme is not a gate. Each row is a tick or "Add 1 thing" / "Add n things". No percentage. | `scripts/profile-completeness.test.ts` "one completeness module" |
| PF-6 and PF-7 hooks | Board seat row and intro-reasons row stay hidden until the caller passes those fields. Board sits between the card row and the weekly row. | same file, "PF-6 and PF-7 rows" |
| One Home card | Replaces the checklist, the nudge sentence, the "Finish your profile" attention item, and the old UX-F line. Copy: "Two minutes to switch on weekly intros." CTA: "Fill it in" to the first missing section. Hides when every visible row is done. Dismissal still uses `ba-profile-prompt:<user id>` in localStorage. Staff get null. Password stays a separate Needs you item and stays above the card. | `scripts/profile-suggestions-prompt.test.ts`, `scripts/profile-completeness.test.ts` browser section |
| Intros empty | Uses `weeklyIntrosOn`. Empty copy: "Add a sector and your availability to switch on weekly intros." Link goes to `#focus`. | `scripts/profile-suggestions-prompt.test.ts` |
| Profile order | Card preview first (`data-profile-card-preview`), then benefit rows, then Your card, Focus, Private. Form labels Title and Organisation. DB columns stay `headline` and `company`. | browser fold assertion in `scripts/profile-completeness.test.ts` |
| Save | Desktop: Save at the top of the form and at the end. Phone: sticky Save, 48px, safe-area aware, only after an edit. Leaving with unsaved changes asks "Leave this page? Your profile changes are not saved." | same browser test |
| Password | Moved to Two-step sign-in. Invited members (`must_set_password`) see the form first. Others see it under two-step. `/dashboard/profile#password` redirects to `/dashboard/two-step#password` and the form scrolls into view. Home still links to the old hash. | `scripts/member-ux-wave1.test.ts`, `scripts/shell-nav.test.ts`, browser route section |
| Leave | Removed from Profile. Stays in Your privacy and on `/dashboard/profile/leave`. | `scripts/wave2-ae.test.ts` |

File lines (this branch):

- Definition: `src/lib/profileCompleteness.ts:3` (card line), `:87` (rows), `:122` (weekly intros on), `:139` (card visibility).
- Home card mount: `src/pages/dashboard/DashboardHome.tsx:266` and `:375`. Render slot: `src/pages/dashboard/HomeSnapshotView.tsx:154`.
- Password item still first among security rows: `src/pages/dashboard/DashboardHome.tsx:258`.
- Profile redirect: `src/pages/dashboard/ProfilePage.tsx:403`. Sections: Your card `:460`, Title `:467`, Organisation `:468`, Focus `:559`, Private `:619`. Sticky Save `:679`.
- Unsaved prompt: `src/lib/confirmLeave.ts` and `ProfilePage.tsx:298`.
- Password form: `src/pages/dashboard/SetPasswordForm.tsx`. Placement: `src/pages/dashboard/TwoStepPage.tsx:86`.
- Intros: `src/pages/dashboard/IntrosPage.tsx:149`, empty state `src/pages/dashboard/IntroSuggestions.tsx:44`.

Old strings removed from product code: "Finish your profile: add sector and availability", "Add your sectors, themes, and location. Intro suggestions depend on them.", "Add your sectors and themes to get suggested introductions.", and the Needs you profile-gap lines.

## Email

Email stays parked. This PR does not call sendEmail, mail.ts, or ADMIN_NOTIFY_EMAIL. A later reminder that a profile is incomplete would be a new in-app notice or, only after email is unparked, a separate template. The Home card is the switch.

## Shots

Example member only (`member@example.com`). Before and after, 390 and 1440, in this folder.

- `profile-fold-*-before.png` / `profile-fold-*-after.png`: first screen. After shows the card preview and the Name field.
- `profile-full-*-before.png` / `profile-full-*-after.png`
- `profile-sticky-save-390-after.png`: Save after an edit, above the tab bar.
- `home-incomplete-*-before.png` / `home-incomplete-*-after.png`: one card, "Fill it in".
- `home-complete-*-before.png` / `home-complete-*-after.png`: card hidden. Next action is Explore deals.
- `intros-empty-*-before.png` / `intros-empty-*-after.png`
- `password-*-before.png` / `password-*-after.png`: password now on Two-step sign-in.
- `home-set-password-*-before.png` / `home-set-password-*-after.png` and `set-password-flow-*-after.png`: Home "Set password" opens the password form first.

The "Couldn't refresh" line on Home is the existing refresh banner. The example mock does not satisfy every Home read. It is in the before shots as well.

## Secrets

VERIFIED. `git diff` plus the new source and test files were scanned for keys, tokens, private keys, live mailboxes, nammco, em dashes, and en dashes. The only addresses are `member@example.com`. Matches on "sponsor" are the existing seat value `seat === 'sponsor'` and the `SponsorBadge` component name, not new user-facing sponsor copy. No prices. No AI provider name.

## Sasha apply / redeploy

None. No migration. No Edge deploy.
