-- Owner delete for a due diligence report, staff read of member avatars,
-- and a sample flag on the home mandate intro queue.
-- The deck file is removed with the Storage API. Do not delete storage.objects here.
-- Apply after review. Not applied by the authoring agent.

create or replace function public.delete_own_due_diligence_report(p_report_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_deck uuid;
  v_path text;
  v_owner uuid := auth.uid();
begin
  if v_owner is null then
    raise exception 'not_allowed' using errcode = '42501';
  end if;

  select r.deck_id, d.storage_path
    into v_deck, v_path
  from public.due_diligence_reports r
  join public.due_diligence_decks d
    on d.id = r.deck_id
   and d.member_id = r.member_id
  where r.id = p_report_id
    and r.member_id = v_owner;

  if v_deck is null or v_path is null or position(v_owner::text || '/' in v_path) <> 1 then
    raise exception 'not_allowed' using errcode = '42501';
  end if;

  delete from public.due_diligence_decks
  where id = v_deck
    and member_id = v_owner;

  return jsonb_build_object('ok', true, 'storage_path', v_path);
end;
$$;

revoke all on function public.delete_own_due_diligence_report(uuid) from public, anon;
grant execute on function public.delete_own_due_diligence_report(uuid) to authenticated;

drop policy if exists due_diligence_decks_storage_delete_own on storage.objects;
create policy due_diligence_decks_storage_delete_own on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'due-diligence-decks'
    and name ~ (
      '^' || (select auth.uid())::text
      || '/[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/source\.(pdf|pptx)$'
    )
    and exists (
      select 1
      from public.members m
      where m.user_id = (select auth.uid())
        and m.status in ('invited', 'active')
    )
  );

drop policy if exists member_avatars_select_staff on storage.objects;
create policy member_avatars_select_staff on storage.objects
  for select to authenticated
  using (
    bucket_id = 'member-avatars'
    and private.is_staff()
    and name ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}/avatar$'
  );

create or replace function public.staff_list_mandate_intros()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not private.is_staff() then
    raise exception 'not_allowed' using errcode = '42501';
  end if;

  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', i.id,
      'status', i.status,
      'sector', m.sector,
      'deal_type', m.deal_type,
      'company_name', m.company_name,
      'member_name', coalesce(nullif(trim(p.full_name), ''), 'Member'),
      'is_demo', m.is_demo or private.sample_subject(m.id)
    ) order by i.requested_at)
    from public.mandate_intros i
    join public.mandates m on m.id = i.mandate_id
    left join public.profiles p on p.user_id = i.member_id
    where i.status = 'pending'
  ), '[]'::jsonb);
end;
$$;

revoke all on function public.staff_list_mandate_intros() from public, anon;
grant execute on function public.staff_list_mandate_intros() to authenticated;
