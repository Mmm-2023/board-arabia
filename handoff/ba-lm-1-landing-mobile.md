# LM-1 landing mobile copy

Home stays in the 30 Sep order. The cut is copy, type, and padding. Founding 100 stays its own section.

Base is main. No migration. No Edge function. Locked files were not edited: `scripts/prerender.mjs`, `scripts/check-pages-artifact.mjs`, `.github/workflows/pages.yml`, `scripts/public-nammco.mjs`, `src/content/legal/*`, the `/apply` route, `src/shell/destinations.ts`.

## Secrets grade

VERIFIED. The diff has no mailbox, API key, token, password, service-role key, or project ref. Contact copy still goes through `legalField('contactEmail')`. `.env` is not in the commit.

## Checklist

| Item | Status | Where |
| --- | --- | --- |
| P1-1 Five membership tiles, Example deals preview, See all member tools | Done | `src/content/landingFeatures.ts:33-69`, `src/pages/LandingPage.tsx:237-268` |
| P1-2 Remove "All your data is secure and fully encrypted". Keep the hosting line on the trust page | Done | `src/content/trust.ts:24-30`, `:66`, `:69-71`, `:87-88`. Trust page renders `WHERE_DATA_LIVES` from `src/pages/SecurityPage.tsx`. Catalog card `encrypted` uses the hosting line at `src/content/landingFeatures.ts:227-233` and is not rendered on the home |
| P1-3 Hero opens with who it is for. Held for line removed | Done | `src/pages/LandingPage.tsx:115-127` |
| P1-4 Why intro and cards are one-liners. H2 unchanged | Done | `src/pages/LandingPage.tsx:27-39`, `:147` |
| P1-5 Card and preview body at 15px, line height 1.45 | Done | `src/pages/LandingPage.tsx:165`, `:257`. Preview body `src/index.css:755-759`. Preview labels and Example chip at 14px: `src/index.css:710-740`, `src/components/ExampleMark.tsx:5`, `src/components/landing/ProductFrame.tsx:33` |
| P2-1 How it works is titles only, plus one review line | Done | `src/components/landing/StepDiagram.tsx:14`, `src/pages/LandingPage.tsx:298-307` |
| P2-2 Founding 100 is one line. "not priced" sentence removed | Done | `src/pages/LandingPage.tsx:184-188` |
| P2-3 Closing Log in tap area at least 44x44 | Done | `src/components/CtaBand.tsx:59`. Measured 49x44 at 390 |
| P2-4 Section padding 32px | Done | Why and membership `py-8`: `src/pages/LandingPage.tsx:139`, `:237`. Measured 32px top and bottom on Why, Founding, membership, process, FAQ, and closing |
| P2-5 G1 labels raised | Done | `src/components/landing/graphics.tsx:39-42` font size 20 user units, and `src/index.css:615-619` so the graphic keeps its aspect ratio. At 390 the label box is 350px wide and the scaled size is 15.91px (glyph height 17px) |
| P2-6 Sticky bar overlap | Done as a viewport check | `src/components/landing/StickyApply.tsx` unchanged. At 390x844 with an iPhone user agent, the Why heading box (top 0, bottom 85) does not meet the bar (top 779, bottom 844). A stitched full-section screenshot still paints the fixed bar into the middle of the image. A physical iPhone was not available in this environment |
| P2-7 Fold Founding 100 into Why | Not done | Out of scope. Order in `src/pages/LandingPage.tsx:52-74` is Hero, Why, Founding, membership, process, FAQ, closing, footer |

## Acceptance at 390

| Check | Result | Grade |
| --- | --- | --- |
| Page height at or under 5,600px | 4,864px | VERIFIED |
| Visible words at or under 400 | 369 (`innerText`) | VERIFIED |
| Body text under 14px | None, except the locked footer line "powered by nammco" at 12px | VERIFIED |
| Tap targets at least 44x44 | No link or button under 44px in either axis. Closing Log in is 49x44 | VERIFIED |
| Locks | No em dash or en dash in the diff. No "sponsor" in the rendered home. "nammco" appears once, as "powered by nammco". No prices. H1 unchanged | VERIFIED |
| Hero eyebrow | 16.8px. `#E8E4F7` on `#1C1343` is 13.79:1 and on the lighter hero stop `#2a2158` is 11.58:1 | VERIFIED by calculation |

Section order measured on the page: top, why, founding, membership, process, faq, closing, footer.

## Public CTAs

Route test: `scripts/landing-mobile-copy.test.ts`.

Clicked from the home page at 390. Each one landed on the path below. Screenshots are in `handoff/ba-lm-1-landing-mobile/cta/`.

| CTA | Destination |
| --- | --- |
| Apply for consideration (hero, closing, header, footer) | `/apply` |
| How it works (hero) | `#process` |
| See all member tools | `/for-members` |
| Full sequence | `/how-it-works` |
| How we protect your data (How it works line, and the strip before closing) | `/security` |
| Log in (header, closing, footer) | `/login` |
| For capital (footer and FAQ) | `/for-capital` |
| About, Partners, Privacy, Terms | `/about`, `/partners`, `/privacy`, `/terms` |

`/security` shows "Data is encrypted in transit and at rest by our hosting provider." The overclaim sentence is absent there, on the home page, on the apply strip, and on the upload handling line.

## Shots

Before and after, 390 and 1440, for hero, Why, Founding, membership, How it works, and closing:

`handoff/ba-lm-1-landing-mobile/before/` and `handoff/ba-lm-1-landing-mobile/after/`.

Sticky viewport: `handoff/ba-lm-1-landing-mobile/sticky/why-viewport-390.png`.

Numbers: `handoff/ba-lm-1-landing-mobile/measure.json`.

## Tests

`scripts/landing-mobile-copy.test.ts` plus the updated landing, trust, and copy tests passed locally. The full `scripts/*.test.ts` run still has the usual failures that need Postgres or a built `dist/`. Those are the CI jobs, not this copy change.
