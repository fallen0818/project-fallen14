-- =============================================================================
-- Migration 0004 — standardize audit timestamps across all top-level entities
-- =============================================================================
-- Adds updated_at (and created_at where missing) to every top-level table and
-- wires them all to the set_updated_at() trigger, so each record tracks when it
-- was created and last changed.
--
-- Idempotent and self-contained: safe to run whether or not 0003 was applied.
-- Fixes:
--   * procurement_items UPDATE error (42703: no field "updated_at")
--   * financial_tracking list ordering (previously ordered by a missing
--     created_at column).
-- =============================================================================

-- 1. Add missing audit columns.
alter table public.approval_matrices     add column if not exists updated_at timestamptz not null default now();
alter table public.procurement_items     add column if not exists updated_at timestamptz not null default now();
alter table public.purchase_requisitions add column if not exists updated_at timestamptz not null default now();
alter table public.vendor_biddings       add column if not exists updated_at timestamptz not null default now();
alter table public.purchase_orders       add column if not exists updated_at timestamptz not null default now();
alter table public.risk_issue_log        add column if not exists updated_at timestamptz not null default now();

-- financial_tracking previously had only recorded_at.
alter table public.financial_tracking    add column if not exists created_at timestamptz not null default now();
alter table public.financial_tracking    add column if not exists updated_at timestamptz not null default now();

-- 2. (Re)create the updated_at trigger for every top-level entity.
do $$
declare t text;
begin
  foreach t in array array[
    'profiles','capex_budgets','approval_matrices','asset_requests',
    'procurement_items','purchase_requisitions','vendor_biddings',
    'purchase_orders','project_charters','milestones','financial_tracking',
    'risk_issue_log'
  ] loop
    execute format('drop trigger if exists trg_%s_updated_at on public.%I;', t, t);
    execute format('create trigger trg_%s_updated_at before update on public.%I
                    for each row execute function public.set_updated_at();', t, t);
  end loop;
end $$;
