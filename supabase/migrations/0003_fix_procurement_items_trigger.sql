-- =============================================================================
-- Migration 0003 — remove the invalid updated_at trigger on procurement_items
-- =============================================================================
-- procurement_items has no `updated_at` column, but it was mistakenly included
-- in the set_updated_at() trigger list. The BEFORE UPDATE trigger therefore
-- fails with: 42703 record "new" has no field "updated_at".
-- Dropping the trigger fixes UPDATE on procurement_items. (INSERT was unaffected.)
-- =============================================================================

drop trigger if exists trg_procurement_items_updated_at on public.procurement_items;
