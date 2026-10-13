# A2 + A7 + A11 Home reorder

Home is one short decision column. Needs you, This week, one next action, and Activity stay open. Pulse, platform snapshot, From the room, the partner gallery, and the daily market brief sit behind See more.

Base is main `bdb2a45` (includes #159 and #164). No migration. No Edge. DigestPage and the admin digest editor are unchanged.

## Secrets grade

VERIFIED. This diff adds no mailbox, API key, token, password, service-role key, project ref, or staff name. The fixture smoke uses `member@example.com` only. `.env` is not in the commit.

## What changed

| Claim | Where | Grade |
| --- | --- | --- |
| Needs you is one card. It hides when nothing is waiting. Copy is the Marketing Engineer text. | `src/lib/homeNeeds.ts:3-5`, `src/pages/dashboard/HomeSnapshotView.tsx:107-130` | VERIFIED |
| Two-step, profile gaps, one or many room invites, and real suggested introductions are rows in that card. | `src/lib/homeNeeds.ts:15`, `:46-60`, `:63` | VERIFIED |
| The separate home two-step banner is no longer mounted above the page. The row uses the same Turn on path. | `src/pages/dashboard/DashboardLayout.tsx:443`, `src/lib/homeNeeds.ts:15-17` | VERIFIED |
| This week shows up to three lines and See all goes to `/dashboard/digest`. The weekly notice still links there. | `src/lib/homeNeeds.ts:140`, `src/pages/dashboard/HomeSnapshotView.tsx:133-167`, `src/pages/dashboard/DashboardHome.tsx:202-207` | VERIFIED |
| One primary button. Fallback label is Explore deals and the path is `/dashboard/deals`. The profile nudge button is gone. | `src/lib/homeNeeds.ts:12-13`, `:128`, `src/pages/dashboard/HomeSnapshotView.tsx:207-216` | VERIFIED |
| IntroSuggestions is not rendered on Home. The count fetch remains so the row appears only when real suggestions exist. Intros still renders the block. | `src/pages/dashboard/DashboardHome.tsx:183-186`, `src/pages/dashboard/IntrosPage.tsx` | VERIFIED |
| Partner gallery heading is Partners. Sample rows do not render. Live partner rows use the same partner flag as the rest of the gallery. Trusted advisers stay separate. | `src/lib/homeNeeds.ts:154-156`, `src/pages/dashboard/HomeSnapshotView.tsx:61-62`, `:385` | VERIFIED |
| Daily market brief card is unchanged and renders inside See more. FW6 did not require it above the fold. | `src/pages/dashboard/DashboardHome.tsx:356`, `src/pages/dashboard/HomeSnapshotView.tsx:514` | VERIFIED |
| Empty Needs you line is in source and is not shown. The card is omitted when the list is empty. | `src/lib/homeNeeds.ts:5` | VERIFIED |

## Height

Same fixture: `scripts/smoke/home.html?state=populated`. Scroll height of the document.

| Width | Before | After | Drop |
| --- | --- | --- | --- |
| 1280 | 3393 | 947 | 72% |
| 1440 | 3393 | 947 | 72% |
| 390 | 4079 | 1050 | 74% |

First viewport, no scroll, Needs you and Next action both on screen: 1440 bottom of Next action 751 in a 900 viewport, 1280 bottom 751 in an 800 viewport, 390 bottom 786 in an 844 viewport.

## Routes

| Link | Path |
| --- | --- |
| See all | `/dashboard/digest` |
| Explore deals | `/dashboard/deals` |
| Suggested introductions | `/dashboard/people/intros` |
| Turn on | `/dashboard/two-step` |
| Finish profile | `/dashboard/profile#profile-tags` |
| View invite | `/dashboard/deals/rooms/{id}` |
| View invites | `/dashboard/deals/rooms` |

## Shots

`/opt/cursor/artifacts/home-reorder/`. Before and after at 1440, 1280, and 390. Destination shots for digest, deals, intros, rooms, one room, profile, and two-step at 1440 and 390.

## Apply

None. No migration, no Edge, no settings. Pages deploys on merge.
