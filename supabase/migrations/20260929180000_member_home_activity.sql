-- Member home activity. Read-only. Signed-in member only.
-- Last 5 events for auth.uid(): own intro status, own majlis registration,
-- or a gathering this member hosts. Fixed labels. No email, phone, company,
-- amount, venue address, deck, or another member's name.
--
-- SECURITY DEFINER because mandate_intros and majlis_rsvps are revoked from
-- authenticated. Rows are limited to auth.uid() and a fixed jsonb shape.
--
-- Apply on the live Supabase project: Michael (or the operator). Not this agent.
-- No Edge function change.

create or replace function public.list_member_home_activity()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if auth.uid() is null or not exists (
    select 1
    from public.members m
    where m.user_id = auth.uid()
      and m.status in ('invited', 'active')
  ) then
    raise exception 'not_allowed' using errcode = '42501';
  end if;

  return (
    select coalesce(jsonb_agg(to_jsonb(item) order by item.happened_at desc), '[]'::jsonb)
    from (
      select
        id,
        kind,
        label,
        detail,
        happened_at,
        href,
        is_demo
      from (
        select
          i.id::text as id,
          'intro'::text as kind,
          case i.status
            when 'pending' then 'Intro requested'
            when 'approved' then 'Intro approved'
            else 'Intro declined'
          end as label,
          (m.sector || ' · ' || m.deal_type) as detail,
          i.requested_at as happened_at,
          '/dashboard/mandates'::text as href,
          m.is_demo as is_demo
        from public.mandate_intros i
        join public.mandates m on m.id = i.mandate_id
        where i.member_id = auth.uid()

        union all

        select
          e.id::text,
          'majlis'::text,
          case
            when e.host_member_id = auth.uid() then 'Majlis you are hosting'
            when r.status = 'waitlist' then 'Majlis waitlist'
            else 'Majlis registration'
          end,
          (e.title || ' · ' || e.region),
          r.registered_at,
          ('/dashboard/majlis?event=' || e.id::text),
          false
        from public.majlis_rsvps r
        join public.majlis_events e on e.id = r.event_id
        where r.member_id = auth.uid()
          and r.status in ('registered', 'waitlist')
          and e.status in ('published', 'pending_approval')

        union all

        select
          e.id::text,
          'majlis'::text,
          'Majlis you are hosting'::text,
          (e.title || ' · ' || e.region),
          e.created_at,
          ('/dashboard/majlis?event=' || e.id::text),
          false
        from public.majlis_events e
        where e.host_member_id = auth.uid()
          and e.status in ('published', 'pending_approval')
          and not exists (
            select 1
            from public.majlis_rsvps r
            where r.event_id = e.id
              and r.member_id = auth.uid()
              and r.status in ('registered', 'waitlist')
          )
      ) events
      order by happened_at desc
      limit 5
    ) item
  );
end;
$$;

revoke all on function public.list_member_home_activity() from public, anon;
grant execute on function public.list_member_home_activity() to authenticated;
