# Profile photo and LinkedIn

23 Sep 2026. Avatar copy from the locked brief is in the Directory empty-state PR. LinkedIn Connect is held for a later PR.

## Shipped with the photo

- Section label **Photo**, top-left on Your details.
- Empty: ghost circle, **Add photo**, helper **Shown to founding peers when the private directory opens.**
- Saved photo: **Change photo** and **Remove photo**.
- Confirm: **Remove photo?** / **Your profile will show the empty photo placeholder until you add another.** / **Cancel** and **Remove photo**.
- Upload error: **Couldn’t upload that photo. Try a JPG or PNG under 5 MB.** and **Try again**.
- Private bucket `member-avatars`. JPG or PNG, 5 MB. Member owns `{user id}/avatar` only.
- Directory ghost cards keep a muted circle above Sector, City, and Role. No faces or initials.

## Held

Do not build in this PR: **Speed up with LinkedIn**, **Connect LinkedIn**, **Refresh from LinkedIn**, **Fill in manually**, OAuth, or Edge token exchange. Those wait on Michael’s LinkedIn credentials.

The manual profile field stays **LinkedIn URL** with placeholder `https://www.linkedin.com/in/…`. It does not start an OAuth flow.
