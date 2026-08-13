-- =============================================================================
-- Migration 0012 — project_charter_funding: wire to procurement_items
-- =============================================================================
-- project_charter_funding previously linked a project charter to the
-- asset_request(s) that fund it. Repoints it one level more precise: a
-- project typically only covers specific procurement items within a broader
-- asset request, so this now links charter <-> procurement_item instead —
-- same reasoning as bidding_schedule_activities being keyed off
-- procurement_items rather than asset_requests.
--
-- project_charter_funding has never had a UI (verified: zero rows live), so
-- there's no data to remap — this is a straight column swap, not a backfill.
-- Idempotent: safe to re-run.
-- =============================================================================

alter table public.project_charter_funding
  add column if not exists procurement_item_id uuid references public.procurement_items (id) on delete restrict;

do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'project_charter_funding' and column_name = 'asset_request_id'
  ) then
    -- No rows exist to remap (this table has never had a UI); if that ever
    -- changes, this will simply drop any unmapped rows' old column value
    -- along with the column itself below.
    alter table public.project_charter_funding drop constraint if exists project_charter_funding_pkey;
    alter table public.project_charter_funding drop constraint if exists project_charter_funding_asset_request_id_fkey;
    alter table public.project_charter_funding drop column asset_request_id;
  end if;
end $$;

alter table public.project_charter_funding alter column procurement_item_id set not null;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'project_charter_funding_pkey'
  ) then
    alter table public.project_charter_funding
      add constraint project_charter_funding_pkey primary key (charter_id, procurement_item_id);
  end if;
end $$;

drop index if exists public.idx_pcf_asset_request;
create index if not exists idx_pcf_procurement_item on public.project_charter_funding (procurement_item_id);
