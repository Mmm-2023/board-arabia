-- Logged-in AI report operator. One row.
-- Signed-in users may select it. anon and public have no grant.
-- Apply after 20261125120000_re_ai_readiness.sql.
-- Not applied by the authoring agent. No Edge redeploy.

create table public.ai_report_operator (
  id integer primary key,
  entity text not null,
  cr text not null,
  constraint ai_report_operator_singleton check (id = 1),
  constraint ai_report_operator_entity_not_blank check (length(btrim(entity)) > 0),
  constraint ai_report_operator_cr_not_blank check (length(btrim(cr)) > 0)
);

insert into public.ai_report_operator (id, entity, cr)
values (1, 'NAMMCO Holding Co.', '7043252647');

alter table public.ai_report_operator enable row level security;
alter table public.ai_report_operator force row level security;

revoke all on table public.ai_report_operator from public, anon, authenticated;
grant select on table public.ai_report_operator to authenticated;
grant all on table public.ai_report_operator to service_role;

drop policy if exists ai_report_operator_select on public.ai_report_operator;
create policy ai_report_operator_select on public.ai_report_operator
  for select to authenticated
  using (true);
