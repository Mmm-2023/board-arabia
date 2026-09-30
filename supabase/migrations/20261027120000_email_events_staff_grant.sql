-- Staff desk reads public.email_events with the authenticated role.
-- email_events_select_staff (private.is_staff()) still limits rows to staff.
-- anon is not granted. Grant is safe to run again.

grant select on public.email_events to authenticated;
