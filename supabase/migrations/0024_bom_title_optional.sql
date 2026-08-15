-- =============================================================================
-- Migration 0024 — make bill_of_materials.title optional
-- =============================================================================
-- A BOM already links to exactly one Asset Request (asset_request_id,
-- required, migration 0019), which carries its own title. Requiring a
-- second title on the BOM itself is unnecessary -- make it optional, same
-- as bill_of_materials.notes/prepared_by already are.
--
-- Idempotent: safe to re-run.
-- =============================================================================

alter table public.bill_of_materials
  alter column title drop not null;
