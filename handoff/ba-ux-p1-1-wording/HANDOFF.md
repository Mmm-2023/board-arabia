# UX-P1-1 public wording

Copy only. Base `27d132b6aa6325adc5bf47c681e39435ccf7f429` (main). No migration. No Edge change. No force push.

## Locked file stop

`src/components/WhoRunsTheDesk.tsx` was not edited.

About (`src/pages/AboutPage.tsx` line 49) and Apply (`src/pages/ApplyPage.tsx` line 251) both render `<WhoRunsTheDesk />`. The only public heading that says "the desk" on those pages is the hardcoded `h2` in `src/components/WhoRunsTheDesk.tsx` line 13: "Who runs the desk". The review heading "Who reads your application" would replace that string. The file is locked, so the heading, the named person line, and "A named person reads applications." are unchanged. `scripts/prerender.mjs` does not hardcode this heading or the step name, so it was not edited.

Shots of About and Apply still show "Who runs the desk". That claim is VERIFIED from the after shots and from `git diff` (the component is absent).

## What changed

Step name "Pre-vet" is now "Check" wherever that step shows with the register flag off (the live default):

- Landing step 01, closing line, and the "How do I apply?" answer. `src/content/marketing.ts` line 93, `src/content/twoTierCopy.ts` lines 22 and 25, `src/content/seo.ts` line 137.
- How it works lead, step 01, and the close heading. `src/pages/HowItWorksPage.tsx` lines 47 and 107.
- Apply eyebrow, lead, and the received line. `src/pages/ApplyPage.tsx` lines 200, 227, and 236.

Register footnote sentence is now "Accounts you do not confirm are deleted after 7 days." `src/pages/apply/RegisterScreen.tsx` line 186. The rest of that notice is unchanged. `src/content/legal/*` is unchanged. The same old sentence on the public majlis page was left alone.

Guards that pinned "Pre-vet" now pin "Check": `scripts/vetting-claims.test.ts`, `scripts/two-tier-public.test.ts`, `scripts/landing-declutter.test.ts`.

## Locked files touched

Copy only:

- `src/pages/ApplyPage.tsx`
- `src/pages/apply/RegisterScreen.tsx`

Not touched: `src/components/WhoRunsTheDesk.tsx`, `scripts/prerender.mjs`, `src/content/legal/*`.

## Left in place

`supabase/functions/_shared/transactional_copy.ts` still says "pre-vet details" in the application acknowledgement. That file is Edge mail copy. This wave does not change Edge.

`README.md` still describes the old step name. It is not a public page.

## Shots

`handoff/ba-ux-p1-1-wording/before-*.png` and `after-*.png` at 390 and 1440 for About, Apply, Register, Home, and How it works. Full page, reduced motion, and the "How do I apply?" answer opened where that question exists. Chrome via Playwright against the Vite app with the two-tier register flag off.

## Claims

- Step title on Home, How it works, and Apply is "Check", and the old step name is gone from those renders. VERIFIED. After shots plus `scripts/two-tier-public.test.ts` and `scripts/vetting-claims.test.ts`.
- Register footnote uses the approved sentence. VERIFIED. `after-register-390.png` and `after-register-1440.png`.
- About and Apply still show "Who runs the desk" because that component is locked. VERIFIED. After shots and the unchanged file.
- Terms and Privacy sources were not edited. VERIFIED. `git diff` does not include `src/content/legal`.
- No em dash, no "sponsor", no price, and nammco only in the footer credit. VERIFIED for the diff. Footer credit still one "powered by nammco" via `scripts/public-nammco.test.ts`.
- No migration and no Edge deploy. VERIFIED. No files under `supabase/migrations` or `supabase/functions`.
- Secrets. VERIFIED. The diff has no email address, key, token, password, or staff allowlist. Shots are public marketing pages. `.env` is gitignored and not committed.

## CI

Recorded after the checks finish. Head SHA is the commit on `cursor/ux-p1-1-wording-e8b1`.
