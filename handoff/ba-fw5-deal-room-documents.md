# Deal room document vault

One PR. Schema, storage, Edge, and the Documents panel ship together. The retention sweep file matches main and is not part of this change.

## Secrets grade

VERIFIED. This diff adds no live mailbox, API key, token, password, service-role key, user id, or staff name. Tests use example.com only. `.env` is not in the commit.

## What landed

Accepted room participants can upload a PDF, PNG, or JPEG (20 MB, 40 pages). The file is stored at `{room_id}/{document_id}/source` in the private bucket `deal-room-documents`. Members have no storage select, insert, update, or delete policy. The Edge function `deal-room-documents` is the only member read path.

A view is stamped on the server with the requesting member's own name and email, the date and time in Asia/Riyadh, and the first 8 characters of the room id. The stamp is read from `room_document_viewer_identity` for that caller. The response does not take a name or email from the client. Copy on the panel: "Viewing is watermarked and logged." The UI does not say screenshots are blocked.

Download defaults off. While it is off the API does not create a signed URL and the panel has no save button. When the owner or the uploader turns it on, download returns a signed URL with a 60 second TTL. That URL is the stored file. The brief watermarks views and asks for a signed URL on download. It does not ask for a watermark on the downloaded copy, so the download is not stamped. View returns the stamped bytes and no storage URL.

An uploader who is later removed can still delete or share the file they uploaded (`supabase/migrations/20261209140000_deal_room_documents.sql:864` and `:912`). The owner can also delete it. A removed person cannot view it.

The owner sets a file expiry or a member expiry, and can revoke a member. Expired access returns "Access expired". Invited, declined, removed, and non-participants get no metadata and no file.

Closing or archiving a room sets `rooms.closed_at` and revokes document access. Staff see a document count on the Rooms board and no file names. Staff can read the object only after the uploader shares it, and that read calls `private.note_staff_shared_read`.

## Retention helper, not wired

The 30 day rule lives in `dealRoomDocumentDue` at `supabase/functions/_shared/deal_room_documents.ts:23`. It is due only when the room status is closed or archived and `closedAt` is more than 30 days before now (`:24-31`). The unit test is `scripts/deal-room-documents.test.ts:57-64`.

Nothing in the running app calls `dealRoomDocumentDue`. The only reference outside its file is that unit test. `supabase/functions/retention-sweep/index.ts` matches main. It gets wired in when retention is switched back on.

The migration also defines `public.deal_room_document_retention` (`supabase/migrations/20261209140000_deal_room_documents.sql:879`). The sweep does not call it. Do not redeploy `retention-sweep`.

## Apply order for the operator

Do not apply this from the app or from CI.

1. Migration `supabase/migrations/20261209140000_deal_room_documents.sql` after `20261209120000_application_answers_at_admission.sql`.
2. Deploy Edge `deal-room-documents` (new). It imports `pdf-lib@1.17.1` from esm.sh (`supabase/functions/deal-room-documents/index.ts:2`).

Do not redeploy `retention-sweep`.

## Self-review

RLS is forced on every new table. VERIFIED.

- `room_documents` at `supabase/migrations/20261209140000_deal_room_documents.sql:90`
- `room_document_member_access` at `:92`
- `room_document_events` at `:94`
- `room_document_file_purge` at `:96`

Staff file read goes through `private.is_staff()` inside `private.room_document_staff_may_read_path`, and that helper calls `private.note_staff_shared_read`. VERIFIED. This migration replaces `note_staff_shared_read` (`:253-288`) with `search_path = ''`. The `room_documents` branch (`:280-281`) sets the member to `uploaded_by` and then calls `private.log_staff_access` (`:288`). The Security 3 body returned early for this table and wrote nothing. The service-role staff RPCs `close_any_deal_room` and `list_all_deal_rooms` still use `private.actor_is_staff(p_actor)` plus `p_aal = 'aal2'`, because those run as service_role and `private.is_staff()` would see no session user.

This migration file has 26 `SECURITY DEFINER` functions, all with `search_path = ''`. VERIFIED by counting the headers. The earlier handoff said 26 before `note_staff_shared_read` was in the file. That count was one high: the file then had 25. This review adds the replaced staff-read function, so the file now has 26. None set `search_path` to `public`. The one invoker function, `private.deal_room_document_retention_interval` (`:114-115`), also sets `search_path = ''`.

There is a storage SELECT policy for upsert and delete. VERIFIED. Storage upsert, replace, and delete read the object row before they write it. That read is `deal_room_documents_storage_select_shared_staff` at `:433-440`. Members have no select, insert, update, or delete policy on this bucket (`:426-430`), so they cannot list, upsert, or delete it. The Edge function uploads and deletes with the service role (`supabase/functions/deal-room-documents/index.ts:13-32`).

Only signed URLs are issued, and the bucket is not public. VERIFIED. The bucket insert sets `public` to false at `supabase/migrations/20261209140000_deal_room_documents.sql:416`, and the conflict update sets it false again at `:422`. The only client storage URL is `createSignedUrl` at `supabase/functions/deal-room-documents/index.ts:35`. The handler calls it only after `download_allowed` is true (`supabase/functions/_shared/deal_room_documents_http.ts:196-199`) and passes 60 seconds (`:199`, constant at `supabase/functions/_shared/deal_room_documents.ts:6`). There is no `getPublicUrl`. A view returns stamped bytes (`deal_room_documents_http.ts:176-182`), not a storage URL. An upload whose `Content-Length` is over 20 MB plus 64 KB of multipart overhead is refused before the body is read (`deal_room_documents_http.ts:60-62`).

Access is limited to accepted participants of that room. VERIFIED. `list_room_documents` requires `invite_status = 'accepted'` on that `room_id` (`:481-486`) and raises `not_participant` otherwise. `private.room_document_hold` hides the file unless the actor is an accepted participant of the document's room (`:201-203`). Upload uses `private.room_document_actor_accepted` (`:442`, check at `:455`). Per-file expiry updates require `room_id = p_room_id` (`:747-749`), so the owner of one room cannot change expiry or clear a revoke in another room. Every Edge RPC passes `p_actor: gate.caller.userId` (first use at `supabase/functions/_shared/deal_room_documents_http.ts:114`). The client cannot name another member.

## CSP

VERIFIED. `blob:` was added to `frame-src` only.

- `default-src` is `'self'` at `scripts/csp-policy.mjs:88`. It does not include `blob:`.
- `script-src` is built at `:85` and emitted at `:89`. It is `'self'`, script hashes, Turnstile, and PostHog only when analytics is on. It does not include `blob:`.
- `frame-src` is Turnstile plus `blob:` at `:97`.

`worker-src` at `:98` is unchanged (`'self' blob:`). No PDF worker was added. `img-src` already allowed `blob:` before this PR.

## pdf-lib

Exact version: `pdf-lib@1.17.1`.

- Edge import: `supabase/functions/deal-room-documents/index.ts:2` (`pdf-lib@1.17.1` on esm.sh).
- Dev dependency pin: `package.json:26` (`1.17.1`, no caret).
- Installed tarball: `package-lock.json` `node_modules/pdf-lib` version `1.17.1`. The lockfile otherwise matches main, including the `libc` fields on unrelated optional packages.

`npm audit` counts, high and critical included:

| | info | low | moderate | high | critical | total |
| --- | --- | --- | --- | --- | --- | --- |
| Before (main lockfile, no pdf-lib) | 0 | 0 | 0 | 0 | 0 | 0 |
| After (this branch, pdf-lib 1.17.1) | 0 | 0 | 0 | 0 | 0 | 0 |

pdf-lib adds no high or critical findings. It adds no findings at any severity. VERIFIED by `npm audit --json` on both lockfiles.

## Smoke for the operator

Use two test members in one open test room. Do not call retention-sweep. Do not call suggest-intros. Do not send email. Do not call PostHog.

1. Member A uploads a small PDF.
2. Member B views it in the room. The stamp shows B's own name and email, the Asia/Riyadh time, and the room reference. It does not show A's email.
3. With download off, B has no save button and the download action is refused. No signed URL is returned.
4. A or B turns download on. B then receives a signed URL that lasts 60 seconds. The file at that URL is the stored original, not a watermarked copy.
5. A sets an expiry for B. B then sees "Access expired" and cannot view or download.
6. A opens the access log. It shows the file name, B's display name, the action, and the time. It does not show an email.
7. Staff at aal2, before the share, sees the document count on the Rooms board and cannot open the file. After A shares that file with admin, a staff read writes one `staff_access_log` row with object type `room_documents` and member id A.

## Checks before this review commit

The previous head passed CSP report-only crawl and PR checks. This review commit is checked again after push.

## Claims

| Claim | Grade |
| --- | --- |
| `retention-sweep/index.ts` matches main. | VERIFIED by diff against `origin/main` |
| `dealRoomDocumentDue` has no production caller. | VERIFIED by search. The unit test is the only other reference. |
| RLS forced, staff file read uses `private.is_staff()`, definers use `search_path = ''`, bucket is private, signed URL TTL is 60 seconds, room access requires an accepted participant. | VERIFIED at the lines above |
| `pdf-lib@1.17.1` resolves on the hosted Edge runtime. | INFERRED from the existing esm.sh import style. UNKNOWN until the function is deployed. |
| A live two-member smoke on the hosted project. | UNKNOWN. Migrations and Edge functions were not applied from this PR. |
