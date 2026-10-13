# BA FW4 handoff: weekly digest, admin approval, sending parked

Base at start: `6da30503` (later than `ac016d95`). The digest migration is `supabase/migrations/20261212120000_weekly_digest.sql`. That name sorts after `20261211120000`. No Edge deploy. No schedule. No mailbox.

Secrets grade: VERIFIED. The diff has no API keys, service-role keys, live tokens, staff names, or mailbox addresses. Test fixtures use `example.com` only.

## What members get

| Item | Where | Grade |
| --- | --- | --- |
| In-app This week page at `/dashboard/digest`, linked from Home. No new nav item. | `src/App.tsx:189`, `src/pages/dashboard/HomeSnapshotView.tsx:88` | VERIFIED |
| Live sections for the current ISO week: new members, new mandates, upcoming Majlis, the caller's own introductions | `public.my_weekly_digest()` at `supabase/migrations/20261212120000_weekly_digest.sql:495` | VERIFIED |
| Empty sections hidden. Whole page empty state is "Nothing new this week." | `src/components/digest/WeeklyDigestView.tsx` | VERIFIED |
| Weekly email preference, default false, owner only, next to the other privacy controls | `public.set_digest_email_opt_in` at migration `:461`. UI `src/components/privacy/PrivacyPanelView.tsx:101` | VERIFIED |
| Unsubscribe route exists and does not read a token | `src/App.tsx:190`, `src/pages/dashboard/DigestPage.tsx:67` | VERIFIED |
| Random unique token column, not granted to the member role, not returned by the preference RPC | migration `:9` and `:79` | VERIFIED |

## What admin gets

| Item | Where | Grade |
| --- | --- | --- |
| `digest_issues` with status draft, approved, or withdrawn. RLS forced. No table grant for anon or authenticated. | migration `:315` | VERIFIED |
| Staff aal2 prepare, approve, and withdraw. `security definer`, `search_path ''`, gated by `private.is_staff()` | migration `:746` and `:805` | VERIFIED |
| Audit rows for prepare, approve, and withdraw. The screen shows the action and the Riyadh time, not an actor id | `digest_issue_log` at migration `:347`. UI `src/pages/admin/DigestIssuePanel.tsx` | VERIFIED |
| Preview on the existing Email page: member view, letter text, letter HTML, Approve, Withdraw. Sample introduction only. | `src/pages/admin/EmailPage.tsx`, `src/pages/admin/DigestIssuePanel.tsx` | VERIFIED |
| Send switch read-only on the page. Copy: "Sending is off. Email is not connected." | `digest_settings.send_enabled` default false at migration `:289` | VERIFIED |

Members do not read `digest_issues`. A draft is not a member page. The in-app digest is computed live for the signed-in member. The stored issue is the snapshot an admin approves for a future letter. Grade for that split: INFERRED from the 12 Oct rule that approval gates sending, and from the original in-app outcome. UNKNOWN: whether a later brief will replace the live page with the approved snapshot only.

## Data sources

- New members. `private.digest_member_visible` and `private.digest_build_payload` (migration `:128` and `:190`). Same visibility as `public.list_directory()` in `supabase/migrations/20261207120000_sponsor_directory_opt_in.sql:121`: not hidden, not demo, not `private.sample_subject`, invited or active, seats ksa, intl, or sponsor. A sponsor still only sees cards that opted in, via `private.caller_sees_member_card`. "New" is `members.created_at` in the current ISO week. Display name, headline, company, and avatar style only. VERIFIED.
- New mandates. Published, not demo, not sample, `created_at` in the current ISO week. Card fields only: sector, deal type, ticket band, geography, stage, one liner. No company name, contact, amount, or narrative. There is no separate published-at column on `public.mandates` (`20260929120000_demo_seed_thresholds_redaction.sql:565`). VERIFIED.
- Upcoming Majlis. Published, not cancelled, `starts_at` in the future. Title, Riyadh time, region, host display name. Venue address uses the same cases as `private.majlis_events_member_rows` in `20261202120000_majlis_rsvp_calendar.sql:363`. A sponsor seat gets no events, matching that reader (`seat <> 'sponsor'`). VERIFIED.
- Introductions. The caller's current-week rows only, with the same hidden, demo, sample, and sponsor-card filters as `public.list_my_intro_suggestions()` in `20261207120000_sponsor_directory_opt_in.sql:273`. Staff prepare does not read `intro_suggestions`. The admin preview uses the fixture "Preview member". VERIFIED.
- Home activity is untouched. `list_member_home_activity` is not called.

## Sending stays off

- `mail_ready` is false on the payload, the member RPC, the issue reader, and `weeklyDigestMail` (`supabase/functions/_shared/weekly_digest_copy.ts:107`).
- `public.digest_issue_sendable` (migration `:635`) returns true only when status is approved, `send_enabled` is true, and `mail_ready` is the text true. It does not send. The Postgres test forces those flags and checks that a draft and a withdrawn issue stay false, and that an approved issue stays false while `mail_ready` is false.
- No `sendEmail` import in the digest files. No new Edge function. No workflow schedule. No cron.
- The letter closes with the same Board Arabia footer as `boardMail`. `scripts/weekly-digest.test.ts` checks `hasBoardFooter` and `marketingSignatureHit`. The template file does not import the sender. It has no image and no em dash. The preferences link is `/dashboard/digest/unsubscribe` with no token.

## Also in this PR

- Email list dates use `formatUkDateTime` (`src/lib/ukDate.ts:4`), Asia/Riyadh, for example `22 Sept 2026, 14:49`. Kind becomes a plain label (`src/lib/emailEventLabel.ts`). The address is not rendered. A stored subject is shown as stored.
- Home "Got it", "Details", and "Open" controls use a 44 by 44 px minimum. Asserted by bounding box at 390.

## Review pass

`src/pages/dashboard/HomeSnapshotView.tsx` and `src/pages/admin/EmailPage.tsx` stay as approved. This commit does not edit them.

### Privacy files

Both files are touched only to add the weekly email preference. No earlier privacy sentence was rewritten.

`src/pages/dashboard/PrivacyPanelPage.tsx` (data only, no new sentences):

- `:12` holds `digestOptIn` for the signed-in member.
- `:26` to `:30` read `own_digest_preference` and set the toggle when the member already opted in.
- `:53` to `:58` call `set_digest_email_opt_in` for `auth.uid()` and put the toggle back if the call fails.
- `:94` and `:95` pass that state into the view.

`src/components/privacy/PrivacyPanelView.tsx`:

- `:21`, `:22`, `:34`, and `:35` add the optional `digestOptIn` and `onDigestOptIn` props. Existing callers still render.
- `:99` to `:129` are the new Weekly email control. The heading and the three sentences are new privacy wording.

LEGAL CHANGE. The new sentences are: "Weekly email", "You asked to receive the weekly email. It is not connected yet.", "Off. The weekly email is not connected yet.", and "This choice is saved for when weekly email is connected. Nothing is sent now." They sit on Your privacy. They are not in the Privacy Notice. Review this wording before apply.

### App.tsx

`/apply` is still `<Route path="/apply" element={<ApplyPage />} />` at `src/App.tsx:110`. The `/dashboard/ai` order is unchanged: due diligence, then `:toolSlug`, then `:toolSlug/:jobId`, then the catch-all. Diff against main:

```
 const PrivacyPanelPage = lazy(() => import('./pages/dashboard/PrivacyPanelPage').then((m) => ({ default: m.PrivacyPanelPage })))
+const DigestPage = lazy(() => import('./pages/dashboard/DigestPage').then((m) => ({ default: m.DigestPage })))
+const DigestUnsubscribePage = lazy(() =>
+  import('./pages/dashboard/DigestPage').then((m) => ({ default: m.DigestUnsubscribePage })),
+)

         <Route path="privacy" element={<PrivacyPanelPage />} />
+        <Route path="digest" element={<DigestPage />} />
+        <Route path="digest/unsubscribe" element={<DigestUnsubscribePage />} />
         <Route path="two-step" element={<TwoStepPage />} />
```

`scripts/weekly-digest.test.ts` matches `/dashboard/digest` to `DigestPage` and `/dashboard/not-a-page` to the `*` `RedirectKeep` route.

## Apply list

1. Apply `supabase/migrations/20261212120000_weekly_digest.sql` after `20261211120000`.
2. Do not deploy an Edge function. The letter template is `supabase/functions/_shared/weekly_digest_copy.ts` for a later brief.
3. Do not connect a mailbox and do not add a schedule. A later brief has to require `digest_issue_sendable` before any send.

## Not done

- No live send, no cron, no mailbox, no provider change.
- The unsubscribe token is stored and unique. The route does not redeem it.
- `src/lib/database.types.ts` only gained the six RPC names the app calls. Tables were not regenerated.
- No change to intro generation, Majlis RSVP, or the `/apply` route.

## Checks

`node --experimental-strip-types --test scripts/weekly-digest.test.ts scripts/weekly-digest-db.test.ts` passed before the full suite: migration shape, letter guards, presenter redaction, Riyadh date, 44 px tap targets, and the Postgres privacy cases.

Shots, 1280 and 390: `/opt/cursor/artifacts/weekly-digest/digest-full-*.png`, `digest-empty-*.png`, `digest-privacy-*.png`, `digest-admin-*.png`, `digest-home-*.png`.
