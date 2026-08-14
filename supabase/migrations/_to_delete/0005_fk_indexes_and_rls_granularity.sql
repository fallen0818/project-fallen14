-- =============================================================================
-- Migration 0005 — foreign-key indexes + per-operation RLS policies
-- =============================================================================
-- Purely additive / behavior-preserving. Safe to run against a live database:
--   * No columns are dropped or renamed, no data changes.
--   * The RLS rewrite grants exactly the same access as before — every
--     combined `for all` policy is replaced by four policies (select already
--     existed separately) with identical `using`/`with check` expressions.
--     Splitting them makes each operation auditable on its own (you can read
--     the delete policy for a table and know exactly who can delete a row,
--     without mentally intersecting it with insert/update rules) and this is
--     also required groundwork for migration 0006, which needs an INSERT-only
--     policy on `vendors` that differs from its UPDATE policy.
--
-- Findings addressed:
--   1. 25 foreign-key columns had no supporting index (Postgres does not
--      index FKs automatically). Every FK is now indexed, so parent→child
--      lookups (e.g. "all lines on this PO") and cascade/restrict checks on
--      delete stay index-backed as the tables grow.
--   2. Composite primary keys on join tables (project_charter_funding,
--      milestone_dependencies, financial_tracking_pos) only index their
--      leading column. The trailing column (the "reverse" direction of the
--      join) had no index — added explicitly below.
--   3. RLS used one `for all` policy per table. Split into
--      select/insert/update/delete per skill guidance so each operation is
--      independently reviewable.
-- =============================================================================

-- ----------------------------------------------------------------------------
-- 1. Missing foreign-key indexes
-- ----------------------------------------------------------------------------

-- Capex Plan
create index if not exists idx_approval_matrices_owner       on public.approval_matrices (owner_id);
create index if not exists idx_approval_matrix_levels_matrix  on public.approval_matrix_levels (matrix_id);

-- Procurement
create index if not exists idx_procurement_items_owner        on public.procurement_items (owner_id);
create index if not exists idx_purchase_requisitions_owner    on public.purchase_requisitions (owner_id);
create index if not exists idx_prl_procurement_item            on public.purchase_requisition_lines (procurement_item_id);
create index if not exists idx_vendor_biddings_requisition     on public.vendor_biddings (requisition_id);
create index if not exists idx_vendor_biddings_owner           on public.vendor_biddings (owner_id);
create index if not exists idx_vendor_bidding_criteria_bidding on public.vendor_bidding_criteria (bidding_id);
create index if not exists idx_vendor_bids_bidding              on public.vendor_bids (bidding_id);
create index if not exists idx_vblq_bid                         on public.vendor_bid_line_quotes (bid_id);
create index if not exists idx_vblq_procurement_item             on public.vendor_bid_line_quotes (procurement_item_id);
create index if not exists idx_purchase_orders_requisition       on public.purchase_orders (requisition_id);
create index if not exists idx_purchase_orders_owner             on public.purchase_orders (owner_id);
create index if not exists idx_pol_procurement_item               on public.purchase_order_lines (procurement_item_id);

-- Project Monitoring
create index if not exists idx_project_charters_owner            on public.project_charters (owner_id);
create index if not exists idx_pco_charter                        on public.project_charter_objectives (charter_id);
create index if not exists idx_pcf_asset_request                  on public.project_charter_funding (asset_request_id);
create index if not exists idx_milestones_owner                   on public.milestones (owner_id);
create index if not exists idx_md_milestone                        on public.milestone_deliverables (milestone_id);
create index if not exists idx_mdep_depends_on                     on public.milestone_dependencies (depends_on_id);
create index if not exists idx_financial_tracking_project          on public.financial_tracking (project_id);
create index if not exists idx_financial_tracking_owner            on public.financial_tracking (owner_id);
create index if not exists idx_ftp_purchase_order                   on public.financial_tracking_pos (purchase_order_id);
create index if not exists idx_risk_issue_log_owner                 on public.risk_issue_log (owner_id);
create index if not exists idx_risk_issue_log_linked_milestone      on public.risk_issue_log (linked_milestone_id);

-- ----------------------------------------------------------------------------
-- 2. Split owner-scoped top-level `for all` policies into insert/update/delete
-- ----------------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array[
    'capex_budgets','approval_matrices','asset_requests','procurement_items',
    'purchase_requisitions','vendor_biddings','purchase_orders',
    'project_charters','milestones','financial_tracking','risk_issue_log'
  ] loop
    execute format('drop policy if exists %I on public.%I;', t || '_write_own', t);

    execute format(
      'create policy %I on public.%I for insert to authenticated
         with check (owner_id = auth.uid());',
      t || '_insert', t);

    execute format(
      'create policy %I on public.%I for update to authenticated
         using (owner_id = auth.uid()) with check (owner_id = auth.uid());',
      t || '_update', t);

    execute format(
      'create policy %I on public.%I for delete to authenticated
         using (owner_id = auth.uid());',
      t || '_delete', t);
  end loop;
end $$;

-- ----------------------------------------------------------------------------
-- 3. Split child-table `for all` policies (gated through parent owner)
-- ----------------------------------------------------------------------------

drop policy if exists aml_write on public.approval_matrix_levels;
create policy aml_insert on public.approval_matrix_levels for insert to authenticated
  with check (exists (select 1 from public.approval_matrices m where m.id = matrix_id and m.owner_id = auth.uid()));
create policy aml_update on public.approval_matrix_levels for update to authenticated
  using (exists (select 1 from public.approval_matrices m where m.id = matrix_id and m.owner_id = auth.uid()))
  with check (exists (select 1 from public.approval_matrices m where m.id = matrix_id and m.owner_id = auth.uid()));
create policy aml_delete on public.approval_matrix_levels for delete to authenticated
  using (exists (select 1 from public.approval_matrices m where m.id = matrix_id and m.owner_id = auth.uid()));

drop policy if exists ara_write on public.asset_request_approvals;
create policy ara_insert on public.asset_request_approvals for insert to authenticated
  with check (exists (select 1 from public.asset_requests r where r.id = asset_request_id and r.owner_id = auth.uid()));
create policy ara_update on public.asset_request_approvals for update to authenticated
  using (exists (select 1 from public.asset_requests r where r.id = asset_request_id and r.owner_id = auth.uid()))
  with check (exists (select 1 from public.asset_requests r where r.id = asset_request_id and r.owner_id = auth.uid()));
create policy ara_delete on public.asset_request_approvals for delete to authenticated
  using (exists (select 1 from public.asset_requests r where r.id = asset_request_id and r.owner_id = auth.uid()));

drop policy if exists prl_write on public.purchase_requisition_lines;
create policy prl_insert on public.purchase_requisition_lines for insert to authenticated
  with check (exists (select 1 from public.purchase_requisitions p where p.id = requisition_id and p.owner_id = auth.uid()));
create policy prl_update on public.purchase_requisition_lines for update to authenticated
  using (exists (select 1 from public.purchase_requisitions p where p.id = requisition_id and p.owner_id = auth.uid()))
  with check (exists (select 1 from public.purchase_requisitions p where p.id = requisition_id and p.owner_id = auth.uid()));
create policy prl_delete on public.purchase_requisition_lines for delete to authenticated
  using (exists (select 1 from public.purchase_requisitions p where p.id = requisition_id and p.owner_id = auth.uid()));

drop policy if exists vbc_write on public.vendor_bidding_criteria;
create policy vbc_insert on public.vendor_bidding_criteria for insert to authenticated
  with check (exists (select 1 from public.vendor_biddings b where b.id = bidding_id and b.owner_id = auth.uid()));
create policy vbc_update on public.vendor_bidding_criteria for update to authenticated
  using (exists (select 1 from public.vendor_biddings b where b.id = bidding_id and b.owner_id = auth.uid()))
  with check (exists (select 1 from public.vendor_biddings b where b.id = bidding_id and b.owner_id = auth.uid()));
create policy vbc_delete on public.vendor_bidding_criteria for delete to authenticated
  using (exists (select 1 from public.vendor_biddings b where b.id = bidding_id and b.owner_id = auth.uid()));

drop policy if exists vb_write on public.vendor_bids;
create policy vb_insert on public.vendor_bids for insert to authenticated
  with check (exists (select 1 from public.vendor_biddings b where b.id = bidding_id and b.owner_id = auth.uid()));
create policy vb_update on public.vendor_bids for update to authenticated
  using (exists (select 1 from public.vendor_biddings b where b.id = bidding_id and b.owner_id = auth.uid()))
  with check (exists (select 1 from public.vendor_biddings b where b.id = bidding_id and b.owner_id = auth.uid()));
create policy vb_delete on public.vendor_bids for delete to authenticated
  using (exists (select 1 from public.vendor_biddings b where b.id = bidding_id and b.owner_id = auth.uid()));

drop policy if exists vblq_write on public.vendor_bid_line_quotes;
create policy vblq_insert on public.vendor_bid_line_quotes for insert to authenticated
  with check (exists (select 1 from public.vendor_bids vb join public.vendor_biddings b on b.id = vb.bidding_id
                 where vb.id = bid_id and b.owner_id = auth.uid()));
create policy vblq_update on public.vendor_bid_line_quotes for update to authenticated
  using (exists (select 1 from public.vendor_bids vb join public.vendor_biddings b on b.id = vb.bidding_id
                 where vb.id = bid_id and b.owner_id = auth.uid()))
  with check (exists (select 1 from public.vendor_bids vb join public.vendor_biddings b on b.id = vb.bidding_id
                 where vb.id = bid_id and b.owner_id = auth.uid()));
create policy vblq_delete on public.vendor_bid_line_quotes for delete to authenticated
  using (exists (select 1 from public.vendor_bids vb join public.vendor_biddings b on b.id = vb.bidding_id
                 where vb.id = bid_id and b.owner_id = auth.uid()));

drop policy if exists pol_write on public.purchase_order_lines;
create policy pol_insert on public.purchase_order_lines for insert to authenticated
  with check (exists (select 1 from public.purchase_orders o where o.id = po_id and o.owner_id = auth.uid()));
create policy pol_update on public.purchase_order_lines for update to authenticated
  using (exists (select 1 from public.purchase_orders o where o.id = po_id and o.owner_id = auth.uid()))
  with check (exists (select 1 from public.purchase_orders o where o.id = po_id and o.owner_id = auth.uid()));
create policy pol_delete on public.purchase_order_lines for delete to authenticated
  using (exists (select 1 from public.purchase_orders o where o.id = po_id and o.owner_id = auth.uid()));

drop policy if exists pco_write on public.project_charter_objectives;
create policy pco_insert on public.project_charter_objectives for insert to authenticated
  with check (exists (select 1 from public.project_charters c where c.id = charter_id and c.owner_id = auth.uid()));
create policy pco_update on public.project_charter_objectives for update to authenticated
  using (exists (select 1 from public.project_charters c where c.id = charter_id and c.owner_id = auth.uid()))
  with check (exists (select 1 from public.project_charters c where c.id = charter_id and c.owner_id = auth.uid()));
create policy pco_delete on public.project_charter_objectives for delete to authenticated
  using (exists (select 1 from public.project_charters c where c.id = charter_id and c.owner_id = auth.uid()));

drop policy if exists pcf_write on public.project_charter_funding;
create policy pcf_insert on public.project_charter_funding for insert to authenticated
  with check (exists (select 1 from public.project_charters c where c.id = charter_id and c.owner_id = auth.uid()));
create policy pcf_update on public.project_charter_funding for update to authenticated
  using (exists (select 1 from public.project_charters c where c.id = charter_id and c.owner_id = auth.uid()))
  with check (exists (select 1 from public.project_charters c where c.id = charter_id and c.owner_id = auth.uid()));
create policy pcf_delete on public.project_charter_funding for delete to authenticated
  using (exists (select 1 from public.project_charters c where c.id = charter_id and c.owner_id = auth.uid()));

drop policy if exists md_write on public.milestone_deliverables;
create policy md_insert on public.milestone_deliverables for insert to authenticated
  with check (exists (select 1 from public.milestones m where m.id = milestone_id and m.owner_id = auth.uid()));
create policy md_update on public.milestone_deliverables for update to authenticated
  using (exists (select 1 from public.milestones m where m.id = milestone_id and m.owner_id = auth.uid()))
  with check (exists (select 1 from public.milestones m where m.id = milestone_id and m.owner_id = auth.uid()));
create policy md_delete on public.milestone_deliverables for delete to authenticated
  using (exists (select 1 from public.milestones m where m.id = milestone_id and m.owner_id = auth.uid()));

drop policy if exists mdep_write on public.milestone_dependencies;
create policy mdep_insert on public.milestone_dependencies for insert to authenticated
  with check (exists (select 1 from public.milestones m where m.id = milestone_id and m.owner_id = auth.uid()));
create policy mdep_update on public.milestone_dependencies for update to authenticated
  using (exists (select 1 from public.milestones m where m.id = milestone_id and m.owner_id = auth.uid()))
  with check (exists (select 1 from public.milestones m where m.id = milestone_id and m.owner_id = auth.uid()));
create policy mdep_delete on public.milestone_dependencies for delete to authenticated
  using (exists (select 1 from public.milestones m where m.id = milestone_id and m.owner_id = auth.uid()));

drop policy if exists ftp_write on public.financial_tracking_pos;
create policy ftp_insert on public.financial_tracking_pos for insert to authenticated
  with check (exists (select 1 from public.financial_tracking f where f.id = tracking_id and f.owner_id = auth.uid()));
create policy ftp_update on public.financial_tracking_pos for update to authenticated
  using (exists (select 1 from public.financial_tracking f where f.id = tracking_id and f.owner_id = auth.uid()))
  with check (exists (select 1 from public.financial_tracking f where f.id = tracking_id and f.owner_id = auth.uid()));
create policy ftp_delete on public.financial_tracking_pos for delete to authenticated
  using (exists (select 1 from public.financial_tracking f where f.id = tracking_id and f.owner_id = auth.uid()));
