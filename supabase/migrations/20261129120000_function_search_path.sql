-- Pin search_path on the eight private functions that had none.
-- 20261127120000 and 20261128120000 already set search_path on every function they create.
-- Bodies already schema-qualify private calls and otherwise use built-in functions only.
-- No behaviour change. Safe to run again.

alter function private.attribution_token(text) set search_path = '';
alter function private.checklist_complete(public.candidates, text) set search_path = '';
alter function private.marketing_is_paid(text) set search_path = '';
alter function private.marketing_channel_match(text, text) set search_path = '';
alter function private.marketing_bucket(integer) set search_path = '';
alter function private.membership_tier_catalog() set search_path = '';
alter function private.normalize_membership_tiers(text[]) set search_path = '';
alter function private.membership_tiers_valid(text[]) set search_path = '';
