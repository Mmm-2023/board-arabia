-- Name the member typed for a peer invite. Visible to that member and to staff.
-- lookup_member_invite keeps returning only valid, state, and inviter_label.

alter table public.member_invites
  add column if not exists recipient_name text;

alter table public.member_invites
  drop constraint if exists member_invites_recipient_name_shape;

alter table public.member_invites
  add constraint member_invites_recipient_name_shape
  check (
    recipient_name is null
    or (
      char_length(recipient_name) between 1 and 80
      and recipient_name = btrim(recipient_name)
      and recipient_name !~ '[[:cntrl:]]'
    )
  );

comment on column public.member_invites.recipient_name is
  'Name the member typed for their own sent list. Not returned by lookup_member_invite.';
