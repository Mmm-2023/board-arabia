-- Compose may store ready when an analysis exists. Draft stays the default.
-- Ready is not a certified due diligence record.
-- Not applied by the authoring agent.
-- Apply on project iirqbizwanyhgkhanntq after review, BEFORE redeploying
-- due-diligence-start, due-diligence-status, and due-diligence-step.
-- A start deploy that writes ready fails the old check until this is applied.

alter table public.due_diligence_reports
  drop constraint if exists due_diligence_reports_analysis_status_check;

alter table public.due_diligence_reports
  add constraint due_diligence_reports_analysis_status_check check (
    analysis_status in ('draft', 'ready')
  );
