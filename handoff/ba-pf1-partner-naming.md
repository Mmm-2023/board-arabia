# PF-1 partner naming sweep

Base: `9470ccb3b350b8fc65621662139e41aa1fc5cfc6` (Keep application answers at admission, #150). No migration. Email sending stays parked.

## Review item to change to test

| Item | What changed | Test | Grade |
| --- | --- | --- | --- |
| SPONSOR_LABEL and badge | `src/lib/sponsorLabel.ts` is `Partner`. `src/components/SponsorBadge.tsx` renders that constant. Seat value `sponsor` is unchanged. | `sign-in steps are plain and the public name is Partner` | VERIFIED |
| Member route | Nav and title are Partnership. Path is `/dashboard/partnership`. `/dashboard/sponsorship` stays in `src/shell/redirects.ts` and keeps search and hash. Both paths are in `scripts/shell-manifest.mjs`. | `sponsorship redirects to partnership and both shells stay prerendered` | VERIFIED |
| Home card | `Your partnership` / `Open partnership` in `src/pages/dashboard/DashboardHome.tsx`. | `sponsors never see placeholder package names or prices` | VERIFIED |
| Privacy | Show my card to partners, on and off lines, and the off explanation in `src/components/privacy/PrivacyPanelView.tsx`. Opt-in default is still off. | `the sponsor card toggle is off unless the member turns it on` | VERIFIED |
| Member Majlis | `Regional activity for partners...` in `src/pages/dashboard/MajlisPage.tsx`. RSVP error in `supabase/functions/majlis-rsvp/index.ts`. Presented by is unchanged. | `client majlis surfaces avoid secrets, em dashes, and sponsor deny` | VERIFIED |
| Deal rooms | `Active members and approved partners only.` in `src/lib/dealRoomView.ts`. | `user-facing copy says partner, and legal files stay out of this gate` | VERIFIED |
| Real estate labels | Tab `Real estate firms` in `src/pages/dashboard/RealEstateBoard.tsx`. Intro type `Real estate firm` in `src/lib/memberIntros.ts`. Admin title `Real estate firms` in `src/lib/rePartnerView.ts` and `src/pages/admin/RePartnersEditor.tsx`. Enum and `re_partners` data are unchanged. | copy gate; `member partner markup has no contacts, and a tied firm shows the sponsor mark` | VERIFIED |
| Partner showcase | Already at `/dashboard/people/partners` on this base. No old `/dashboard/sponsors` path, so no new redirect. Copy check found no leftover sponsor strings on that page. | `sponsorship redirects to partnership and both shells stay prerendered` asserts the old sponsor path does not redirect | VERIFIED |
| Public /partners rule 04 | Exact sentence in `src/pages/PartnersPage.tsx`. Founding Ecosystem Partner wording on that page is gone. | `public /partners and /for-capital send Apply to /apply and Log in to /login` | VERIFIED |
| /for-capital | Private equity body in `src/pages/ForCapitalPage.tsx` replaces Sponsors and keeps the rest of the sentence. | same public route test | VERIFIED |
| Category gloss | `src/data/partnerCategories.ts` still says `Firms acquiring or governing companies.` The same sentence is in migration `20261208120000_trusted_partners_gallery.sql`. This PR adds no migration, so the stored gloss is unchanged. It does not say sponsor. `src/content/marketing.ts` re-exports the category list and no longer holds the old Sponsors sentence. | copy gate asserts the stored gloss has no sponsor word | VERIFIED |
| Admin labels | People panel, Add partner, empty and suspended lines, Partner packages, tier label Partner, tier rule sentences, Majlis filters, No partner seat, seat counters, Admin Home Partners tile. | `sponsor cap state disables Add Sponsor at 3 invited or active seats`; `staff home counts sponsor seats instead of a fixed zero`; `people card shows tiers, a save control, and mapped errors clear of the right edge` | VERIFIED |
| Emails and share text | Invite subject and body, admin notify fallback and kind label, LinkedIn line `Proud to support Board Arabia as a Partner.` | `sponsor invite mail is a set-password letter without a booking link`; `admit share letter prefills LinkedIn and does not post`; `alert letter names the requester, the request, the item, the time, and the admin page` | VERIFIED |
| Copy gate | `scripts/partner-wording.test.ts` scans user-facing strings in `src` and `supabase/functions`. It skips comments, imports, legal files, test files, the seat value `sponsor`, the route id `sponsorship`, and `invite-sponsor`. | `user-facing copy says partner, and legal files stay out of this gate` | VERIFIED |
| Built assets | `vite.config.ts` places `terms.en.ts` and `privacy.en.ts` on the existing `legal-pages` chunk. The build check allows seat values, route ids, file names, and API field `sponsors` outside that chunk. Display wording `sponsor` outside it fails. | `built assets keep sponsor wording inside the legal-pages chunk` | VERIFIED |
| Admin logo preview | `withLogoVersion` in `src/lib/partnerLogo.ts`. `TrustedPartnersPanel` bumps a local counter after a successful save and passes it only to the admin preview. Public tiles do not pass a version. | `admin preview url changes after a save and public tiles stay unversioned` | VERIFIED |
| Empty storage remove | An empty or null storage remove still calls `setLogo(null)`, because a missing file returns the same empty list as aal1. The two-step message is shown only when that row update is refused (42501, not authorized, insufficient privilege, permission denied, or not_allowed). Any other row failure uses the normal save error. A storage error still stops before the row update. | `an empty storage remove still clears the row when the update is allowed`; `a missing logo file at aal2 clears the row`; `aal1 logo remove shows the two-step message when the row update is refused` | VERIFIED |

## Legal lines for PF-14

`src/content/legal/*` was not edited. On this base the word match is 22 lines (18 in terms, 4 in privacy). The older scan counted 21. The extra line is `terms.en.ts:719`. VERIFIED by grep on this base.

Suggested wording is for legal review. It is not applied here.

| File:line | Current text | Suggested wording |
| --- | --- | --- |
| terms.en.ts:74 | Browsing the public pages does not admit you, reserve a Founding place or reserve a sponsor seat. | Browsing the public pages does not admit you, reserve a Founding place or reserve a partner seat. |
| terms.en.ts:120 | The Platform has three tiers: Founding, Member and Sponsor. The benefits of each tier are those described in your acceptance email, membership offer or sponsorship package. | The Platform has three tiers: Founding, Member and Partner. The benefits of each tier are those described in your acceptance email, membership offer or partnership package. |
| terms.en.ts:161 | Member directory. Signed in members can see member profiles. A sponsor sees a member's card only if that member chooses to show it. Profiles show the details described in the Privacy Notice. Email and phone details are not shown in the directory. | Member directory. Signed in members can see member profiles. A partner sees a member's card only if that member chooses to show it. Profiles show the details described in the Privacy Notice. Email and phone details are not shown in the directory. |
| terms.en.ts:197 | Majlis and events. We may run a majlis with events, which may be hosted or presented by sponsors. See section 12. | Majlis and events. We may run a majlis with events, which may be hosted or presented by partners. See section 12. |
| terms.en.ts:232 | Intro credits give a sponsor the right to request introductions. They do not guarantee that any introduction is accepted. | Intro credits give a partner the right to request introductions. They do not guarantee that any introduction is accepted. |
| terms.en.ts:419 | Fees for the Member and Sponsor tiers, sponsor packages and intro credits are set out in your membership offer, sponsorship package or invoice. No price shown on the public pages is an offer. | Fees for the Member and Partner tiers, partnership packages and intro credits are set out in your membership offer, partnership package or invoice. No price shown on the public pages is an offer. |
| terms.en.ts:437 | Sponsor packages may include intro credits and other allowances, such as majlis slots or room credits, as stated in the package. A credit is used as stated in the package. Credits have no cash value. They cannot be transferred or exchanged. Unused credits expire at the end of the sponsorship term. | Partnership packages may include intro credits and other allowances, such as majlis slots or room credits, as stated in the package. A credit is used as stated in the package. Credits have no cash value. They cannot be transferred or exchanged. Unused credits expire at the end of the partnership term. |
| terms.en.ts:472 | Events may be sponsored, hosted or presented by a sponsor. That does not mean we endorse the sponsor or its products. | Events may be supported, hosted or presented by a partner. That does not mean we endorse the partner or its products. |
| terms.en.ts:495 | 13. Sponsors | 13. Partners |
| terms.en.ts:501 | Sponsors are members who support the Platform under a sponsorship package. | Partners are members who support the Platform under a partnership package. |
| terms.en.ts:507 | Sponsors may be shown to members as sponsors, for example with "Presented by" wording on events. Sponsorship is not an endorsement by us of the sponsor, its products or its advice. | Partners may be shown to members as partners, for example with "Presented by" wording on events. Partnership is not an endorsement by us of the partner, its products or its advice. |
| terms.en.ts:513 | Sponsors must follow these Terms like any member. They must not use intro credits, events or the directory for mass marketing or to solicit the public. | Partners must follow these Terms like any member. They must not use intro credits, events or the directory for mass marketing or to solicit the public. |
| terms.en.ts:519 | Any sponsor-specific terms in the sponsorship package apply in addition to these Terms. If they conflict, the sponsorship package prevails for that point. | Any partner-specific terms in the partnership package apply in addition to these Terms. If they conflict, the partnership package prevails for that point. |
| terms.en.ts:588 | To the extent Saudi law allows, we give no promise that the Platform will be uninterrupted, error free or secure, or that any information on it from members, sponsors, AI tools or public sources is accurate, complete or current. | To the extent Saudi law allows, we give no promise that the Platform will be uninterrupted, error free or secure, or that any information on it from members, partners, AI tools or public sources is accurate, complete or current. |
| terms.en.ts:594 | We do not vet members beyond our admission review. Admission is not an endorsement of any member, sponsor, business or statement. | We do not vet members beyond our admission review. Admission is not an endorsement of any member, partner, business or statement. |
| terms.en.ts:605 | To the extent permitted by Saudi law, we are not liable for any loss arising from: (a) any deal, investment or dealing between members, or with sponsors or third parties; (b) any content supplied by members or sponsors, including mandates and deal room files; (c) use of or reliance on any AI output; or (d) any indirect loss, loss of profit, loss of opportunity or loss of reputation. | To the extent permitted by Saudi law, we are not liable for any loss arising from: (a) any deal, investment or dealing between members, or with partners or third parties; (b) any content supplied by members or partners, including mandates and deal room files; (c) use of or reliance on any AI output; or (d) any indirect loss, loss of profit, loss of opportunity or loss of reputation. |
| terms.en.ts:628 | You agree to compensate us for any loss, claim, penalty or reasonable cost, including reasonable legal fees, that we suffer because: (a) you break these Terms or the law; (b) your content infringes someone's rights or breaks a confidentiality duty; or (c) of any deal or dispute between you and another member, sponsor or third party. | You agree to compensate us for any loss, claim, penalty or reasonable cost, including reasonable legal fees, that we suffer because: (a) you break these Terms or the law; (b) your content infringes someone's rights or breaks a confidentiality duty; or (c) of any deal or dispute between you and another member, partner or third party. |
| terms.en.ts:719 | These Terms, the Privacy Notice, the tool notices and any membership offer or sponsorship package form the whole agreement between you and us about the Platform. | These Terms, the Privacy Notice, the tool notices and any membership offer or partnership package form the whole agreement between you and us about the Platform. |
| privacy.en.ts:127 | Sponsors and payments. Sponsorship package, intro credits and other allowances used, invoices and payment records. We do not take card details on the public pages. | Partners and payments. Partnership package, intro credits and other allowances used, invoices and payment records. We do not take card details on the public pages. |
| privacy.en.ts:209 | Sponsor and payment data | Partner and payment data |
| privacy.en.ts:260 | Other members and sponsors. Signed-in members can see directory profiles. A sponsor sees a member's card only if that member chooses to show it. Contact details are shared only with the two parties, and only after an intro is accepted. Members you add to a deal room can see what is shared there. Members can see mandate details once unlocked. | Other members and partners. Signed-in members can see directory profiles. A partner sees a member's card only if that member chooses to show it. Contact details are shared only with the two parties, and only after an intro is accepted. Members you add to a deal room can see what is shared there. Members can see mandate details once unlocked. |
| privacy.en.ts:266 | Event hosts and attendees. Your name and company may be shared with the event host, which may be a sponsor. They may also be shared with other attendees where the event page says so. | Event hosts and attendees. Your name and company may be shared with the event host, which may be a partner. They may also be shared with other attendees where the event page says so. |

## Why terms and privacy sit on the legal-pages chunk

Terms and Privacy still say sponsor until the legal track ships. The built-asset check looks for sponsor sentences outside that chunk. `vite.config.ts` places `src/content/legal/terms.en.ts` and `src/content/legal/privacy.en.ts` on the existing `legal-pages` chunk, next to `legalPageIdentity.ts`, so that wording stays in one built file. The nammco allowlist already names that chunk. `scripts/public-nammco.mjs`, `scripts/prerender.mjs`, and `scripts/check-pages-artifact.mjs` are not changed.

## Redeploy list

Migration: none.

Edge functions, in this order. Confirmed by import graph of the changed shared files plus the functions edited directly. VERIFIED from the source imports on this branch.

1. invite-sponsor (edited, imports `transactional_copy.ts` and `admit_share.ts`)
2. request-re-intro (edited, `handle.ts` and `club.ts` import `notify_admin.ts`)
3. request-mandate-intro (edited, `handle.ts` imports `notify_admin.ts`)
4. majlis-admin-action (edited)
5. majlis-rsvp (edited)
6. set-member-status (edited)
7. admit-member (`admit_share.ts`, `transactional_copy.ts`)
8. review-membership (`admit_share.ts`)
9. decide-application (`transactional_copy.ts`)
10. notify-application (`transactional_copy.ts`)
11. submit-application (`notify_admin.ts`, `transactional_copy.ts`)
12. request-password-reset (`transactional_copy.ts`)
13. majlis-apply (`notify_admin.ts`)
14. notify-desk-intro (`notify_admin.ts`)
15. due-diligence-start (`handle.ts` imports `notify_admin.ts`)

`desk_intro_alert.ts` imports only a type from `notify_admin.ts`, so it does not itself need a deploy. `notify-desk-intro` imports the value and is listed.

Email can be switched on later in the existing invite and notify functions. This PR adds no send call. The partner wording is already in the letter templates. INFERRED: a later switch-on uses those templates without a second copy change.

Database error text such as `A sponsor seat cannot also hold the Founding tier.` is still in existing migrations. The client maps those codes to partner sentences. Live raw SQL errors stay on the old wording until a later migration. VERIFIED in `src/lib/membershipTiers.ts` and the unchanged SQL tests.

## Not done

- Terms and Privacy text. Listed above for PF-14.
- Before shots. This run started from the after tree. After shots are in the PR.
- Admin Majlis filter and Admin Home Partners tile shots. Those screens need a signed-in staff session and have no preview fixture. The labels are in source and covered by the copy gate and `staff home counts sponsor seats instead of a fixed zero`. 
- Invite email preview. The repo does not render the invite letter in the app. Email sending stays parked. The letter text is covered by `sponsor invite mail is a set-password letter without a booking link`.
- Stored category gloss `Firms acquiring or governing companies.` A change to the exact private-equity sentence in the database would need a migration. This brief says no migration.

## Secrets grade

PASS for the diff. No new emails, keys, tokens, passwords, user ids, staff names, or real member data. Tests and fixtures that already used example.com were left on example.com. Shots use example fixture names and example.com. The public login page still shows its existing placeholder, which this PR did not add.

## Checks

- `tsc -b` as part of `node scripts/build-for-csp-crawl.mjs`: pass. VERIFIED.
- `node --experimental-strip-types --test scripts/*.test.ts`: 734 pass, 0 fail, 3 skipped. VERIFIED.
- Build, prerender, `scripts/pages-artifact-gate.sh`, and `node scripts/check-pages-artifact.mjs dist`: pass. VERIFIED.
- `scripts/public-nammco.mjs` is unchanged. VERIFIED.
