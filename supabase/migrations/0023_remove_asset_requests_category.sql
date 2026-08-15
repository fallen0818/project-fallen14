-- =============================================================================
-- Migration 0023 — remove redundant asset_requests.asset_category_id
-- =============================================================================
-- An Asset Request already belongs to exactly one Capex Budget (budget_id,
-- required, see migration 0001), and that Budget carries its own Category
-- (capex_budgets.category_id, migration 0010 §4 -- same lookup_options list,
-- 'asset_category'). Requiring a second, independently-chosen Category on
-- the Asset Request itself just duplicated that taxonomy at two levels of
-- the hierarchy, so it's dropped here.
--
-- Leaves the `asset_category` lookup_options list and its rows untouched --
-- still in active use by capex_budgets.category_id.
--
-- Idempotent: safe to re-run.
-- =============================================================================

drop index if exists public.idx_asset_requests_category;

alter table public.asset_requests
  drop constraint if exists asset_requests_asset_category_id_fkey;

alter table public.asset_requests
  drop column if exists asset_category_id;
