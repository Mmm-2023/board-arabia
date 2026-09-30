-- Membership review. One migration for the checklist gate, the desk queue,
-- the founding number, and the tier on claim_founding_seat.
-- Candidates stay out of the founding count until Approved.
-- The private booking link is not stored in this file.

alter table public.members
  add column if not exists tier text not null default 'founding',
  add column if not exists founding_number smallint;

alter table public.members drop constraint if exists members_tier_check;
alter table public.members
  add constraint members_tier_check check (tier in ('founding', 'member'));

alter table public.members drop constraint if exists members_founding_number_check;
alter table public.members
  add constraint members_founding_number_check check (
    founding_number is null or founding_number between 1 and 100
  );

alter table public.members drop constraint if exists members_tier_number_check;
alter table public.members
  add constraint members_tier_number_check check (
    tier <> 'member' or founding_number is null
  );

create unique index if not exists members_founding_number_uidx
  on public.members (founding_number)
  where founding_number is not null;

grant select (founding_number, tier) on table public.members to authenticated;

alter table public.candidates
  add column if not exists needs_info_items text[],
  add column if not exists needs_info_question text,
  add column if not exists needs_info_reply text,
  add column if not exists needs_info_at timestamptz,
  add column if not exists decision_reason text,
  add column if not exists decision_note text,
  add column if not exists decided_at timestamptz,
  add column if not exists declined_until timestamptz,
  add column if not exists waitlist_revisit_at timestamptz,
  add column if not exists approved_at timestamptz,
  add column if not exists closed_reason text,
  add column if not exists review_seat text,
  add column if not exists review_tier text,
  add column if not exists linkedin_checked boolean not null default false,
  add column if not exists cr_checked boolean not null default false,
  add column if not exists capacity_verified boolean not null default false,
  add column if not exists state_changed_at timestamptz,
  add column if not exists consent_at timestamptz,
  add column if not exists checklist_reminded_at timestamptz;

alter table public.candidates drop constraint if exists candidates_needs_info_items_check;
alter table public.candidates
  add constraint candidates_needs_info_items_check check (
    needs_info_items is null or cardinality(needs_info_items) between 0 and 11
  );

alter table public.candidates drop constraint if exists candidates_needs_info_question_len;
alter table public.candidates
  add constraint candidates_needs_info_question_len check (
    needs_info_question is null or char_length(needs_info_question) <= 1000
  );

alter table public.candidates drop constraint if exists candidates_needs_info_reply_len;
alter table public.candidates
  add constraint candidates_needs_info_reply_len check (
    needs_info_reply is null or char_length(needs_info_reply) <= 2000
  );

alter table public.candidates drop constraint if exists candidates_decision_reason_check;
alter table public.candidates
  add constraint candidates_decision_reason_check check (
    decision_reason is null or decision_reason in (
      'fit', 'not_in_audience', 'not_enough_information', 'capacity', 'duplicate', 'spam'
    )
  );

alter table public.candidates drop constraint if exists candidates_decision_note_len;
alter table public.candidates
  add constraint candidates_decision_note_len check (
    decision_note is null or char_length(decision_note) <= 2000
  );

alter table public.candidates drop constraint if exists candidates_closed_reason_len;
alter table public.candidates
  add constraint candidates_closed_reason_len check (
    closed_reason is null or char_length(closed_reason) <= 80
  );

alter table public.candidates drop constraint if exists candidates_review_seat_check;
alter table public.candidates
  add constraint candidates_review_seat_check check (
    review_seat is null or review_seat in ('ksa', 'intl')
  );

alter table public.candidates drop constraint if exists candidates_review_tier_check;
alter table public.candidates
  add constraint candidates_review_tier_check check (
    review_tier is null or review_tier in ('founding', 'member')
  );

create index if not exists candidates_submitted_idx
  on public.candidates (submitted_at desc)
  where submitted_at is not null;

-- Member tier does not take a founding place. Existing rows default to founding.
create or replace function private.founding_counts()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if coalesce(auth.role(), '') is distinct from 'service_role' then
    if auth.uid() is null
       or (
         not exists (
           select 1 from public.members m
           where m.user_id = auth.uid()
             and m.status in ('invited', 'active')
         )
         and not private.is_staff()
       ) then
      raise exception 'not_allowed' using errcode = '42501';
    end if;
  end if;

  return (
    select jsonb_build_object(
      'ksa', count(*) filter (
        where seat = 'ksa' and status in ('invited', 'active') and is_demo = false and tier = 'founding'
      ),
      'intl', count(*) filter (
        where seat = 'intl' and status in ('invited', 'active') and is_demo = false and tier = 'founding'
      ),
      'ksa_cap', 50,
      'intl_cap', 50,
      'total_cap', 100
    )
    from public.members
  );
end;
$$;

revoke all on function private.founding_counts() from public, anon;
grant execute on function private.founding_counts() to authenticated, service_role;

create or replace function private.recompute_platform_stats()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  seat_n int;
  ksa_n int;
  intl_n int;
  invest_sum numeric;
  invest_n int;
  fo_sum numeric;
  fo_n int;
  turn_sum numeric;
  turn_n int;
begin
  select
    count(*) filter (where m.seat in ('ksa', 'intl'))::int,
    count(*) filter (where m.seat = 'ksa')::int,
    count(*) filter (where m.seat = 'intl')::int
  into seat_n, ksa_n, intl_n
  from public.members m
  where m.status in ('invited', 'active')
    and m.is_demo = false
    and m.tier = 'founding';

  select
    coalesce(sum(p.investable_capacity_usd), 0),
    count(*)::int
  into invest_sum, invest_n
  from public.members m
  join public.profiles p on p.user_id = m.user_id
  where m.status in ('invited', 'active')
    and m.is_demo = false
    and m.seat in ('ksa', 'intl')
    and p.capacity_verified
    and p.include_in_public_aggregates
    and p.investable_capacity_usd is not null
    and p.investable_capacity_usd > 0;

  select
    coalesce(sum(p.fo_aum_usd), 0),
    count(*)::int
  into fo_sum, fo_n
  from public.members m
  join public.profiles p on p.user_id = m.user_id
  where m.status in ('invited', 'active')
    and m.is_demo = false
    and m.seat in ('ksa', 'intl')
    and p.capacity_verified
    and p.include_in_public_aggregates
    and p.fo_aum_usd is not null
    and p.fo_aum_usd > 0;

  select
    coalesce(sum(p.turnover_usd), 0),
    count(*)::int
  into turn_sum, turn_n
  from public.members m
  join public.profiles p on p.user_id = m.user_id
  where m.status in ('invited', 'active')
    and m.is_demo = false
    and m.seat in ('ksa', 'intl')
    and p.capacity_verified
    and p.include_in_public_aggregates
    and p.turnover_usd is not null
    and p.turnover_usd > 0;

  insert into public.platform_stats (
    id,
    investment_capability_usd,
    fo_aum_usd,
    turnover_usd,
    founding_admitted_count,
    founding_ksa_count,
    founding_intl_count,
    contributors_investment_n,
    contributors_fo_n,
    contributors_turnover_n,
    updated_at
  ) values (
    1,
    private.round_public_usd(invest_sum, invest_n),
    private.round_public_usd(fo_sum, fo_n),
    private.round_public_usd(turn_sum, turn_n),
    seat_n,
    ksa_n,
    intl_n,
    invest_n,
    fo_n,
    turn_n,
    now()
  )
  on conflict (id) do update set
    investment_capability_usd = excluded.investment_capability_usd,
    fo_aum_usd = excluded.fo_aum_usd,
    turnover_usd = excluded.turnover_usd,
    founding_admitted_count = excluded.founding_admitted_count,
    founding_ksa_count = excluded.founding_ksa_count,
    founding_intl_count = excluded.founding_intl_count,
    contributors_investment_n = excluded.contributors_investment_n,
    contributors_fo_n = excluded.contributors_fo_n,
    contributors_turnover_n = excluded.contributors_turnover_n,
    updated_at = excluded.updated_at;
end;
$$;

revoke all on function private.recompute_platform_stats() from public, anon, authenticated;

drop function if exists public.claim_founding_seat(
  uuid, uuid, text, text, uuid, text, text, text, text, text, numeric, numeric, numeric, boolean, boolean
);

create function public.claim_founding_seat(
  p_user_id uuid,
  p_application_id uuid,
  p_email text,
  p_seat text,
  p_invited_by uuid,
  p_full_name text,
  p_phone text,
  p_linkedin_url text,
  p_company text,
  p_headline text,
  p_investable_capacity_usd numeric default null,
  p_fo_aum_usd numeric default null,
  p_turnover_usd numeric default null,
  p_include_in_public_aggregates boolean default true,
  p_capacity_verified boolean default false,
  p_tier text default 'founding',
  p_candidate boolean default false
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  taken int;
  next_no int;
  app_email text;
  app_status text;
  cand_email text;
  cand_state text;
  cand_invite uuid;
  investable numeric;
  fo_aum numeric;
  turnover numeric;
  member_status text;
  must_password boolean;
begin
  if auth.role() is distinct from 'service_role' then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  if p_seat not in ('ksa', 'intl') then
    raise exception 'invalid_seat' using errcode = '22023';
  end if;

  if p_tier not in ('founding', 'member') then
    raise exception 'invalid_tier' using errcode = '22023';
  end if;

  if p_user_id is null or p_invited_by is null then
    raise exception 'not_admissible' using errcode = '22023';
  end if;

  if p_candidate then
    if p_application_id is not null then
      raise exception 'not_admissible' using errcode = '22023';
    end if;
  elsif p_application_id is null then
    raise exception 'not_admissible' using errcode = '22023';
  end if;

  if p_email is null or char_length(trim(p_email)) < 3 then
    raise exception 'not_admissible' using errcode = '22023';
  end if;

  investable := private.assert_capacity_amount(p_investable_capacity_usd);
  fo_aum := private.assert_capacity_amount(p_fo_aum_usd);
  turnover := private.assert_capacity_amount(p_turnover_usd);

  perform pg_advisory_xact_lock(hashtext('board-arabia-seat-' || p_seat));
  if p_tier = 'founding' then
    perform pg_advisory_xact_lock(hashtext('board-arabia-founding-number'));
  end if;

  if p_candidate then
    select lower(trim(email)), request_state, invite_token_id
      into cand_email, cand_state, cand_invite
    from public.candidates
    where user_id = p_user_id
    for update;

    if cand_email is null
      or cand_email is distinct from lower(trim(p_email))
      or cand_state not in ('submitted', 'in_review', 'needs_info', 'review_call', 'waitlisted')
    then
      raise exception 'not_admissible' using errcode = '22023';
    end if;
    member_status := 'active';
    must_password := false;
  else
    select lower(trim(email)), status
      into app_email, app_status
    from public.applications
    where id = p_application_id
    for update;

    if app_email is null or app_status not in ('accepted', 'verified') then
      raise exception 'not_admissible' using errcode = '22023';
    end if;

    if app_email is distinct from lower(trim(p_email)) then
      raise exception 'not_admissible' using errcode = '22023';
    end if;
    member_status := 'invited';
    must_password := true;
    cand_invite := null;
  end if;

  if exists (
    select 1 from public.members m
    where m.user_id = p_user_id
      or (p_application_id is not null and m.application_id = p_application_id)
      or lower(m.email) = lower(trim(p_email))
  ) then
    raise exception 'already_member' using errcode = '23505';
  end if;

  next_no := null;
  if p_tier = 'founding' then
    select count(*) into taken
    from public.members
    where seat = p_seat
      and status in ('invited', 'active')
      and is_demo = false
      and tier = 'founding';

    if taken >= 50 then
      raise exception 'seat_full' using errcode = '23514';
    end if;

    select coalesce(max(founding_number), 0) + 1 into next_no
    from public.members
    where founding_number is not null;

    if next_no > 100 then
      raise exception 'founding_numbers_full' using errcode = '23514';
    end if;
  end if;

  insert into public.members (
    user_id, application_id, email, seat, status, must_set_password, invited_by,
    invites_granted, invites_remaining, is_demo, tier, founding_number
  ) values (
    p_user_id,
    p_application_id,
    lower(trim(p_email)),
    p_seat,
    member_status,
    must_password,
    p_invited_by,
    2,
    2,
    false,
    p_tier,
    next_no
  );

  insert into public.profiles (
    user_id,
    full_name,
    phone,
    linkedin_url,
    company,
    headline,
    investable_capacity_usd,
    fo_aum_usd,
    turnover_usd,
    capacity_currency,
    include_in_public_aggregates,
    capacity_verified
  ) values (
    p_user_id,
    nullif(left(trim(coalesce(p_full_name, '')), 200), ''),
    nullif(left(trim(coalesce(p_phone, '')), 40), ''),
    case
      when p_linkedin_url is not null and p_linkedin_url ~ '^https://' then left(p_linkedin_url, 500)
      else null
    end,
    nullif(left(trim(coalesce(p_company, '')), 200), ''),
    nullif(left(trim(coalesce(p_headline, '')), 160), ''),
    investable,
    fo_aum,
    turnover,
    'USD',
    coalesce(p_include_in_public_aggregates, true),
    coalesce(p_capacity_verified, false)
  );

  if p_candidate then
    update public.candidates
    set request_state = 'approved',
        approved_at = now(),
        decided_at = now(),
        review_seat = p_seat,
        review_tier = p_tier,
        state_changed_at = now(),
        owner = coalesce(owner, p_invited_by),
        capacity_verified = coalesce(p_capacity_verified, false),
        updated_at = now()
    where user_id = p_user_id
      and request_state in ('submitted', 'in_review', 'needs_info', 'review_call', 'waitlisted');

    if not found then
      raise exception 'not_admissible' using errcode = '22023';
    end if;

    update public.member_invites
    set status = 'admitted'
    where id = cand_invite
      and status in ('pending', 'opened', 'applied', 'accepted');
  else
    update public.applications
    set status = 'admitted',
        founding_seat = p_seat,
        member_user_id = p_user_id,
        admitted_at = now(),
        admitted_by = p_invited_by,
        updated_at = now()
    where id = p_application_id
      and status in ('accepted', 'verified');

    if not found then
      raise exception 'not_admissible' using errcode = '22023';
    end if;

    update public.member_invites
    set status = 'admitted'
    where id = (
      select a.invite_token_id
      from public.applications a
      where a.id = p_application_id
    )
      and status in ('pending', 'opened', 'applied', 'accepted');
  end if;
end;
$$;

revoke all on function public.claim_founding_seat(
  uuid, uuid, text, text, uuid, text, text, text, text, text, numeric, numeric, numeric, boolean, boolean, text, boolean
) from public, anon, authenticated;
grant execute on function public.claim_founding_seat(
  uuid, uuid, text, text, uuid, text, text, text, text, text, numeric, numeric, numeric, boolean, boolean, text, boolean
) to service_role;

create or replace function private.checklist_complete(c public.candidates, step text)
returns boolean
language sql
immutable
as $$
  select case step
    when 'role' then c.role in ('chairperson', 'board_member', 'c_suite', 'other')
    when 'company_title' then nullif(btrim(coalesce(c.company_name, '')), '') is not null
      and nullif(btrim(coalesce(c.job_title, '')), '') is not null
    when 'linkedin' then coalesce(c.linkedin_url, '') ~* '^https://(www\.)?linkedin\.com/in/[a-z0-9_%-]{3,100}/?$'
    when 'scale_band' then (
      (c.scale_kind = 'turnover' and c.scale_band in (
        't_under_10m', 't_10m_to_50m', 't_50m_to_250m', 't_250m_to_1bn', 't_over_1bn'
      ))
      or (c.scale_kind = 'aum' and c.scale_band in (
        'a_under_50m', 'a_50m_to_250m', 'a_250m_to_1bn', 'a_over_1bn'
      ))
    )
    when 'sectors' then coalesce(cardinality(c.sector_tags), 0) + coalesce(cardinality(c.vision_tags), 0) between 1 and 5
    when 'statement' then char_length(btrim(coalesce(c.statement, ''))) between 200 and 600
    when 'cr_number' then (
      coalesce(c.cr_number, '') ~ '^[0-9]{10}$'
      or (
        char_length(btrim(coalesce(c.cr_country, ''))) between 2 and 80
        and coalesce(c.cr_number, '') ~ '^[A-Za-z0-9-]{3,40}$'
      )
    )
    when 'referral' then nullif(btrim(coalesce(c.referral_name, '')), '') is not null
      or c.invited_by_member_id is not null
    when 'capacity' then c.investable_capacity_usd is not null
    when 'phone' then char_length(btrim(coalesce(c.phone, ''))) between 8 and 40
    else false
  end;
$$;

revoke all on function private.checklist_complete(public.candidates, text) from public, anon, authenticated;

create or replace function private.log_checklist_delta()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  step text;
  item text;
  steps text[] := array[
    'role', 'company_title', 'linkedin', 'scale_band', 'sectors', 'statement',
    'cr_number', 'referral', 'capacity', 'phone'
  ];
  required text[] := array['role', 'company_title', 'linkedin', 'scale_band', 'sectors', 'statement'];
  done_now int := 0;
  done_before int := 0;
begin
  foreach step in array steps loop
    if private.checklist_complete(new, step)
      and (tg_op = 'INSERT' or not private.checklist_complete(old, step))
    then
      insert into public.candidate_events (candidate_user_id, kind, detail, actor_id)
      values (
        new.user_id,
        'checklist_step',
        jsonb_build_object('step', step, 'required', step = any (required)),
        auth.uid()
      );
    end if;
  end loop;

  if new.email_verified_at is not null then
    done_now := 1;
  end if;
  if tg_op = 'UPDATE' and old.email_verified_at is not null then
    done_before := 1;
  end if;
  foreach item in array required loop
    if private.checklist_complete(new, item) then
      done_now := done_now + 1;
    end if;
    if tg_op = 'UPDATE' and private.checklist_complete(old, item) then
      done_before := done_before + 1;
    end if;
  end loop;
  if done_before < 7 and done_now >= 7 then
    insert into public.candidate_events (candidate_user_id, kind, detail, actor_id)
    values (
      new.user_id,
      'checklist_complete',
      jsonb_build_object('steps_done', 7),
      auth.uid()
    );
  end if;
  return new;
end;
$$;

revoke all on function private.log_checklist_delta() from public, anon, authenticated;

drop trigger if exists candidates_log_checklist on public.candidates;
create trigger candidates_log_checklist
  after insert or update on public.candidates
  for each row execute function private.log_checklist_delta();

create or replace function public.submit_candidate_request(p_user_id uuid, p_consent boolean)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  row public.candidates%rowtype;
  ready boolean;
begin
  if auth.role() is distinct from 'service_role' then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  select * into row from public.candidates where user_id = p_user_id for update;
  if row.user_id is null then
    return 'missing';
  end if;
  if p_consent is distinct from true then
    return 'consent';
  end if;
  if row.request_state = 'declined' then
    if row.declined_until is not null and row.declined_until > now() then
      return 'cooling';
    end if;
  elsif row.request_state is distinct from 'open' then
    return 'locked';
  end if;

  ready := row.email_verified_at is not null
    and private.checklist_complete(row, 'role')
    and private.checklist_complete(row, 'company_title')
    and private.checklist_complete(row, 'linkedin')
    and private.checklist_complete(row, 'scale_band')
    and private.checklist_complete(row, 'sectors')
    and private.checklist_complete(row, 'statement');
  if not ready then
    return 'incomplete';
  end if;

  update public.candidates
  set request_state = 'submitted',
      submitted_at = now(),
      consent_at = now(),
      state_changed_at = now(),
      declined_until = null,
      decision_note = null,
      updated_at = now()
  where user_id = p_user_id;

  insert into public.candidate_events (candidate_user_id, kind, detail, actor_id)
  values (p_user_id, 'request_submitted', jsonb_build_object('steps_done', 7), p_user_id);
  return 'ok';
end;
$$;

revoke all on function public.submit_candidate_request(uuid, boolean) from public, anon, authenticated;
grant execute on function public.submit_candidate_request(uuid, boolean) to service_role;

create or replace function public.transition_candidate(
  p_user_id uuid,
  p_actor uuid,
  p_to text,
  p_reason text default null,
  p_note text default null,
  p_items text[] default null,
  p_question text default null,
  p_seat text default null,
  p_tier text default null,
  p_capacity_verified boolean default false
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  row public.candidates%rowtype;
  allowed boolean;
  number int;
  note text;
begin
  if auth.role() is distinct from 'service_role' then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if p_actor is null then
    return jsonb_build_object('status', 'forbidden');
  end if;

  select * into row from public.candidates where user_id = p_user_id for update;
  if row.user_id is null then
    return jsonb_build_object('status', 'missing');
  end if;

  allowed := case row.request_state
    when 'submitted' then p_to = 'in_review'
    when 'in_review' then p_to in ('needs_info', 'review_call', 'waitlisted', 'approved', 'declined', 'closed')
    when 'needs_info' then p_to in ('in_review', 'closed')
    when 'review_call' then p_to in ('in_review', 'approved', 'declined', 'waitlisted')
    when 'waitlisted' then p_to in ('in_review', 'approved', 'declined')
    else false
  end;
  if not allowed then
    return jsonb_build_object('status', 'blocked', 'from', row.request_state);
  end if;

  note := nullif(left(btrim(coalesce(p_note, '')), 2000), '');

  if p_to = 'needs_info' then
    if p_question is null or char_length(btrim(p_question)) < 3 or char_length(p_question) > 1000 then
      return jsonb_build_object('status', 'question_required');
    end if;
    if p_items is null or cardinality(p_items) < 1 then
      return jsonb_build_object('status', 'items_required');
    end if;
  end if;

  if p_to in ('declined', 'closed') then
    if p_reason is null or p_reason not in (
      'fit', 'not_in_audience', 'not_enough_information', 'capacity', 'duplicate', 'spam'
    ) then
      return jsonb_build_object('status', 'reason_required');
    end if;
  end if;

  if p_to = 'approved' then
    if p_seat not in ('ksa', 'intl') then
      return jsonb_build_object('status', 'invalid_seat');
    end if;
    if p_tier not in ('founding', 'member') then
      return jsonb_build_object('status', 'invalid_tier');
    end if;
    perform public.claim_founding_seat(
      p_user_id,
      null,
      row.email,
      p_seat,
      p_actor,
      row.full_name,
      row.phone,
      row.linkedin_url,
      row.company_name,
      row.job_title,
      row.investable_capacity_usd,
      null,
      null,
      coalesce(row.include_in_public_aggregates, false),
      coalesce(p_capacity_verified, false),
      p_tier,
      true
    );
    update public.candidates
    set decision_reason = coalesce(p_reason, 'fit'),
        decision_note = note,
        capacity_verified = coalesce(p_capacity_verified, false)
    where user_id = p_user_id;
    select founding_number into number from public.members where user_id = p_user_id;
    insert into public.candidate_events (candidate_user_id, kind, detail, actor_id)
    values (
      p_user_id,
      'state_change',
      jsonb_build_object('from', row.request_state, 'to', 'approved', 'reason', coalesce(p_reason, 'fit'), 'tier', p_tier, 'seat', p_seat),
      p_actor
    );
    return jsonb_build_object(
      'status', 'ok',
      'founding_number', number,
      'tier', p_tier,
      'seat', p_seat,
      'analytics_id', row.analytics_id,
      'submitted_at', row.submitted_at,
      'email_verified_at', row.email_verified_at
    );
  end if;

  update public.candidates
  set request_state = p_to,
      state_changed_at = now(),
      owner = case when p_to = 'in_review' then coalesce(owner, p_actor) else owner end,
      needs_info_question = case when p_to = 'needs_info' then btrim(p_question) else needs_info_question end,
      needs_info_items = case when p_to = 'needs_info' then p_items else needs_info_items end,
      needs_info_at = case when p_to = 'needs_info' then now() else needs_info_at end,
      decision_reason = case when p_to in ('declined', 'closed') then p_reason else decision_reason end,
      decision_note = case when p_to in ('declined', 'closed', 'waitlisted') then note else decision_note end,
      decided_at = case when p_to in ('declined', 'closed', 'waitlisted') then now() else decided_at end,
      declined_until = case when p_to = 'declined' then now() + interval '180 days' else declined_until end,
      waitlist_revisit_at = case when p_to = 'waitlisted' then now() + interval '30 days' else waitlist_revisit_at end,
      closed_reason = case when p_to = 'closed' then p_reason else closed_reason end,
      updated_at = now()
  where user_id = p_user_id;

  insert into public.candidate_events (candidate_user_id, kind, detail, actor_id)
  values (
    p_user_id,
    'state_change',
    jsonb_build_object('from', row.request_state, 'to', p_to, 'reason', p_reason),
    p_actor
  );

  return jsonb_build_object('status', 'ok', 'to', p_to);
end;
$$;

revoke all on function public.transition_candidate(uuid, uuid, text, text, text, text[], text, text, text, boolean)
  from public, anon, authenticated;
grant execute on function public.transition_candidate(uuid, uuid, text, text, text, text[], text, text, text, boolean)
  to service_role;

create or replace function public.reply_candidate_needs_info(p_user_id uuid, p_patch jsonb)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  row public.candidates%rowtype;
  items text[];
begin
  if auth.role() is distinct from 'service_role' then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if p_patch is null or jsonb_typeof(p_patch) <> 'object' then
    return 'invalid';
  end if;

  select * into row from public.candidates where user_id = p_user_id for update;
  if row.user_id is null or row.request_state is distinct from 'needs_info' then
    return 'locked';
  end if;
  items := coalesce(row.needs_info_items, array[]::text[]);

  update public.candidates
  set
    role = case when 'role' = any (items) and p_patch ? 'role' then left(p_patch->>'role', 40) else role end,
    board_seats = case when 'role' = any (items) and p_patch ? 'board_seats' then left(p_patch->>'board_seats', 1000) else board_seats end,
    company_name = case when 'company_title' = any (items) and p_patch ? 'company_name' then left(p_patch->>'company_name', 200) else company_name end,
    job_title = case when 'company_title' = any (items) and p_patch ? 'job_title' then left(p_patch->>'job_title', 200) else job_title end,
    company_website = case when 'company_title' = any (items) and p_patch ? 'company_website' then nullif(left(p_patch->>'company_website', 500), '') else company_website end,
    linkedin_url = case when 'linkedin' = any (items) and p_patch ? 'linkedin_url' then nullif(left(p_patch->>'linkedin_url', 500), '') else linkedin_url end,
    scale_kind = case when 'scale_band' = any (items) and p_patch ? 'scale_kind' then left(p_patch->>'scale_kind', 20) else scale_kind end,
    scale_band = case when 'scale_band' = any (items) and p_patch ? 'scale_band' then left(p_patch->>'scale_band', 80) else scale_band end,
    statement = case when 'statement' = any (items) and p_patch ? 'statement' then left(p_patch->>'statement', 600) else statement end,
    cr_number = case when 'cr_number' = any (items) and p_patch ? 'cr_number' then left(p_patch->>'cr_number', 40) else cr_number end,
    cr_country = case when 'cr_number' = any (items) and p_patch ? 'cr_country' then left(p_patch->>'cr_country', 80) else cr_country end,
    referral_name = case when 'referral' = any (items) and p_patch ? 'referral_name' then left(p_patch->>'referral_name', 200) else referral_name end,
    phone = case when 'phone' = any (items) and p_patch ? 'phone' then left(p_patch->>'phone', 40) else phone end,
    sector_tags = case
      when 'sectors' = any (items) and p_patch ? 'sector_tags' and jsonb_typeof(p_patch->'sector_tags') = 'array'
        then (
          select coalesce(array_agg(left(item, 80)), array[]::text[])
          from jsonb_array_elements_text(p_patch->'sector_tags') as item
        )
      else sector_tags
    end,
    vision_tags = case
      when 'sectors' = any (items) and p_patch ? 'vision_tags' and jsonb_typeof(p_patch->'vision_tags') = 'array'
        then (
          select coalesce(array_agg(left(item, 80)), array[]::text[])
          from jsonb_array_elements_text(p_patch->'vision_tags') as item
        )
      else vision_tags
    end,
    investable_capacity_usd = case
      when 'capacity' = any (items) and p_patch ? 'investable_capacity_usd'
        then nullif(p_patch->>'investable_capacity_usd', '')::numeric
      else investable_capacity_usd
    end,
    include_in_public_aggregates = case
      when 'capacity' = any (items) and p_patch ? 'include_in_public_aggregates'
        then (p_patch->>'include_in_public_aggregates')::boolean
      else include_in_public_aggregates
    end,
    needs_info_reply = left(coalesce(p_patch->>'reply', ''), 2000),
    request_state = 'in_review',
    state_changed_at = now(),
    updated_at = now()
  where user_id = p_user_id;

  insert into public.candidate_events (candidate_user_id, kind, detail, actor_id)
  values (p_user_id, 'state_change', jsonb_build_object('from', 'needs_info', 'to', 'in_review'), p_user_id);
  return 'ok';
end;
$$;

revoke all on function public.reply_candidate_needs_info(uuid, jsonb) from public, anon, authenticated;
grant execute on function public.reply_candidate_needs_info(uuid, jsonb) to service_role;
