-- =============================================================================
-- TEARDOWN — drop all application tables, RLS policies, triggers & functions
-- =============================================================================
-- Run in the Supabase SQL Editor to reset the schema created by schema.sql.
--
--   WARNING: this permanently deletes ALL data in these tables.
--
-- Notes:
--   * DROP TABLE ... CASCADE automatically removes each table's RLS policies,
--     triggers, indexes, constraints and any dependent foreign keys.
--   * The trigger on auth.users and the shared helper functions live outside
--     the app tables, so they are dropped explicitly.
--   * auth.users itself (Supabase-managed) is NOT touched.
-- =============================================================================

-- 1. Remove the signup trigger on the Supabase-managed auth.users table.
drop trigger if exists trg_on_auth_user_created on auth.users;

-- 2. Drop all application tables (CASCADE also drops their policies/triggers).
do $$
declare t text;
begin
  foreach t in array array[
    -- project-monitoring (children first, though CASCADE makes order moot)
    'financial_tracking_pos','financial_tracking',
    'milestone_dependencies','milestone_deliverables','milestones',
    'project_charter_funding','project_charter_objectives','project_charters',
    'risk_issue_log',
    -- procurement-plan
    'purchase_order_lines','purchase_orders',
    'vendor_bid_line_quotes','vendor_bids','vendor_bidding_criteria','vendor_biddings',
    'purchase_requisition_lines','purchase_requisitions',
    'procurement_items',
    -- capex-plan
    'asset_request_approvals','asset_requests',
    'approval_matrix_levels','approval_matrices',
    'capex_budgets',
    -- identity
    'profiles'
  ] loop
    execute format('drop table if exists public.%I cascade;', t);
  end loop;
end $$;

-- 3. Drop the shared helper functions.
drop function if exists public.handle_new_user() cascade;
drop function if exists public.set_updated_at() cascade;

-- (Optional) also remove helper functions from the earlier model, if present.
drop function if exists public.get_task_progress(uuid) cascade;
drop function if exists public.get_project_task_progress(uuid) cascade;

-- (Optional) drop tables from the earlier 5-table model, if they still exist.
drop table if exists public.subtasks cascade;
drop table if exists public.tasks cascade;
drop table if exists public.unit_distribution cascade;
drop table if exists public.project_funding_sources cascade;
drop table if exists public.projects cascade;

-- =============================================================================
-- Teardown complete. Re-run schema.sql to recreate everything from scratch.
-- =============================================================================
