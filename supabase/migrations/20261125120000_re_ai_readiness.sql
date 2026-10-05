-- Deal readiness memo. Adds the tool key and turns it on for members.
-- Apply after 20261124120000_re_club_interest.sql.
-- Not applied by the authoring agent.
-- Redeploy the ai-tool-job Edge function after this migration.
-- No new secret. Uploads stay in the ai-tool-uploads bucket.
-- The existing retention-sweep deletes these jobs with the other AI tools.
-- Default retention is 30 days on ai_tool_settings. Do not add another schedule.

alter table public.ai_tool_flags drop constraint ai_tool_flags_tool_key_check;
alter table public.ai_tool_flags add constraint ai_tool_flags_tool_key_check check (
  tool_key in ('cfo_check', 'market_brief', 'term_sheet_review', 'pricing_sense_check', 'deal_readiness')
);

alter table public.ai_tool_jobs drop constraint ai_tool_jobs_tool_key_check;
alter table public.ai_tool_jobs add constraint ai_tool_jobs_tool_key_check check (
  tool_key in ('cfo_check', 'market_brief', 'term_sheet_review', 'pricing_sense_check', 'deal_readiness')
);

alter table public.ai_tool_outputs drop constraint ai_tool_outputs_tool_key_check;
alter table public.ai_tool_outputs add constraint ai_tool_outputs_tool_key_check check (
  tool_key in ('cfo_check', 'market_brief', 'term_sheet_review', 'pricing_sense_check', 'deal_readiness')
);

alter table public.ai_tool_consents drop constraint ai_tool_consents_tool_key_check;
alter table public.ai_tool_consents add constraint ai_tool_consents_tool_key_check check (
  tool_key in ('cfo_check', 'market_brief', 'term_sheet_review', 'pricing_sense_check', 'deal_readiness')
);

alter table public.ai_tool_notes drop constraint ai_tool_notes_tool_key_check;
alter table public.ai_tool_notes add constraint ai_tool_notes_tool_key_check check (
  tool_key in ('cfo_check', 'market_brief', 'term_sheet_review', 'pricing_sense_check', 'deal_readiness')
);

insert into public.ai_tool_flags (tool_key, enabled)
values ('deal_readiness', true)
on conflict (tool_key) do nothing;

create or replace function public.set_ai_tool_flag(p_tool text, p_enabled boolean)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  if not private.is_staff() then
    raise exception 'not_allowed' using errcode = '42501';
  end if;
  if p_tool not in ('cfo_check', 'market_brief', 'term_sheet_review', 'pricing_sense_check', 'deal_readiness') then
    raise exception 'bad_tool' using errcode = '22023';
  end if;
  if p_enabled is null then
    raise exception 'bad_flag' using errcode = '22023';
  end if;
  update public.ai_tool_flags
  set enabled = p_enabled
  where tool_key = p_tool;
  return jsonb_build_object('ok', true, 'tool_key', p_tool, 'enabled', p_enabled);
end;
$$;

create or replace function public.record_ai_tool_consent(
  p_tool text,
  p_job_id uuid,
  p_copy_version text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_owner uuid := auth.uid();
  v_row public.ai_tool_consents%rowtype;
begin
  if v_owner is null then
    raise exception 'not_allowed' using errcode = '42501';
  end if;
  if p_tool not in ('cfo_check', 'market_brief', 'term_sheet_review', 'pricing_sense_check', 'deal_readiness') then
    raise exception 'bad_tool' using errcode = '22023';
  end if;
  if p_job_id is null or p_copy_version is null or char_length(btrim(p_copy_version)) not between 1 and 80 then
    raise exception 'bad_consent' using errcode = '22023';
  end if;
  if not exists (
    select 1 from public.members m
    where m.user_id = v_owner
      and m.status in ('invited', 'active')
  ) then
    raise exception 'not_allowed' using errcode = '42501';
  end if;

  insert into public.ai_tool_consents (member_id, tool_key, copy_version, accepted_at, job_id)
  values (v_owner, p_tool, btrim(p_copy_version), now(), p_job_id)
  on conflict (job_id) do update
    set copy_version = excluded.copy_version,
        accepted_at = now()
    where public.ai_tool_consents.member_id = excluded.member_id
      and public.ai_tool_consents.tool_key = excluded.tool_key
  returning * into v_row;

  if v_row.id is null then
    raise exception 'not_allowed' using errcode = '42501';
  end if;

  return jsonb_build_object(
    'id', v_row.id,
    'job_id', v_row.job_id,
    'tool_key', v_row.tool_key,
    'copy_version', v_row.copy_version,
    'accepted_at', v_row.accepted_at
  );
end;
$$;

create or replace function public.list_own_ai_tool_jobs(p_tool text)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_owner uuid := auth.uid();
begin
  if v_owner is null then
    raise exception 'not_allowed' using errcode = '42501';
  end if;
  if p_tool is not null and p_tool not in ('cfo_check', 'market_brief', 'term_sheet_review', 'pricing_sense_check', 'deal_readiness') then
    raise exception 'bad_tool' using errcode = '22023';
  end if;
  return coalesce((
    select jsonb_agg(to_jsonb(rows))
    from (
      select
        j.id,
        j.tool_key,
        j.status,
        j.step,
        j.file_name,
        coalesce(n.title, j.file_name) as title,
        j.created_at
      from public.ai_tool_jobs j
      left join public.ai_tool_notes n
        on n.job_id = j.id
       and n.member_id = j.member_id
      where j.member_id = v_owner
        and (p_tool is null or j.tool_key = p_tool)
      order by j.created_at desc
      limit 20
    ) rows
  ), '[]'::jsonb);
end;
$$;
