-- Corrects a transcription slip in migration 0011: idx_risk_severity was
-- accidentally created on status_id instead of severity_id.
drop index if exists public.idx_risk_severity;
create index if not exists idx_risk_severity on public.risk_issue_log (severity_id);