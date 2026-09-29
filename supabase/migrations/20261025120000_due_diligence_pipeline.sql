-- Split due diligence into chained Edge steps. Not applied by the authoring agent.
-- Apply on project iirqbizwanyhgkhanntq after review, before redeploying
-- due-diligence-start, due-diligence-status, and due-diligence-step.
-- No new secret. The next step is called with SUPABASE_SERVICE_ROLE_KEY.

alter table public.due_diligence_jobs
  add column if not exists pipeline_step text not null default 'extract',
  add column if not exists step_claim uuid,
  add column if not exists pipeline jsonb not null default '{}'::jsonb;

alter table public.due_diligence_jobs
  drop constraint if exists due_diligence_jobs_pipeline_step_check;

alter table public.due_diligence_jobs
  add constraint due_diligence_jobs_pipeline_step_check check (
    pipeline_step in ('extract', 'scores', 'narrative', 'compose', 'done')
  );

alter table public.due_diligence_jobs
  drop constraint if exists due_diligence_jobs_pipeline_check;

alter table public.due_diligence_jobs
  add constraint due_diligence_jobs_pipeline_check check (
    jsonb_typeof(pipeline) = 'object'
    and octet_length(pipeline::text) <= 400000
  );
