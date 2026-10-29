# VT-1 vetting claims

PR: https://github.com/Mmm-2023/board-arabia/pull/212
Branch: `cursor/vt-1-vetting-claims-ee56`
Base: `main` `b506d11725f1474a1695f4903b3cffc667fb59fd`
Date: 29 Oct 2026

Public copy no longer says Board Arabia vets, reviews, or vouches for a member, firm, or deal. Pre-vet still means a person is real, a good fit, and a decision maker. Nothing in this change says Board Arabia endorses a member or a deal.

## Skills

Board Arabia UX/UI. Surface: marketing home and `/apply`. Job: say who membership is for, and what the pre-vet checks, before the form asks for personal details. The scope line sits under the Pre-vet label and above the fields. The hero no longer calls membership reviewed. The apply path is still `/apply`. English only. No em dashes. Brand chrome was not restyled.

Dashboard UX desktop and mobile. Member empty states for mandates and real estate partners still say why the list is empty and what happens next. Destinations, sidebar, and tabs were not changed. The staff availability label Selective, and the admin firm lines that still say vetted, were left because they are not the public claims in this wave. A signed-in 390px pass of those empty states was not opened.

## Before and after

| Row | Where | Before | After | Claim |
| --- | --- | --- | --- | --- |
| 1 HIGH | `src/content/landingFeatures.ts:54` | Opportunities, board roles and vetted partner firms. | Opportunities, board roles and partner firms. | VERIFIED. Read in source and in the rendered home HTML. |
| 2 HIGH | `src/content/landingFeatures.ts:158` | Request an intro to a vetted real estate partner firm. Admin reviews it before any outreach. | Request an intro to a real estate partner firm. Admin handles the intro before any outreach. | VERIFIED. Source and `scripts/landing-features.test.ts`. |
| 3 HIGH | `src/pages/LandingPage.tsx:29` | Admin-reviewed capital briefs. No cold outreach. | Capital briefs shared through admin. No cold outreach. | VERIFIED. Rendered `/` in `scripts/vetting-claims.test.ts`. |
| 4 HIGH | `src/pages/LandingPage.tsx:299` | Every application, mandate intro and real estate intro passes admin review. | Admin reads every application and handles every mandate intro and real estate intro. | VERIFIED. Rendered `/`. |
| 5 HIGH | `src/pages/ForCapitalPage.tsx:128` | A deal room holds one mandate that has already passed our admin team: | A deal room holds one mandate that admin has released to it: | VERIFIED. Source. INFERRED on a live browser: the route test renders `/` and `/apply`, not `/for-capital`. The prerendered `dist/for-capital/index.html` has no banned words. |
| 6 HIGH | `src/pages/ForCapitalPage.tsx:63` | via structured mandates our admin team reviews, so outreach stays credentialled and discreet. | via structured mandates that go through our admin team, so outreach stays discreet. | VERIFIED. Source. Same INFERRED note as row 5 for a browser. |
| 7 HIGH | `src/content/seo.ts:61` | a private directory, reviewed intros and mandates | a private directory, intros and mandates | VERIFIED. Source, and the WebPage description is this string. |
| 8 HIGH | `src/content/seo.ts:68`, `:178`, `:234` | mandates our admin team reviews | mandates that go through our admin team | VERIFIED. The surrounding sentence on each line was kept. FAQ answers are the FAQPage JSON-LD (`scripts/landing-polish.test.ts`). |
| 9 HIGH | `src/content/seo.ts:166` | happen in reviewed rooms | happen in private rooms | VERIFIED. Same FAQ and JSON-LD path. The selective clause on this line is row 13. |
| 10 HIGH | `src/content/seo.ts:190` | Mandates admin reviews, | Mandates that go through admin, | VERIFIED. Source and FAQ JSON-LD. AI Due Diligence stays in this sentence. |
| 11 HIGH | `public/llms.txt:7` | introductions and mandates reviewed by the admin team ... only through reviewed mandates | introductions and mandates that go through the admin team ... only through mandates | VERIFIED. Read `public/llms.txt`. |
| 12 hero | `src/pages/LandingPage.tsx:123` and `:147` | Reviewed membership for Chairperson... / A reviewed membership linking... | Membership for Chairperson... / A membership linking... | VERIFIED. 390px shot `home-hero-390.png` shows the hero line. The audit draft said "Membership by application". This wave uses the approved shorter line. |
| 13 selective | Footer, `index.html`, `src/content/seo.ts`, JSON-LD, `public/llms.txt:3` | selective founding membership | founding membership by application | VERIFIED. `index.html:27`, `:31`, `:39`. `src/components/Footer.tsx:34`. `src/content/seo.ts:12`, `:166`, `:219`, `:321`. Organization JSON-LD in `dist/index.html` uses the new description. `public/llms.txt:3`. |
| 14 MED | `src/pages/LandingPage.tsx:34` | Peers admitted on one standard: credentials first. | Peers admitted by application and personal review. | VERIFIED. Rendered `/`. |
| 15 MED | `src/content/landingFeatures.ts:48` | Mandates and deal rooms, opened after admin review. | Mandates and deal rooms, opened through admin. | VERIFIED. Rendered home tiles. |
| 24 MED | `src/shell/viewCopy.ts:42` | When capital briefs are approved, they land here. | When admin publishes a capital brief, it lands here. | VERIFIED. Source. UNKNOWN on a signed-in screen. |
| 25 MED | `src/shell/viewCopy.ts:63` | until vetted firms can take their place. | until partner firms are added. | VERIFIED. Source. UNKNOWN on a signed-in screen. |
| 26 MED | `supabase/functions/_shared/membership_steps.ts:64` | Our admin team checks your board and executive record here. | Our admin team reads your board and executive record here. | VERIFIED. Source. The checklist imports this module. UNKNOWN until the next Edge deploy for any mail that quotes it. |
| 27 MED | `supabase/functions/_shared/peer_invite.ts:62`, `:95`, `:100`, `:119`, `:144`, `:157` and `src/lib/inviteLink.ts:19` | vouched for you / You were vouched for by | invited you to apply to Board Arabia / You were invited by | VERIFIED. `scripts/peer-invite.test.ts` and `scripts/invite-sequence.test.ts`. The client WhatsApp line matches the shared module. Not sent. |
| Apply scope | `src/pages/ApplyPage.tsx:230` | (no scope line) | It checks you are real, a good fit and a decision maker. Nothing about any business or deal. | VERIFIED. Rendered `/apply` and `apply-390.png`. |
| Capacity | `src/pages/ApplyPage.tsx:343` and `membership_steps.ts:94` | only after our admin team verifies it | only after our admin team checks it looks right for a decision maker | VERIFIED. Rendered `/apply` includes the hint. |
| LEGAL CHANGE | `src/content/legal/privacy.en.ts:139` | a verified capacity figure can be added into a platform total | a capacity figure can be added into a platform total after you are admitted. Our admin team checks it looks right for a decision maker. | VERIFIED. Source. Legal Counsel owns the notice. |
| LEGAL CHANGE | `src/content/legal/privacy.en.ts:220` | Verified capacity figure, as a sum only | Capacity figure, as a sum only | VERIFIED. Source. |
| LEGAL CHANGE | `src/content/privacyNotice.ts:51` | a verified capacity figure can be added into a platform sum | a capacity figure can be added into a platform sum after you are admitted. Our admin team checks it looks right for a decision maker. | VERIFIED. Source. |

## LEGAL CHANGE

Privacy 3.12 and the public-totals row no longer call the figure verified. They say a capacity figure, and that admin checks it looks right for a decision maker. The public site still shows the total or the sum only, not a name, company, or amount. Terms were not edited.

## Left unchanged

- AI Due Diligence name, score, and verdict.
- Trusted partners and Trusted advisers labels.
- The word Pre-vet.
- Terms (`src/content/legal/terms.en.ts`).
- How it works still says credentials-first. That line is the audit keep, not the landing sentence that was changed.
- Admin real estate copy still says vetted firms (`src/lib/rePartnerView.ts:18` and `:22`). Audit low. Not public.
- Admin filter "Vouched only" and the staff alert line `Vouched:` in `supabase/functions/_shared/membership_copy.ts:79`. Not the invite subject.
- Availability value `selective` and the member label Selective. That is how open a member is to an intro, not a claim that Board Arabia vetted them. `src/pages/dashboard/ProfileTagFields.tsx:28`, `src/lib/profileTags.ts:9`, `src/shell/viewCopy.ts:235`.
- Profile "Verified" on a member capacity line. Audit low. Not this wave.
- `scripts/shell-og.test.ts` still has a fixture description with the word selective. It is sample shell HTML, not a shipped page.

## Locked files, not edited

- `src/pages/apply/RegisterScreen.tsx`
- `src/pages/apply/VerifyScreen.tsx`
- `src/App.tsx` `/apply` route
- `scripts/apply-route.test.ts`
- `src/content/legal/terms.en.ts`
- `src/components/WhoRunsTheDesk.tsx`
- `scripts/public-nammco.mjs`
- `scripts/prerender.mjs`
- `scripts/check-pages-artifact.mjs`
- `.github/workflows/pages.yml`

## Edge and database

No migration. No `config.toml` change. No function handler edited. No deploy. The only files under `supabase/functions` are copy strings in `_shared/membership_steps.ts` and `_shared/peer_invite.ts`. The member checklist already imports the first. The invite tests import the second.

## Acceptance scan

`rg -i 'vetted|selective|admin-reviewed|reviewed (intros|mandates|rooms)|vouched'` over `index.html`, `public/llms.txt`, `src/content`, `src/components`, top-level `src/pages/*.tsx`, `src/lib/inviteLink.ts`, `peer_invite.ts`, and `membership_steps.ts` returns nothing. Guard: `scripts/vetting-claims.test.ts`. The same test renders `/` and `/apply`.

Prerendered `dist/index.html`, `dist/apply/index.html`, `dist/for-members/index.html`, `dist/for-capital/index.html`, and `dist/privacy/index.html` also have no hits. Dist is not committed.

Remaining hits outside that scan are listed under Left unchanged. None of them are Terms text.

## Shots

- `handoff/ba-vt-1-vetting-claims/home-hero-390.png`
- `handoff/ba-vt-1-vetting-claims/apply-390.png`

Both are 390 by 844. Chrome opened the Vite app. The hero text and the pre-vet scope line were checked before the files were saved.

## Tests

`node scripts/build-for-csp-crawl.mjs` exited 0. `bash scripts/pages-artifact-gate.sh` exited 0.

`node --experimental-strip-types --test` on the vetting, landing, invite, apply route, legal, partner wording, nammco, and two-tier files: pass. The route test covers `/` and `/apply`.

## Secrets grade

VERIFIED. The diff adds no mailbox, key, token, or staff allowlist. example.com stays in the existing invite tests. No prices. No new nammco line. The footer credit is still the only public nammco phrase. No em dash or en dash in the new copy.
