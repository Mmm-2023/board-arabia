-- Direct reads of staff_access_log are closed.
-- aal2 staff use staff_list_access_log, which returns actor_name and actor_role.
-- Safe to run again.

revoke all on table public.staff_access_log from public, anon, authenticated;
drop policy if exists staff_access_log_select_staff on public.staff_access_log;

grant insert on table public.staff_access_log to service_role;

comment on table public.staff_access_log is
  'Staff reads of one member record or a member-shared file. Insert-only. aal2 staff read it through staff_list_access_log. Kept 13 months.';
