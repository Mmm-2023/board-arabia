# UP-3 Keyboard and screen reader basics (P2-8)

Date: 30 Oct 2026
Base: `main` at `c019412` (Shorten Deals tabs and drop extra navigation rows)
Branch: `cursor/keyboard-screen-reader-b9c7`

Screens: every page gets a skip link. Named controls were measured on the landing page and How it works. Headings changed on Majlis, AI tools, and Help. Routes and `src/shell/destinations.ts` stay as they are.

No migration. No Edge deploy. No email. No force push. Not merged.

Cited skills: `board-arabia-ux-ui` and `dashboard-ux-desktop-and-mobile`.

Shots are phone first at 390 and desktop at 1440. Phone uses the bottom tabs. Desktop uses the sidebar. Body copy that this change adds is 16px or larger. The skip link and the menu button stay at least 44px. New headings are sentence case. The fixture is Example Member and member@example.com. The existing 2px focus ring is unchanged.

## What changed

A "Skip to content" link is the first control in the app. It is off screen until it is focused, then it sits at the top left. Activating it moves focus to the main landmark (`id="main"`, `tabIndex={-1}`).

The three landing marks that had no accessible name are the why card icons. They are now images named Access to capital, Business relationships, and Opening doors. The menu button on the landing page and on How it works has an explicit name, Open menu or Close menu.

Where the top bar already shows the section, the page heading is a short line of use. Majlis is "Your majlis". AI tools is "Checks you can run". Help drops the repeated eyebrow and the repeated heading. The page heading is "Short answers". Each of those pages keeps one h1.

## The three controls

Measured with axe-core 4.10.3 and the Chrome accessibility tree, at 390, before this change, on the live site.

The tree had no button, link, or image with an empty name on the landing page or on How it works. axe did not report `button-name`, `link-name`, or `image-alt`.

The three visible 44px marks with no accessible name were the why card icons on the landing page. They were `aria-hidden`, so a screen reader skipped them, and they had no label of their own. How it works does not render those icons. The same header menu is on both pages. Its name was already the visually hidden text "Open menu". It now also has `aria-label`.

| Control | Name now | Where |
| --- | --- | --- |
| Why icon, capital | Access to capital | `src/components/landing/graphics.tsx:49` |
| Why icon, relationships | Business relationships | `src/components/landing/graphics.tsx:59` |
| Why icon, doors | Opening doors | `src/components/landing/graphics.tsx:70` |
| Menu button | Open menu, or Close menu | `src/components/Nav.tsx:97` |

## Where

| Piece | Where |
| --- | --- |
| Skip link | `src/components/SkipLink.tsx:24` `SkipLink` |
| First in the app | `src/App.tsx:141` |
| Main landmark props | `src/components/SkipLink.tsx:6` |
| Public marketing main | `src/components/MarketingLayout.tsx:19` |
| Landing main | `src/pages/LandingPage.tsx:51` |
| Member and staff main | `src/shell/AppShell.tsx:397` |
| Skip link position | `src/index.css:118` `.ba-skip` |
| Focus ring, still 2px | `src/index.css:113` |
| Majlis heading | `src/pages/dashboard/MajlisPage.tsx:208` |
| AI tools heading | `src/pages/dashboard/AiToolsHome.tsx:127` |
| Help heading | `src/pages/dashboard/HelpPage.tsx:80` |

Locked register and verify screens still own their `<main>`. The skip link stamps `id="main"` and `tabindex="-1"` on the first main after paint, so those files stay untouched. Checked on `/register/verify`: the first tab is the skip link, and the main is `data-screen="verify"` with `id="main"`.

## axe counts

axe-core 4.10.3. Viewport 390. Full rule set.

| Page | Before (live) | After (this branch, local) |
| --- | --- | --- |
| Landing violations | `link-in-text-block` 2 nodes. `button-name` 0. `link-name` 0. `image-alt` 0. | `link-in-text-block` 1 node. `button-name` 0. `link-name` 0. `image-alt` 0. |
| How it works violations | 0 | 0 |
| Unnamed button, link, or image in the accessibility tree | 0 and 0 | 0 and 0 |

The remaining landing node is the existing "How we protect your data" link. axe reports contrast 1.06:1 against the sentence around it. That link was not edited. Live also flagged "Log in" in the closing line. The local page did not. Those two links were not part of this change.

After the change the accessibility tree names the skip link, the menu button, and the three why icons.

## Shots

Headless Chrome. Not a physical phone. 390x844 and 1440x900.

| File | What |
| --- | --- |
| `skip-390.png`, `skip-1440.png` | Landing, skip link focused |
| `landing-390.png`, `landing-1440.png` | Landing |
| `how-390.png`, `how-1440.png` | How it works |
| `majlis-390.png`, `majlis-1440.png` | Majlis, empty list, heading "Your majlis" |
| `ai-390.png`, `ai-1440.png` | AI tools, heading "Checks you can run" |
| `help-390.png`, `help-1440.png` | Help, heading "Short answers" |

Measured on the skip link at both widths: text "Skip to content", at least 44 by 44, 16px, outline width 2px, and it sits inside the viewport when focused. Enter moves focus to `main#main`.

Majlis, AI tools, and Help each have one h1. The h1 text is not the top bar title. On a phone, the Help page body does not contain the word Help. The top bar does.

## Sizes

The skip link is 16px and at least 44px tall. The menu button was already 48px and stays that way. The new headings measured above 15px. The 2px focus outline rule was not replaced.

## Migration

None. Latest migration on main at the branch point is `supabase/migrations/20270113120000_seat_matching.sql`. No new file.

## Locks

Not touched: `scripts/public-nammco.mjs`, `scripts/prerender.mjs`, `scripts/check-pages-artifact.mjs`, `.github/workflows/pages.yml`, `src/content/legal/*`, `src/pages/apply/*`, `src/components/WhoRunsTheDesk.tsx`, `src/shell/destinations.ts`, routes in `src/App.tsx`, `vercel.json`.

No prices. No new user copy uses the banned partner word. The footer credit was not added.

## Secrets

VERIFIED.

The diff adds no mailbox, API key, token, password, service role key, project ref, or staff allowlist. Tests and the smoke fixture use `https://example.supabase.co`, `example-anon-key`, and `member@example.com`. `.env` was not committed. A scan of the diff for key material matched only the existing import name `clearPasswordFlag`.

## Claims

- VERIFIED. The skip link is the first control on `/`, `/how-it-works`, `/about`, `/apply`, and `/login` in server markup. `scripts/up-3-a11y.test.ts`.
- VERIFIED. Tab then Enter on the landing page focuses `main#main` at 390 and 1440. The skip link is at least 44px, 16px, and its outline is 2px. `scripts/up-3-a11y.test.ts` Chrome pass.
- VERIFIED. `/register/verify` keeps the locked screen. After paint the first tab is the skip link and the main has `id="main"` and `tabindex="-1"`. Local Chrome check.
- VERIFIED. The three why icons expose the names Access to capital, Business relationships, and Opening doors. The menu button exposes Open menu. Chrome accessibility tree after the change.
- VERIFIED. How it works has no visible control with an empty accessible name at 390 or 1440. `scripts/up-3-a11y.test.ts` Chrome pass.
- VERIFIED. Majlis, AI tools, and Help each render one h1, and that h1 is not the top bar title. Help's main text does not contain Help. `scripts/up-3-a11y.test.ts`.
- VERIFIED. axe-core 4.10.3 counts in the table above. Before was the live site. After was this branch on a local server.
- VERIFIED. `npx tsc -b` passed. The hero CTA test in `scripts/landing-polish.test.ts` passed, including the updated icon name check.
- VERIFIED. On a wide Help screen the sidebar still has a Help link, and the top bar still says Help. `help-1440.png`. The page heading does not.
- INFERRED. On a phone the word Help is read once, from the top bar, because the sidebar is not shown and the page body does not say Help. The phone shot shows that. A screen reader pass on a physical phone was not run.
- INFERRED. Safe area padding on the shell is unchanged. The skip link uses `env(safe-area-inset-top)` and `env(safe-area-inset-left)`. Headless Chrome reports a zero inset.
- INFERRED. The focus ring on controls other than the skip link stays 2px. The `:focus-visible` rule was not edited. Only the skip link's own outline was measured.
- UNKNOWN. A physical phone. Shots and the Chrome pass use headless Chrome.
- UNKNOWN. Live production until this merges and Pages deploys. No Edge deploy is required.
