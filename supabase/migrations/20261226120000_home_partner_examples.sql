-- Home Partners. Return a published example only when its category has no live partner.
-- An example with no category is never returned. One example per category.
-- The public list still returns published live rows that already have a logo.
-- Grants stay as SEC-C set them: anon and authenticated only, not public, not service_role.
-- Search path stays empty. This file is not applied here.

create or replace function private.list_trusted_partners_impl()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $fn$
declare
  member_view boolean;
begin
  member_view := auth.uid() is not null
    and exists (
      select 1
      from public.members m
      where m.user_id = auth.uid()
        and m.status in ('invited', 'active')
    );

  if member_view then
    return coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', shown.id,
        'is_demo', shown.is_demo,
        'is_partner', (shown.sponsor_user_id is not null and private.is_sponsor(shown.sponsor_user_id)),
        'name', shown.name,
        'blurb', shown.blurb,
        'monogram', shown.monogram,
        'logo_path', shown.logo_path,
        'category_slug', shown.category_slug
      ) order by shown.sort_order, shown.name)
      from (
        select
          t.id,
          t.is_demo,
          t.sponsor_user_id,
          t.name,
          t.blurb,
          t.monogram,
          t.logo_path,
          t.category_slug,
          t.sort_order
        from public.trusted_partners t
        where t.published
          and t.is_demo = false
        union all
        select
          picked.id,
          picked.is_demo,
          picked.sponsor_user_id,
          picked.name,
          picked.blurb,
          picked.monogram,
          picked.logo_path,
          picked.category_slug,
          picked.sort_order
        from (
          select distinct on (t.category_slug)
            t.id,
            t.is_demo,
            t.sponsor_user_id,
            t.name,
            t.blurb,
            t.monogram,
            t.logo_path,
            t.category_slug,
            t.sort_order
          from public.trusted_partners t
          where t.published
            and t.is_demo = true
            and t.category_slug is not null
            and not exists (
              select 1
              from public.trusted_partners live
              where live.published
                and live.is_demo = false
                and live.category_slug = t.category_slug
                and live.sponsor_user_id is not null
                and private.is_sponsor(live.sponsor_user_id)
            )
          order by t.category_slug, t.sort_order, t.name
        ) picked
      ) shown
    ), '[]'::jsonb);
  end if;

  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', t.id,
      'is_partner', (t.sponsor_user_id is not null and private.is_sponsor(t.sponsor_user_id)),
      'name', t.name,
      'blurb', t.blurb,
      'monogram', t.monogram,
      'logo_path', t.logo_path,
      'category_slug', t.category_slug
    ) order by t.sort_order, t.name)
    from public.trusted_partners t
    where t.published
      and t.is_demo = false
      and t.logo_path is not null
  ), '[]'::jsonb);
end;
$fn$;

revoke all on function private.list_trusted_partners_impl() from public, anon, authenticated, service_role;
revoke execute on function private.list_trusted_partners_impl() from public;
grant execute on function private.list_trusted_partners_impl() to anon, authenticated;
