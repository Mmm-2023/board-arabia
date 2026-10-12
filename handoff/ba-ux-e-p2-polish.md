# BA UX-E P2 polish

Base at start: `5b35c45` (Rename user-facing sponsor copy to partner). Merged later main with a merge commit if it moved. No force-push, no rebase, no amend.

## Apply list

None.

## Redeploy list

None.

## Secrets grade

PASS. The diff has no emails, keys, tokens, passwords, user ids, booking links, staff names, or real member data. Tests use example ids only. Shots use example names only.

## Phrase count: "No public booking calendar"

Counted on the prerendered HTML.

| Page | Exact phrase "No public booking calendar" | "There is no public booking calendar" | "No public calendar" |
|---|---|---|---|
| / | 1 (hero) | 0 | 0 |
| /apply | 0 | 1 (locked Who runs the desk) | 0 |
| /for-members | 0 | 0 | 0 |
| /how-it-works | 0 | 0 | 1 (existing refusal line) |
| /about | 0 | 1 (locked Who runs the desk) | 0 |
| /register | 0 | 0 | 0 |

The footer repeat is gone. The home FAQ still has the calendar question. Its answer does not repeat the exact phrase. The prerender gate still sees the exact phrase once on `/`.

The brief's example sentence used a lowercase "no". That string would fail the gate, which looks for `No public booking calendar` with a capital N. The shipped hero starts with that exact phrase.

## Phone height (E7)

Example data only. Collapsed is the phone page as opened. Expanded is the same page after every More control is opened, and after Readiness on real estate.

| Page | Collapsed | Expanded | Shorter |
|---|---|---|---|
| Directory (10 example cards) | 4075 px | 6327 px | 35.6% |
| Real estate (4 example cards) | 1890 px | 3109 px | 39.2% |

VERIFIED by measuring `document.documentElement.scrollHeight` at 390 px.

## Items

- E1. Hero is one sentence at `src/pages/LandingPage.tsx:124`. Footer calendar line removed at `src/components/Footer.tsx` (the membership blurb remains, the calendar sentence does not). Test: `public copy keeps one booking phrase, invite email, and the scale pair` in `scripts/ux-e-polish.test.ts`. VERIFIED.
- E2. Majlis hosting copy at `src/pages/ForMembersPage.tsx:67`, `src/content/marketing.ts:52`, `src/lib/accountPreview.ts:39` and `:51`, and the for-members description at `src/content/seo.ts:58`. "Off the record" stays in `accountPreview.ts`. The brief's old "Four salons" lines in For members and marketing had already moved on main. Test: `locked account pages render no member-private fields` in `scripts/candidate-dom.test.ts`. VERIFIED.
- E3. "private invite email" at `src/content/seo.ts:84` and `:122`. How it works and the home FAQ render that FAQ. Test: the public-copy test above. VERIFIED for the site. The Edge letter in `supabase/functions/_shared/transactional_copy.ts` still says "private next-step email". Not changed: an Edge redeploy is out of scope.
- E4. Labels and fieldset at `src/pages/ApplyPage.tsx:309-328`. Validation text is unchanged. Test: the public-copy test. VERIFIED.
- E5. Fax trap at `src/pages/apply/RegisterScreen.tsx:124-129` already had `aria-hidden="true"`, `tabIndex={-1}`, and `autoComplete="off"` on main. This PR locks that and the server reject. Tests: `register fax trap stays hidden and the server check remains` and the existing honeypot case in `scripts/tt3-abuse-retention.test.ts`. VERIFIED.
- E6. Two columns from Tailwind `xl` (min-width 1280 px): `src/pages/dashboard/MandatesBoard.tsx:81`, `src/pages/dashboard/MandatesPage.tsx:52`, `src/pages/dashboard/DirectoryBoard.tsx:89` and `:139`, `src/pages/dashboard/RoomsBoard.tsx:11` and `:47`, `src/pages/dashboard/DealRoomsView.tsx:40`, `src/pages/dashboard/MemberRoomsList.tsx:6`. Below 1280 the lists stay one column. Test: `member grids widen at xl and phone cards expose a More control`. VERIFIED.
- E7. Phone More at `src/pages/dashboard/DirectoryBoard.tsx:249-253` and `src/pages/dashboard/OpportunityCard.tsx:124`. Readiness starts collapsed at `src/pages/dashboard/ReadinessStrip.tsx:47` via `collapsed` from `OpportunityCard.tsx:160`. Heights above. Test: the grid test. VERIFIED.
- E8. Client sort at `src/lib/directoryOrder.ts:14`, called from `src/pages/dashboard/DirectoryBoard.tsx:56`. Own card, then admitted, then invited, then samples in arrival order. No migration. Test: `directory order puts you first, admitted next, invited last, and keeps samples after`. VERIFIED.
- E9. Line at `src/pages/dashboard/CreateRoomForm.tsx:183`. Test: `create room says who can see it and the radio row is a 44 px target`. VERIFIED.
- E10. Spoken place at `src/components/RePlace.tsx:13-16`. Card meta already separated the visual dot from the spoken comma. Test: `place lines speak Riyadh, Residential and Tabuk, Red Sea`. VERIFIED.
- E11. Radio row was already `min-h-11` and `h-5 w-5` at `src/pages/dashboard/CreateRoomForm.tsx:216-217`. Measured 20 by 20 px inside a 44 px label. Test: the create-room test. VERIFIED.
- E12. Company site field at `src/pages/dashboard/DueDiligencePage.tsx:484`, submit button at `:504`. Operator line and upload hint copy are unchanged. Test: `desk screen keeps one status and puts the error under the check button` in `scripts/due-diligence.test.ts`. VERIFIED.
- E13. Tool and date at `src/pages/dashboard/AiToolsHome.tsx:223` and `src/lib/recentReports.ts:25` and `:274`. Delete menu at `AiToolsHome.tsx:245`. Confirm dialog remains. Test: `recent report dates use 6 Oct 2026 and off-tool links follow live flags only`. VERIFIED.
- E14. Lead at `src/lib/aiToolUi.ts:10` and `:30`. Live links at `src/lib/aiToolUi.ts:13` and `src/pages/dashboard/AiToolPage.tsx:492`. A flag that is off is not linked. Test: the dates-and-links test. VERIFIED.
- E15. 20 px box and 44 px label row: `src/pages/admin/PeoplePage.tsx:189`, `src/pages/admin/SponsorPackagesPanel.tsx:165` and `:169`, `src/pages/admin/RePartnersEditor.tsx:268`, `src/pages/admin/MembershipDesk.tsx:347` and `:351`. Settings package checkbox measured 20 by 20 px in a 44 px label. Test: `admin checkbox rows stay 44 px with a 20 px box`. VERIFIED.

## Public routes and CTA destinations

`/` , `/apply`, `/for-members`, `/how-it-works`, `/register`, and `/login` still resolve. Route coverage: `scripts/apply-route.test.ts` and `public /partners and /for-capital send Apply to /apply and Log in to /login` in `scripts/partner-wording.test.ts`. After shots of Home, Apply, and Log in are in the artifact set. VERIFIED.

## Not done, and why

- Edge letter still says "private next-step email" (`supabase/functions/_shared/transactional_copy.ts`). Shipping that needs an Edge redeploy. The brief said to stop and report if an Edge change looked necessary.
- `src/pages/AboutPage.tsx` still says "a quarterly majlis" inside a longer sentence. That line was not one of the named E2 locations. Left it.
- Admin checkboxes outside People, packages, real estate partners, and applications were left as they were. The brief named those four.
- Local Postgres tests could not run here (`dropdb` is not installed). They run in GitHub pr-checks.

## Locked files

Unchanged versus the merge base by this PR: `src/pages/admin/EmailPage.tsx`, `src/pages/dashboard/HomeSnapshotView.tsx`, `src/pages/dashboard/DashboardHome.tsx`, `src/lib/aiReportOperator.ts`, `src/components/WhoRunsTheDesk.tsx`, `src/content/legal/`, `scripts/public-nammco.mjs`, `scripts/prerender.mjs`, `scripts/check-pages-artifact.mjs`, `src/App.tsx`, `scripts/apply-route.test.ts`. No migration. No QA staff row edit. No new public nammco.
