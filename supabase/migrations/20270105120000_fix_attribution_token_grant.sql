-- Free-account signup inserts candidates as service_role.
-- The candidates check constraints call private.attribution_token(text).
-- 20261104120000 revoked execute from public, anon, and authenticated.
-- The function owner kept execute. service_role did not, so a new
-- address failed the check. GRANT is idempotent.
-- Live apply name: fix_attribution_token_grant. Code PM reconciles the stamp.
-- This file is not applied by the authoring agent.

do $grant$
begin
  if to_regprocedure('private.attribution_token(text)') is not null then
    execute 'grant execute on function private.attribution_token(text) to service_role';
  end if;
end
$grant$;
