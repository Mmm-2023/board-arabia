-- RLS initplan. Rewrite the 17 policies whose expressions call auth uid per row
-- so each call is the scalar subquery (select auth.uid()). Names, commands,
-- roles, and access logic stay the same. Supabase applies this file as one
-- transaction. The authoring agent does not apply it and does not run db push.
--
-- public.trusted_partners is unchanged. It has no policies. RLS is already
-- enabled and forced, and reads go through list_trusted_partners().
-- public.member_intro_desk_audits is unchanged. It has one policy,
-- member_intro_desk_audits_select_staff, which calls private.is_staff()
-- and does not call auth uid.
--
-- majlis_events_insert_own_pending is the text from
-- 20261202120000_majlis_rsvp_calendar.sql, the latest create. That version
-- added created_by_staff is null on top of 20260926103000_majlis_rsvp.sql.
--
-- staff_users_select_own is not in an earlier migration. The live expression
-- is user_id equals the caller id, for select to authenticated. This file
-- adopts that policy so the repo owns it, with the same scalar subquery.

drop policy if exists members_select_own on public.members;
create policy members_select_own on public.members
  for select to authenticated
  using (user_id = (select auth.uid()));

drop policy if exists members_clear_password_flag on public.members;
create policy members_clear_password_flag on public.members
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()) and must_set_password = false);

drop policy if exists profiles_select_own on public.profiles;
create policy profiles_select_own on public.profiles
  for select to authenticated
  using (user_id = (select auth.uid()));

drop policy if exists profiles_update_own on public.profiles;
create policy profiles_update_own on public.profiles
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (
    user_id = (select auth.uid())
    and (full_name is null or char_length(trim(full_name)) between 1 and 200)
    and (headline is null or char_length(headline) <= 160)
    and (company is null or char_length(company) <= 200)
    and (location is null or char_length(location) <= 120)
    and (bio is null or char_length(bio) <= 2000)
    and (phone is null or char_length(phone) <= 40)
    and (
      linkedin_url is null
      or (char_length(linkedin_url) <= 500 and linkedin_url ~ '^https://')
    )
  );

drop policy if exists member_invites_select_own on public.member_invites;
create policy member_invites_select_own on public.member_invites
  for select to authenticated
  using (inviter_member_id = (select auth.uid()));

drop policy if exists candidates_select_own on public.candidates;
create policy candidates_select_own on public.candidates
  for select to authenticated
  using (user_id = (select auth.uid()) or private.is_staff());

drop policy if exists candidates_update_own on public.candidates;
create policy candidates_update_own on public.candidates
  for update to authenticated
  using (user_id = (select auth.uid()) and request_state = 'open')
  with check (user_id = (select auth.uid()) and request_state = 'open');

drop policy if exists candidate_events_select on public.candidate_events;
create policy candidate_events_select on public.candidate_events
  for select to authenticated
  using (private.is_staff() or candidate_user_id = (select auth.uid()));

drop policy if exists candidate_notes_staff on public.candidate_notes;
create policy candidate_notes_staff on public.candidate_notes
  for all to authenticated
  using (private.is_staff())
  with check (private.is_staff() and author_id = (select auth.uid()));

drop policy if exists intro_suggestions_select_own on public.intro_suggestions;
create policy intro_suggestions_select_own
  on public.intro_suggestions
  for select to authenticated
  using (member_id = (select auth.uid()));

drop policy if exists intro_meet_outcomes_select_own on public.intro_meet_outcomes;
create policy intro_meet_outcomes_select_own
  on public.intro_meet_outcomes
  for select to authenticated
  using (member_id = (select auth.uid()));

drop policy if exists re_appetite_select on public.re_appetite;
create policy re_appetite_select
  on public.re_appetite
  for select
  to authenticated
  using (member_id = (select auth.uid()) or private.is_staff());

drop policy if exists re_appetite_insert on public.re_appetite;
create policy re_appetite_insert
  on public.re_appetite
  for insert
  to authenticated
  with check (
    member_id = (select auth.uid())
    and exists (
      select 1
      from public.members m
      where m.user_id = (select auth.uid())
        and m.seat in ('ksa', 'intl')
        and m.status in ('invited', 'active')
    )
  );

drop policy if exists re_appetite_update on public.re_appetite;
create policy re_appetite_update
  on public.re_appetite
  for update
  to authenticated
  using (member_id = (select auth.uid()))
  with check (
    member_id = (select auth.uid())
    and exists (
      select 1
      from public.members m
      where m.user_id = (select auth.uid())
        and m.seat in ('ksa', 'intl')
        and m.status in ('invited', 'active')
    )
  );

drop policy if exists majlis_events_insert_own_pending on public.majlis_events;
create policy majlis_events_insert_own_pending on public.majlis_events
  for insert to authenticated
  with check (
    host_member_id = (select auth.uid())
    and created_by_staff is null
    and status = 'pending_approval'
    and approved_by is null
    and approved_at is null
    and rejection_feedback is null
    and admin_note is null
    and exists (
      select 1
      from public.members m
      where m.user_id = (select auth.uid())
        and m.status in ('invited', 'active')
        and m.seat <> 'sponsor'
    )
  );

drop policy if exists majlis_rsvps_select_own on public.majlis_rsvps;
create policy majlis_rsvps_select_own on public.majlis_rsvps
  for select to authenticated
  using (member_id = (select auth.uid()));

drop policy if exists staff_users_select_own on public.staff_users;
create policy staff_users_select_own on public.staff_users
  for select to authenticated
  using (user_id = (select auth.uid()));
