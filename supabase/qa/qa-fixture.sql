-- Staff QA fixture. Not a migration. Do not move this file under supabase/migrations.
-- The operator runs it with psql after creating an auth user by hand.
-- Never point this at a real member.
-- A member or room row with is_demo = false is refused.
-- This file does not send mail and does not write storage.
--
-- Edit the qa_user line locally. Do not commit that edit.
-- The all-zero id is refused.
--
-- psql "$DATABASE_URL" -f supabase/qa/qa-fixture.sql
-- The dashboard SQL editor does not accept the \set line. Use psql.
-- DATABASE_URL stays on the operator machine. Do not commit it.

\set ON_ERROR_STOP on
\set qa_user 00000000-0000-0000-0000-000000000000

begin;

select set_config('qa.user_id', :'qa_user', true);

do $qa$
declare
  qa_user uuid := current_setting('qa.user_id')::uuid;
  room_id uuid := 'c0ffee00-0000-4000-8000-0000000000a1';
  doc_id uuid := 'c0ffee00-0000-4000-8000-0000000000a2';
  participant_id uuid := 'c0ffee00-0000-4000-8000-0000000000a3';
  storage_name text;
  obj_meta jsonb;
  obj_size bigint;
  obj_mime text;
begin
  if qa_user = '00000000-0000-0000-0000-000000000000'::uuid then
    raise exception 'qa_user placeholder is unchanged';
  end if;

  if not exists (select 1 from auth.users u where u.id = qa_user) then
    raise exception 'qa auth user is missing';
  end if;

  if exists (
    select 1
    from public.members m
    where m.user_id = qa_user
      and m.is_demo = false
  ) then
    raise exception 'refusing to change a member where is_demo = false';
  end if;

  if exists (
    select 1
    from public.members m
    where lower(m.email) = 'qa@example.com'
      and m.user_id is distinct from qa_user
  ) then
    raise exception 'qa example address already belongs to another member';
  end if;

  if exists (
    select 1
    from public.rooms r
    where r.id = room_id
      and r.is_demo = false
  ) then
    raise exception 'refusing to change a room where is_demo = false';
  end if;

  -- Seat intl is a non-partner seat and is not the home region.
  -- Tier member keeps a founding number off this row.
  -- The member rooms list only returns opened_by admin, so this room is not a sample card.
  insert into public.members (
    user_id,
    email,
    seat,
    status,
    tier,
    tiers,
    is_demo,
    directory_hidden,
    show_card_to_sponsors,
    digest_email_opt_in
  )
  select
    qa_user,
    'qa@example.com',
    'intl',
    'active',
    'member',
    array['member']::text[],
    marker.is_demo,
    true,
    false,
    false
  from (select true as is_demo) marker
  where marker.is_demo = true
  on conflict (user_id) do update
  set
    email = excluded.email,
    seat = excluded.seat,
    status = excluded.status,
    tier = excluded.tier,
    tiers = excluded.tiers,
    is_demo = true,
    directory_hidden = true,
    show_card_to_sponsors = false,
    digest_email_opt_in = false
  where public.members.is_demo = true;

  update public.members
  set invites_remaining = 0
  where user_id = qa_user
    and is_demo = true
    and invites_remaining is distinct from 0;

  insert into public.profiles (
    user_id,
    full_name,
    company,
    include_in_public_aggregates
  )
  select
    m.user_id,
    'QA Member (Example)',
    'Example Co',
    false
  from public.members m
  where m.user_id = qa_user
    and m.is_demo = true
  on conflict (user_id) do update
  set
    full_name = excluded.full_name,
    company = excluded.company,
    include_in_public_aggregates = false
  where exists (
    select 1
    from public.members m
    where m.user_id = public.profiles.user_id
      and m.is_demo = true
  );

  insert into public.rooms (
    id,
    is_demo,
    status,
    name,
    summary,
    sector,
    stage,
    member_count,
    host_name,
    opened_by,
    purpose,
    owner_member_id,
    sort_order
  )
  select
    'c0ffee00-0000-4000-8000-0000000000a1'::uuid,
    true,
    'open',
    'QA test room (Example)',
    'Example room for a staff QA pass. It is not a live deal.',
    'Example',
    'Example',
    1,
    'QA Member (Example)',
    'member',
    'Staff QA example.',
    m.user_id,
    0
  from public.members m
  where m.user_id = qa_user
    and m.is_demo = true
  on conflict (id) do update
  set
    is_demo = true,
    status = excluded.status,
    name = excluded.name,
    summary = excluded.summary,
    sector = excluded.sector,
    stage = excluded.stage,
    member_count = excluded.member_count,
    host_name = excluded.host_name,
    opened_by = excluded.opened_by,
    purpose = excluded.purpose,
    owner_member_id = excluded.owner_member_id,
    sort_order = excluded.sort_order
  where public.rooms.is_demo = true
    and public.rooms.id = 'c0ffee00-0000-4000-8000-0000000000a1'::uuid;

  insert into public.room_participants (
    id,
    room_id,
    member_id,
    role,
    invite_status,
    accepted_at
  )
  select
    'c0ffee00-0000-4000-8000-0000000000a3'::uuid,
    r.id,
    m.user_id,
    'owner',
    'accepted',
    coalesce(existing.accepted_at, now())
  from public.rooms r
  join public.members m
    on m.user_id = qa_user
   and m.is_demo = true
  left join public.room_participants existing
    on existing.room_id = r.id
   and existing.member_id = m.user_id
  where r.id = 'c0ffee00-0000-4000-8000-0000000000a1'::uuid
    and r.is_demo = true
  on conflict (room_id, member_id) do update
  set
    role = 'owner',
    invite_status = 'accepted',
    accepted_at = coalesce(public.room_participants.accepted_at, excluded.accepted_at),
    declined_at = null,
    removed_at = null
  where exists (
    select 1
    from public.rooms r
    where r.id = public.room_participants.room_id
      and r.id = 'c0ffee00-0000-4000-8000-0000000000a1'::uuid
      and r.is_demo = true
  );

  storage_name := room_id::text || '/' || doc_id::text || '/source';

  select o.metadata
  into obj_meta
  from storage.objects o
  where o.bucket_id = 'deal-room-documents'
    and o.name = storage_name
  limit 1;

  if not found then
    if exists (
      select 1
      from public.room_documents d
      where d.room_id = room_id
        and d.file_name = 'Example document.pdf'
        and d.deleted_at is null
        and d.id is distinct from doc_id
    ) then
      raise notice 'An app upload already stored Example document.pdf on this room. The fixed sample row was not added. To attach the fixed row, upload the file to bucket deal-room-documents at %', storage_name;
    else
      raise notice 'No storage object yet. Upload Example document.pdf to bucket deal-room-documents at %', storage_name;
    end if;
  else
    obj_size := case
      when jsonb_typeof(obj_meta->'size') = 'number' then (obj_meta->>'size')::bigint
      when coalesce(obj_meta->>'size', '') ~ '^[0-9]+$' then (obj_meta->>'size')::bigint
      else null
    end;
    obj_mime := coalesce(obj_meta->>'mimetype', obj_meta->>'mime', '');
    if obj_mime not in ('application/pdf', 'image/png', 'image/jpeg') then
      obj_mime := 'application/pdf';
    end if;

    if obj_size is null or obj_size <= 0 or obj_size > 20971520 then
      raise notice 'Storage object at % has no usable size. The document row was not written.', storage_name;
    elsif exists (
      select 1
      from public.room_documents d
      where d.storage_path = storage_name
        and d.id is distinct from doc_id
    ) then
      raise exception 'storage path already belongs to another document';
    else
      -- Page count is 1 because this script does not open the file.
      insert into public.room_documents (
        id,
        room_id,
        uploaded_by,
        storage_path,
        file_name,
        mime,
        size_bytes,
        page_count,
        download_allowed
      )
      select
        'c0ffee00-0000-4000-8000-0000000000a2'::uuid,
        r.id,
        m.user_id,
        storage_name,
        'Example document.pdf',
        obj_mime,
        obj_size,
        1,
        false
      from public.rooms r
      join public.members m
        on m.user_id = qa_user
       and m.is_demo = true
      where r.id = 'c0ffee00-0000-4000-8000-0000000000a1'::uuid
        and r.is_demo = true
      on conflict (id) do update
      set
        room_id = excluded.room_id,
        uploaded_by = excluded.uploaded_by,
        storage_path = excluded.storage_path,
        file_name = excluded.file_name,
        mime = excluded.mime,
        size_bytes = excluded.size_bytes,
        page_count = excluded.page_count,
        download_allowed = false,
        deleted_at = null
      where exists (
        select 1
        from public.rooms r
        where r.id = public.room_documents.room_id
          and r.id = 'c0ffee00-0000-4000-8000-0000000000a1'::uuid
          and r.is_demo = true
      );
    end if;
  end if;
end
$qa$;

select
  m.user_id,
  m.email,
  m.is_demo as member_is_demo,
  m.status,
  m.seat,
  m.tier,
  m.directory_hidden,
  m.digest_email_opt_in,
  m.invites_remaining,
  p.full_name,
  p.company,
  p.include_in_public_aggregates,
  r.id as room_id,
  r.name as room_name,
  r.is_demo as room_is_demo,
  r.opened_by,
  r.status as room_status,
  rp.role,
  rp.invite_status,
  d.id as document_id,
  d.file_name,
  (
    'c0ffee00-0000-4000-8000-0000000000a1'
    || '/'
    || 'c0ffee00-0000-4000-8000-0000000000a2'
    || '/source'
  ) as storage_path
from public.members m
left join public.profiles p on p.user_id = m.user_id
left join public.rooms r
  on r.id = 'c0ffee00-0000-4000-8000-0000000000a1'::uuid
left join public.room_participants rp
  on rp.room_id = r.id
 and rp.member_id = m.user_id
left join public.room_documents d
  on d.id = 'c0ffee00-0000-4000-8000-0000000000a2'::uuid
 and d.deleted_at is null
where m.user_id = current_setting('qa.user_id')::uuid
  and m.is_demo = true;

commit;

-- Teardown. Leave these lines commented on a normal run.
-- Uncomment only to remove the fixed sample rows. A row with is_demo = false is not deleted.
-- This does not delete the auth user and does not delete storage objects.
-- delete from public.room_documents d
-- using public.rooms r
-- where d.id = 'c0ffee00-0000-4000-8000-0000000000a2'::uuid
--   and d.room_id = r.id
--   and r.id = 'c0ffee00-0000-4000-8000-0000000000a1'::uuid
--   and r.is_demo = true;
-- delete from public.room_participants p
-- using public.rooms r
-- where p.id = 'c0ffee00-0000-4000-8000-0000000000a3'::uuid
--   and p.room_id = r.id
--   and r.id = 'c0ffee00-0000-4000-8000-0000000000a1'::uuid
--   and r.is_demo = true;
-- delete from public.rooms
-- where id = 'c0ffee00-0000-4000-8000-0000000000a1'::uuid
--   and is_demo = true;
-- delete from public.profiles p
-- using public.members m
-- where p.user_id = m.user_id
--   and m.user_id = :'qa_user'::uuid
--   and m.is_demo = true;
-- delete from public.members
-- where user_id = :'qa_user'::uuid
--   and is_demo = true;
