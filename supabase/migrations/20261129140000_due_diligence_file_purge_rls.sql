-- Match the live purge-table lock. due_diligence_file_purge had no row security.
-- Same pattern as ai_tool_file_purge. service_role keeps access. Safe to run again.

alter table public.due_diligence_file_purge enable row level security;
alter table public.due_diligence_file_purge force row level security;

revoke all on table public.due_diligence_file_purge from public, anon, authenticated;
grant all on table public.due_diligence_file_purge to service_role;
