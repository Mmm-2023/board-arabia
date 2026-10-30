# UX-P1-3 type and tap floors

Styling and layout only, on Directory, Deal rooms, and Post a seat. Base is `origin/main` at the branch point `4f6c510ce7f60c1856eeb1d7e5c6f6292e5215f6`. No migration. No Edge deploy. No email. No force push. Not merged.

## What changed

Body and helper text on these three pages is 16px, with a 15px floor for anything a member must read. Status chips may stay at 13px (`data-chip`). Buttons and button-like links are 17px sentence case. Tap targets (buttons, chips, links, inputs, selects, and checkbox rows) are at least 44px. Checked at 390, 768, and 1440.

The floor is `data-read-floor` in `src/index.css` (from line 1445). It is set on:

- Directory list, `src/pages/dashboard/DirectoryBoard.tsx` line 104
- Directory loading and error, `src/pages/dashboard/DirectoryPage.tsx` lines 88 and 99
- Directory empty, `src/pages/dashboard/DirectoryEmpty.tsx` line 36
- Deal rooms, `src/pages/dashboard/DealRoomsView.tsx` line 40
- Post a seat, `src/pages/dashboard/MemberBoardSeatsView.tsx` line 418

Post a seat checkboxes are a 44px row (label and box together). The visible mark stays 20px. `src/pages/dashboard/MemberBoardSeatsView.tsx` line 549. The same row is used by the directory introduction checkbox in `src/pages/dashboard/DirectoryIntroAction.tsx`, which Intros suggestions also render. Intros copy size is unchanged because that page does not set `data-read-floor`.

Deal section tabs no longer clip under a fade. They wrap, stay 16px, and the pill hugs its labels. `src/shell/SectionTabs.tsx` line 65. Same destinations. Other hubs that share this tab row (People, AI tools, Majlis, and the rest of Deals) wrap the same way.

## States

Kept, and still on the pages:

- Directory loading skeleton, error with Retry, empty with Complete your profile and Invite 2, and filtered zero.
- Deal rooms loading, error with Retry, empty with Open a room, admin empty ("None are open."), and the denied permission state already on `RoomsPage`.
- Post a seat error alert, and Saving... on the submit button. The form is local, so there is no remote loading skeleton to add.

Shots: `handoff/ba-ux-p1-3/before-*.png` and `after-*.png` at 390, 768, and 1440, plus empty, error, and loading at 390.

## Left alone (not this wave)

These were in the 30 Oct review and were not restyled. A compact Directory, shorter tab names, or a new screen would be a redesign.

- New room radios (`src/pages/dashboard/CreateRoomForm.tsx`)
- Board seats list and seat detail (only the Post a seat form changed)
- Your privacy, Invites, Help, Real estate, Mandates
- Phone bottom bar labels stay 12px. That chrome is shared and was not part of this page floor.

## Locks

Not touched: `src/components/WhoRunsTheDesk.tsx`, `scripts/prerender.mjs`, `scripts/public-nammco.mjs`, `scripts/check-pages-artifact.mjs`, `.github/workflows/pages.yml`, `src/content/legal/*`, `aiReportOperator.ts`, the `/apply` route, migrations, Edge functions, mail.

No prices. No banned partner word in new user copy. nammco was not added. Fixtures use example.com and Example Member only.

## Secrets

VERIFIED. The diff adds no mailbox, API key, token, password, service role, SMTP secret, staff allowlist, or private booking link. The smoke fixture uses `https://example.supabase.co` and `example-anon-key`.

## Test

`scripts/ux-p1-3.test.ts` measures computed style at 390, 768, and 1440 for Directory, Deal rooms, and Post a seat, including the open filter sheet, the introduction form, empty, error, and loading. It requires text at least 15px (13px on status chips), tap targets at least 44px, buttons at 17px sentence case, no sideways overflow, and 29 seat checkboxes.

VERIFIED locally: `node --experimental-strip-types --test scripts/ux-p1-3.test.ts` passed. The browser half skips when Chrome is missing, so CI may only run the source guard. That skip is INFERRED until the PR check log is read.
