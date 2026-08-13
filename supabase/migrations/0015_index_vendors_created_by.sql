-- =============================================================================
-- Migration 0015 — index vendors.created_by
-- =============================================================================
-- Follow-up from 0014: Supabase's advisor flagged vendors_created_by_fkey as
-- an unindexed foreign key immediately after that migration landed.
-- =============================================================================

create index if not exists idx_vendors_created_by on public.vendors (created_by);
