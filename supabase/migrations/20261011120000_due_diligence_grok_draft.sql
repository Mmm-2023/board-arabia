-- Deck draft memo columns. Not applied by the authoring agent.
-- Apply on project iirqbizwanyhgkhanntq after review, before redeploying
-- due-diligence-start and due-diligence-status.
-- analysis_status stays draft. This is not a certified due diligence record.

alter table public.due_diligence_jobs
  add column if not exists model_id text,
  add column if not exists model_skip_reason text;

alter table public.due_diligence_jobs
  drop constraint if exists due_diligence_jobs_model_id_check;

alter table public.due_diligence_jobs
  add constraint due_diligence_jobs_model_id_check check (
    model_id is null
    or (
      char_length(model_id) between 1 and 80
      and model_id !~ '[[:cntrl:]]'
    )
  );

alter table public.due_diligence_jobs
  drop constraint if exists due_diligence_jobs_model_skip_reason_check;

alter table public.due_diligence_jobs
  add constraint due_diligence_jobs_model_skip_reason_check check (
    model_skip_reason is null
    or (
      char_length(model_skip_reason) between 1 and 160
      and model_skip_reason !~ '[[:cntrl:]]'
    )
  );

alter table public.due_diligence_reports
  add column if not exists analysis jsonb,
  add column if not exists analysis_status text not null default 'draft',
  add column if not exists model_id text,
  add column if not exists model_skip_reason text;

alter table public.due_diligence_reports
  drop constraint if exists due_diligence_reports_analysis_status_check;

alter table public.due_diligence_reports
  add constraint due_diligence_reports_analysis_status_check check (
    analysis_status = 'draft'
  );

alter table public.due_diligence_reports
  drop constraint if exists due_diligence_reports_analysis_check;

alter table public.due_diligence_reports
  add constraint due_diligence_reports_analysis_check check (
    analysis is null
    or (
      jsonb_typeof(analysis) = 'object'
      and octet_length(analysis::text) <= 65535
    )
  );

alter table public.due_diligence_reports
  drop constraint if exists due_diligence_reports_model_id_check;

alter table public.due_diligence_reports
  add constraint due_diligence_reports_model_id_check check (
    model_id is null
    or (
      char_length(model_id) between 1 and 80
      and model_id !~ '[[:cntrl:]]'
    )
  );

alter table public.due_diligence_reports
  drop constraint if exists due_diligence_reports_model_skip_reason_check;

alter table public.due_diligence_reports
  add constraint due_diligence_reports_model_skip_reason_check check (
    model_skip_reason is null
    or (
      char_length(model_skip_reason) between 1 and 160
      and model_skip_reason !~ '[[:cntrl:]]'
    )
  );
