# Profile photo and LinkedIn

23 Sep 2026, updated 29 Sep 2026. Avatar upload stays on the existing private bucket. LinkedIn Connect is in the client and an Edge stub, and it stays off until a later deploy.

## Photo

- Section label **Photo**, on Your details.
- Empty or failed load: initials circle, **Add photo**, helper **Shown to founding peers when the private directory opens.**
- Saved photo: **Change photo** and **Remove photo**.
- Confirm: **Remove photo?** / **Your profile will show the empty photo placeholder until you add another.** / **Cancel** and **Remove photo**.
- Upload error: **Couldn’t upload that photo. Try a JPG or PNG under 5 MB.** and **Try again**.
- The browser checks JPG or PNG and 5 MB, then center-crops a square before upload.
- Private bucket `member-avatars`. One object per member: `{user id}/avatar`. Path saved on `profiles.avatar_path`.
- The shell header shows that photo, or initials when it is missing or fails to load.
- Directory cards request a signed URL. If that read fails, the card shows initials. Ghost cards stay empty circles, with no initials and no faces.
- `DashboardHome.tsx` is unchanged so this diff stays clear of the open Home work. The seat badge there still shows initials. The header mark on Home shows the photo.

## Peer read migration (not applied here)

`supabase/migrations/20260929203000_member_avatar_peer_read.sql`

Michael / Code PM applies it live. It does not create a bucket and does not change insert, update, or delete.

After apply, an invited or active member may read any `member-avatars` object named `{uuid}/avatar`. Until then, other members' photos stay initials.

## LinkedIn Connect (default off)

Flag: `VITE_LINKEDIN_CONNECT`. Only the exact string `true` turns it on. `.env.example` sets `false`. The Pages build does not set it, so the buttons are not shown.

When the flag is on, Profile shows **Connect LinkedIn**, or **Refresh from LinkedIn** after a successful pull in this browser session. The first password step (`must_set_password`) shows **Speed up with LinkedIn** above the photo, with **Fill in manually**.

The client calls Edge function `linkedin-oauth`. That function is not deployed by this change. Deploy it later.

### Edge secret names only

Do not commit values. The function reads these from Deno.env:

- `LINKEDIN_CLIENT_ID`
- `LINKEDIN_CLIENT_SECRET`

No LinkedIn password field. The login email is not replaced. Pulled text fields are name, headline, company, and LinkedIn URL. A JPEG or PNG photo can be stored at `{user id}/avatar`.
