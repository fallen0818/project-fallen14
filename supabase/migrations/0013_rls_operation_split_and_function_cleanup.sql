-- =============================================================================
-- Migration 0013 — split combined RLS policies per operation; auth initplan
-- fix; drop dead trigger function
-- =============================================================================
-- This closes three issues Supabase's own advisor (`get_advisors`) currently
-- flags on this project:
--
--   1. "Multiple Permissive Policies" (25 tables, WARN/performance) — every
--      write-scoped table has a `for all` policy that also covers SELECT,
--      stacked on top of the table's dedicated `_select` policy. Postgres
--      has to evaluate both permissive policies on every SELECT. Splitting
--      `for all` into insert/update/delete removes the overlap; the existing
--      `_select` policy is untouched and remains the only SELECT policy.
--
--   2. "Auth RLS Initialization Plan" (14 policies, WARN/performance) — the
--      12 owner-scoped top-level tables plus `profiles`' two self-service
--      policies call `auth.uid()` directly in `using`/`with check`, which
--      Postgres re-evaluates per row instead of once per query. Wrapping it
--      as `(select auth.uid())` lets the planner hoist it into an InitPlan.
--      (The 13 child-table policies that call `owns_*(...)` helper functions
--      are NOT touched here — their argument is a per-row column, so there's
--      no InitPlan to hoist regardless of wrapping, and the advisor doesn't
--      flag them.)
--
--   3. "Function Search Path Mutable" (2 functions) — `update_updated_at_column`
--      turns out to be unused by any trigger (confirmed via
--      information_schema.triggers before writing this migration); it's
--      dead code left over from an earlier draft, so it's dropped outright
--      rather than patched. `set_updated_at` (the one actually wired to all
--      18 `updated_at` triggers) gets `set search_path = public` added.
--
-- All changes are behavior-preserving: every `using`/`with check` expression
-- is copied verbatim from the policy it replaces, just split across
-- operations and/or wrapped in `(select ...)`. No RLS-visible access changes.
-- =============================================================================

-- ----------------------------------------------------------------------------
-- 1. set_updated_at: pin search_path; drop the unused duplicate
-- ----------------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop function if exists public.update_updated_at_column();

-- ----------------------------------------------------------------------------
-- 2. Owner-scoped top-level tables: split `for all` into insert/update/delete,
--    with auth.uid() wrapped as (select auth.uid()).
-- ----------------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array[
    'approval_matrices','asset_requests','capex_budgets','financial_tracking',
    'lookup_options','milestones','procurement_items','project_charters',
    'purchase_orders','purchase_requisitions','risk_issue_log','vendor_biddings'
  ] loop
    execute format('drop policy if exists %I on public.%I;', t || '_write_own', t);
    execute format('drop policy if exists %I on public.%I;', t || '_insert', t);
    execute format('drop policy if exists %I on public.%I;', t || '_update', t);
    execute format('drop policy if exists %I on public.%I;', t || '_delete', t);

    execute format(
      'create policy %I on public.%I for insert to authenticated
         with check (owner_id = (select auth.uid()));',
      t || '_insert', t);
    execute format(
      'create policy %I on public.%I for update to authenticated
         using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));',
      t || '_update', t);
    execute format(
      'create policy %I on public.%I for delete to authenticated
         using (owner_id = (select auth.uid()));',
      t || '_delete', t);
  end loop;
end $$;

-- ----------------------------------------------------------------------------
-- 3. profiles: re-optimize the existing self-service policies (already split
--    by operation, just needed the initplan wrap).
-- ----------------------------------------------------------------------------
drop policy if exists profiles_update_self on public.profiles;
create policy profiles_update_self on public.profiles for update
  to authenticated using ((select auth.uid()) = id) with check ((select auth.uid()) = id);

drop policy if exists profiles_insert_self on public.profiles;
create policy profiles_insert_self on public.profiles for insert
  to authenticated with check ((select auth.uid()) = id);

-- ----------------------------------------------------------------------------
-- 4. Child tables gated through owns_*() helpers: split `for all` into
--    insert/update/delete, same check expression in each.
-- ----------------------------------------------------------------------------
drop policy if exists aml_write on public.approval_matrix_levels;
create policy aml_insert on public.approval_matrix_levels for insert to authenticated
  with check (public.owns_approval_matrix(matrix_id));
create policy aml_update on public.approval_matrix_levels for update to authenticated
  using (public.owns_approval_matrix(matrix_id)) with check (public.owns_approval_matrix(matrix_id));
create policy aml_delete on public.approval_matrix_levels for delete to authenticated
  using (public.owns_approval_matrix(matrix_id));

drop policy if exists ara_write on public.asset_request_approvals;
create policy ara_insert on public.asset_request_approvals for insert to authenticated
  with check (public.owns_asset_request(asset_request_id));
create policy ara_update on public.asset_request_approvals for update to authenticated
  using (public.owns_asset_request(asset_request_id)) with check (public.owns_asset_request(asset_request_id));
create policy ara_delete on public.asset_request_approvals for delete to authenticated
  using (public.owns_asset_request(asset_request_id));

drop policy if exists bsa_write on public.bidding_schedule_activities;
create policy bsa_insert on public.bidding_schedule_activities for insert to authenticated
  with check (public.owns_procurement_item(procurement_item_id));
create policy bsa_update on public.bidding_schedule_activities for update to authenticated
  using (public.owns_procurement_item(procurement_item_id)) with check (public.owns_procurement_item(procurement_item_id));
create policy bsa_delete on public.bidding_schedule_activities for delete to authenticated
  using (public.owns_procurement_item(procurement_item_id));

drop policy if exists ftp_write on public.financial_tracking_pos;
create policy ftp_insert on public.financial_tracking_pos for insert to authenticated
  with check (public.owns_financial_tracking(tracking_id));
create policy ftp_update on public.financial_tracking_pos for update to authenticated
  using (public.owns_financial_tracking(tracking_id)) with check (public.owns_financial_tracking(tracking_id));
create policy ftp_delete on public.financial_tracking_pos for delete to authenticated
  using (public.owns_financial_tracking(tracking_id));

drop policy if exists md_write on public.milestone_deliverables;
create policy md_insert on public.milestone_deliverables for insert to authenticated
  with check (public.owns_milestone(milestone_id));
create policy md_update on public.milestone_deliverables for update to authenticated
  using (public.owns_milestone(milestone_id)) with check (public.owns_milestone(milestone_id));
create policy md_delete on public.milestone_deliverables for delete to authenticated
  using (public.owns_milestone(milestone_id));

drop policy if exists mdep_write on public.milestone_dependencies;
create policy mdep_insert on public.milestone_dependencies for insert to authenticated
  with check (public.owns_milestone(milestone_id));
create policy mdep_update on public.milestone_dependencies for update to authenticated
  using (public.owns_milestone(milestone_id)) with check (public.owns_milestone(milestone_id));
create policy mdep_delete on public.milestone_dependencies for delete to authenticated
  using (public.owns_milestone(milestone_id));

drop policy if exists pcf_write on public.project_charter_funding;
create policy pcf_insert on public.project_charter_funding for insert to authenticated
  with check (public.owns_project_charter(charter_id));
create policy pcf_update on public.project_charter_funding for update to authenticated
  using (public.owns_project_charter(charter_id)) with check (public.owns_project_charter(charter_id));
create policy pcf_delete on public.project_charter_funding for delete to authenticated
  using (public.owns_project_charter(charter_id));

drop policy if exists pco_write on public.project_charter_objectives;
create policy pco_insert on public.project_charter_objectives for insert to authenticated
  with check (public.owns_project_charter(charter_id));
create policy pco_update on public.project_charter_objectives for update to authenticated
  using (public.owns_project_charter(charter_id)) with check (public.owns_project_charter(charter_id));
create policy pco_delete on public.project_charter_objectives for delete to authenticated
  using (public.owns_project_charter(charter_id));

drop policy if exists pol_write on public.purchase_order_lines;
create policy pol_insert on public.purchase_order_lines for insert to authenticated
  with check (public.owns_purchase_order(po_id));
create policy pol_update on public.purchase_order_lines for update to authenticated
  using (public.owns_purchase_order(po_id)) with check (public.owns_purchase_order(po_id));
create policy pol_delete on public.purchase_order_lines for delete to authenticated
  using (public.owns_purchase_order(po_id));

drop policy if exists prl_write on public.purchase_requisition_lines;
create policy prl_insert on public.purchase_requisition_lines for insert to authenticated
  with check (public.owns_purchase_requisition(requisition_id));
create policy prl_update on public.purchase_requisition_lines for update to authenticated
  using (public.owns_purchase_requisition(requisition_id)) with check (public.owns_purchase_requisition(requisition_id));
create policy prl_delete on public.purchase_requisition_lines for delete to authenticated
  using (public.owns_purchase_requisition(requisition_id));

drop policy if exists vblq_write on public.vendor_bid_line_quotes;
create policy vblq_insert on public.vendor_bid_line_quotes for insert to authenticated
  with check (public.owns_vendor_bid(bid_id));
create policy vblq_update on public.vendor_bid_line_quotes for update to authenticated
  using (public.owns_vendor_bid(bid_id)) with check (public.owns_vendor_bid(bid_id));
create policy vblq_delete on public.vendor_bid_line_quotes for delete to authenticated
  using (public.owns_vendor_bid(bid_id));

drop policy if exists vbc_write on public.vendor_bidding_criteria;
create policy vbc_insert on public.vendor_bidding_criteria for insert to authenticated
  with check (public.owns_vendor_bidding(bidding_id));
create policy vbc_update on public.vendor_bidding_criteria for update to authenticated
  using (public.owns_vendor_bidding(bidding_id)) with check (public.owns_vendor_bidding(bidding_id));
create policy vbc_delete on public.vendor_bidding_criteria for delete to authenticated
  using (public.owns_vendor_bidding(bidding_id));

drop policy if exists vb_write on public.vendor_bids;
create policy vb_insert on public.vendor_bids for insert to authenticated
  with check (public.owns_vendor_bidding(bidding_id));
create policy vb_update on public.vendor_bids for update to authenticated
  using (public.owns_vendor_bidding(bidding_id)) with check (public.owns_vendor_bidding(bidding_id));
create policy vb_delete on public.vendor_bids for delete to authenticated
  using (public.owns_vendor_bidding(bidding_id));
