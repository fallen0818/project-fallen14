-- =============================================================================
-- Migration 0011 — dynamic status/priority/type fields
-- =============================================================================
-- Converts every remaining CHECK-constrained "workflow" enum that's reachable
-- from the CRUD UI into a user-managed list in the shared `lookup_options`
-- table (see 0010), same as funding_source/asset_category/procurement_category.
--
-- Two new lookup_options columns support this:
--   * tone        - drives badge color (success/warning/error/info/neutral)
--   * is_terminal - marks a status as workflow-finished, so app logic can
--                   check this flag instead of hardcoding status literals
--
-- Out of scope (left as fixed CHECK-constrained enums, by explicit decision):
--   * profiles.role                       - unused anywhere in the app today
--   * asset_request_approvals.decision    - no CRUD editor exists for this table
--   * milestone_deliverables.status       - no CRUD editor exists for this table
--
-- Converted (10 tables, 17 fields -> 17 new lists):
--   capex_budgets.period/status, asset_requests.priority/status,
--   procurement_items.status, bidding_schedule_activities.status,
--   purchase_requisitions.status, vendor_biddings.status,
--   purchase_orders.status, project_charters.status, milestones.status,
--   risk_issue_log.type/category/probability/impact/severity/status
--
-- Idempotent: safe to re-run.
-- =============================================================================

-- ----------------------------------------------------------------------------
-- 1. lookup_options: add tone + is_terminal
-- ----------------------------------------------------------------------------
alter table public.lookup_options
  add column if not exists tone text,
  add column if not exists is_terminal boolean not null default false;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'lookup_options_tone_check'
  ) then
    alter table public.lookup_options
      add constraint lookup_options_tone_check
      check (tone in ('success', 'warning', 'error', 'info', 'neutral'));
  end if;
end $$;

-- ----------------------------------------------------------------------------
-- 2. Seed the 17 new lists
-- ----------------------------------------------------------------------------
do $$
declare
  owner uuid := (select id from auth.users order by created_at asc limit 1);
begin
  if owner is null then
    return;
  end if;

  insert into public.lookup_options (list_key, code, value, tone, is_terminal, owner_id)
  select v.list_key, v.code, v.value, v.tone, v.is_terminal, owner
  from (values
    -- budget_period (no badge -> no tone)
    ('budget_period', 'BPER-0001', 'FY', null, false),
    ('budget_period', 'BPER-0002', 'Q1', null, false),
    ('budget_period', 'BPER-0003', 'Q2', null, false),
    ('budget_period', 'BPER-0004', 'Q3', null, false),
    ('budget_period', 'BPER-0005', 'Q4', null, false),

    -- budget_status
    ('budget_status', 'BSTA-0001', 'Draft', 'neutral', false),
    ('budget_status', 'BSTA-0002', 'Proposed', 'info', false),
    ('budget_status', 'BSTA-0003', 'Approved', 'success', false),
    ('budget_status', 'BSTA-0004', 'Locked', 'warning', false),
    ('budget_status', 'BSTA-0005', 'Closed', 'neutral', true),

    -- asset_request_priority
    ('asset_request_priority', 'ARPR-0001', 'Low', 'neutral', false),
    ('asset_request_priority', 'ARPR-0002', 'Medium', 'info', false),
    ('asset_request_priority', 'ARPR-0003', 'High', 'warning', false),
    ('asset_request_priority', 'ARPR-0004', 'Critical', 'error', false),

    -- asset_request_status
    ('asset_request_status', 'ARST-0001', 'Draft', 'neutral', false),
    ('asset_request_status', 'ARST-0002', 'Submitted', 'info', false),
    ('asset_request_status', 'ARST-0003', 'Under Review', 'warning', false),
    ('asset_request_status', 'ARST-0004', 'Approved', 'success', false),
    ('asset_request_status', 'ARST-0005', 'Rejected', 'error', true),
    ('asset_request_status', 'ARST-0006', 'Cancelled', 'error', true),
    ('asset_request_status', 'ARST-0007', 'Procured', 'success', true),

    -- procurement_item_status
    ('procurement_item_status', 'PIST-0001', 'Identified', 'neutral', false),
    ('procurement_item_status', 'PIST-0002', 'Requisitioned', 'info', false),
    ('procurement_item_status', 'PIST-0003', 'Sourcing', 'info', false),
    ('procurement_item_status', 'PIST-0004', 'Ordered', 'warning', false),
    ('procurement_item_status', 'PIST-0005', 'Received', 'success', true),
    ('procurement_item_status', 'PIST-0006', 'Cancelled', 'error', true),

    -- bidding_activity_status (BAST-0001 = default for new activities)
    ('bidding_activity_status', 'BAST-0001', 'Pending', 'neutral', false),
    ('bidding_activity_status', 'BAST-0002', 'In Progress', 'info', false),
    ('bidding_activity_status', 'BAST-0003', 'Completed', 'success', true),
    ('bidding_activity_status', 'BAST-0004', 'Delayed', 'warning', false),
    ('bidding_activity_status', 'BAST-0005', 'Cancelled', 'error', true),

    -- requisition_status
    ('requisition_status', 'RQST-0001', 'Draft', 'neutral', false),
    ('requisition_status', 'RQST-0002', 'Submitted', 'info', false),
    ('requisition_status', 'RQST-0003', 'Approved', 'success', false),
    ('requisition_status', 'RQST-0004', 'Rejected', 'error', true),
    ('requisition_status', 'RQST-0005', 'Converted to RFQ', 'info', true),
    ('requisition_status', 'RQST-0006', 'Closed', 'neutral', true),

    -- rfq_status
    ('rfq_status', 'RFST-0001', 'Open', 'info', false),
    ('rfq_status', 'RFST-0002', 'Closed', 'neutral', true),
    ('rfq_status', 'RFST-0003', 'Under Evaluation', 'warning', false),
    ('rfq_status', 'RFST-0004', 'Awarded', 'success', true),
    ('rfq_status', 'RFST-0005', 'Cancelled', 'error', true),

    -- purchase_order_status
    ('purchase_order_status', 'POST-0001', 'Issued', 'info', false),
    ('purchase_order_status', 'POST-0002', 'Acknowledged', 'info', false),
    ('purchase_order_status', 'POST-0003', 'Partially Received', 'warning', false),
    ('purchase_order_status', 'POST-0004', 'Received', 'success', false),
    ('purchase_order_status', 'POST-0005', 'Invoiced', 'info', false),
    ('purchase_order_status', 'POST-0006', 'Paid', 'success', false),
    ('purchase_order_status', 'POST-0007', 'Closed', 'neutral', true),
    ('purchase_order_status', 'POST-0008', 'Cancelled', 'error', true),

    -- project_status
    ('project_status', 'PRST-0001', 'Proposed', 'neutral', false),
    ('project_status', 'PRST-0002', 'Chartered', 'info', false),
    ('project_status', 'PRST-0003', 'Active', 'info', false),
    ('project_status', 'PRST-0004', 'On Hold', 'warning', false),
    ('project_status', 'PRST-0005', 'Completed', 'success', true),
    ('project_status', 'PRST-0006', 'Cancelled', 'error', true),

    -- milestone_status
    ('milestone_status', 'MSST-0001', 'Not Started', 'neutral', false),
    ('milestone_status', 'MSST-0002', 'In Progress', 'info', false),
    ('milestone_status', 'MSST-0003', 'At Risk', 'warning', false),
    ('milestone_status', 'MSST-0004', 'Delayed', 'warning', false),
    ('milestone_status', 'MSST-0005', 'Completed', 'success', true),
    ('milestone_status', 'MSST-0006', 'Cancelled', 'error', true),

    -- risk_type
    ('risk_type', 'RTYP-0001', 'Risk', 'warning', false),
    ('risk_type', 'RTYP-0002', 'Issue', 'error', false),

    -- risk_category (no badge -> no tone)
    ('risk_category', 'RCAT-0001', 'Schedule', null, false),
    ('risk_category', 'RCAT-0002', 'Cost', null, false),
    ('risk_category', 'RCAT-0003', 'Scope', null, false),
    ('risk_category', 'RCAT-0004', 'Quality', null, false),
    ('risk_category', 'RCAT-0005', 'Resource', null, false),
    ('risk_category', 'RCAT-0006', 'Procurement', null, false),
    ('risk_category', 'RCAT-0007', 'Technical', null, false),
    ('risk_category', 'RCAT-0008', 'External', null, false),
    ('risk_category', 'RCAT-0009', 'Safety', null, false),

    -- risk_probability (no badge -> no tone)
    ('risk_probability', 'RPRB-0001', 'Rare', null, false),
    ('risk_probability', 'RPRB-0002', 'Unlikely', null, false),
    ('risk_probability', 'RPRB-0003', 'Possible', null, false),
    ('risk_probability', 'RPRB-0004', 'Likely', null, false),
    ('risk_probability', 'RPRB-0005', 'Almost Certain', null, false),

    -- risk_impact (no badge -> no tone)
    ('risk_impact', 'RIMP-0001', 'Negligible', null, false),
    ('risk_impact', 'RIMP-0002', 'Minor', null, false),
    ('risk_impact', 'RIMP-0003', 'Moderate', null, false),
    ('risk_impact', 'RIMP-0004', 'Major', null, false),
    ('risk_impact', 'RIMP-0005', 'Severe', null, false),

    -- risk_severity
    ('risk_severity', 'RSEV-0001', 'Low', 'neutral', false),
    ('risk_severity', 'RSEV-0002', 'Medium', 'info', false),
    ('risk_severity', 'RSEV-0003', 'High', 'warning', false),
    ('risk_severity', 'RSEV-0004', 'Critical', 'error', false),

    -- risk_status
    ('risk_status', 'RSTA-0001', 'Open', 'error', false),
    ('risk_status', 'RSTA-0002', 'Mitigating', 'warning', false),
    ('risk_status', 'RSTA-0003', 'Monitoring', 'info', false),
    ('risk_status', 'RSTA-0004', 'Escalated', 'error', false),
    ('risk_status', 'RSTA-0005', 'Resolved', 'success', true),
    ('risk_status', 'RSTA-0006', 'Closed', 'neutral', true)
  ) as v(list_key, code, value, tone, is_terminal)
  where not exists (
    select 1 from public.lookup_options lo
    where lo.list_key = v.list_key and lo.value = v.value
  )
  and not exists (
    select 1 from public.lookup_options lo where lo.code = v.code
  );
end $$;

-- ----------------------------------------------------------------------------
-- 3. capex_budgets.period -> period_id, status -> status_id
-- ----------------------------------------------------------------------------
alter table public.capex_budgets
  add column if not exists period_id uuid references public.lookup_options (id) on delete restrict,
  add column if not exists status_id uuid references public.lookup_options (id) on delete restrict;

do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'capex_budgets' and column_name = 'period'
  ) then
    update public.capex_budgets b
    set period_id = lo.id
    from public.lookup_options lo
    where lo.list_key = 'budget_period' and b.period_id is null and lo.value = b.period;

    update public.capex_budgets b
    set status_id = lo.id
    from public.lookup_options lo
    where lo.list_key = 'budget_status'
      and b.status_id is null
      and lo.value = case b.status
        when 'draft' then 'Draft'
        when 'proposed' then 'Proposed'
        when 'approved' then 'Approved'
        when 'locked' then 'Locked'
        when 'closed' then 'Closed'
      end;

    alter table public.capex_budgets drop constraint if exists capex_budgets_period_check;
    alter table public.capex_budgets drop constraint if exists capex_budgets_status_check;
    alter table public.capex_budgets drop column period;
    alter table public.capex_budgets drop column status;
  end if;
end $$;

alter table public.capex_budgets
  alter column period_id set not null,
  alter column status_id set not null;

create index if not exists idx_capex_budgets_period on public.capex_budgets (period_id);
create index if not exists idx_capex_budgets_status on public.capex_budgets (status_id);

-- ----------------------------------------------------------------------------
-- 4. asset_requests.priority -> priority_id, status -> status_id
-- ----------------------------------------------------------------------------
alter table public.asset_requests
  add column if not exists priority_id uuid references public.lookup_options (id) on delete set null,
  add column if not exists status_id uuid references public.lookup_options (id) on delete restrict;

do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'asset_requests' and column_name = 'priority'
  ) then
    update public.asset_requests r
    set priority_id = lo.id
    from public.lookup_options lo
    where lo.list_key = 'asset_request_priority'
      and r.priority_id is null
      and r.priority is not null
      and lo.value = case r.priority
        when 'low' then 'Low'
        when 'medium' then 'Medium'
        when 'high' then 'High'
        when 'critical' then 'Critical'
      end;

    update public.asset_requests r
    set status_id = lo.id
    from public.lookup_options lo
    where lo.list_key = 'asset_request_status'
      and r.status_id is null
      and lo.value = case r.status
        when 'draft' then 'Draft'
        when 'submitted' then 'Submitted'
        when 'under-review' then 'Under Review'
        when 'approved' then 'Approved'
        when 'rejected' then 'Rejected'
        when 'cancelled' then 'Cancelled'
        when 'procured' then 'Procured'
      end;

    alter table public.asset_requests drop constraint if exists asset_requests_priority_check;
    alter table public.asset_requests drop constraint if exists asset_requests_status_check;
    alter table public.asset_requests drop column priority;
    alter table public.asset_requests drop column status;
  end if;
end $$;

alter table public.asset_requests alter column status_id set not null;

create index if not exists idx_asset_requests_priority on public.asset_requests (priority_id);
create index if not exists idx_asset_requests_status on public.asset_requests (status_id);

-- ----------------------------------------------------------------------------
-- 5. procurement_items.status -> status_id
-- ----------------------------------------------------------------------------
alter table public.procurement_items
  add column if not exists status_id uuid references public.lookup_options (id) on delete restrict;

do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'procurement_items' and column_name = 'status'
  ) then
    update public.procurement_items p
    set status_id = lo.id
    from public.lookup_options lo
    where lo.list_key = 'procurement_item_status'
      and p.status_id is null
      and lo.value = case p.status
        when 'identified' then 'Identified'
        when 'requisitioned' then 'Requisitioned'
        when 'sourcing' then 'Sourcing'
        when 'ordered' then 'Ordered'
        when 'received' then 'Received'
        when 'cancelled' then 'Cancelled'
      end;

    alter table public.procurement_items drop constraint if exists procurement_items_status_check;
    alter table public.procurement_items drop column status;
  end if;
end $$;

alter table public.procurement_items alter column status_id set not null;
create index if not exists idx_proc_items_status on public.procurement_items (status_id);

-- ----------------------------------------------------------------------------
-- 6. bidding_schedule_activities.status -> status_id
-- ----------------------------------------------------------------------------
alter table public.bidding_schedule_activities
  add column if not exists status_id uuid references public.lookup_options (id) on delete restrict;

do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'bidding_schedule_activities' and column_name = 'status'
  ) then
    update public.bidding_schedule_activities a
    set status_id = lo.id
    from public.lookup_options lo
    where lo.list_key = 'bidding_activity_status'
      and a.status_id is null
      and lo.value = case a.status
        when 'pending' then 'Pending'
        when 'in-progress' then 'In Progress'
        when 'completed' then 'Completed'
        when 'delayed' then 'Delayed'
        when 'cancelled' then 'Cancelled'
      end;

    alter table public.bidding_schedule_activities drop constraint if exists bidding_schedule_activities_status_check;
    alter table public.bidding_schedule_activities drop column status;
  end if;
end $$;

-- No DB-level default: Postgres rejects a subquery in a column DEFAULT
-- expression ("cannot use subquery in DEFAULT expression"). The app resolves
-- and passes the "Pending" row's id explicitly on insert instead (see
-- createBiddingActivity() in src/services/biddingSchedule.ts).
alter table public.bidding_schedule_activities alter column status_id set not null;
create index if not exists idx_bsa_status on public.bidding_schedule_activities (status_id);

-- ----------------------------------------------------------------------------
-- 7. purchase_requisitions.status -> status_id
-- ----------------------------------------------------------------------------
alter table public.purchase_requisitions
  add column if not exists status_id uuid references public.lookup_options (id) on delete restrict;

do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'purchase_requisitions' and column_name = 'status'
  ) then
    update public.purchase_requisitions q
    set status_id = lo.id
    from public.lookup_options lo
    where lo.list_key = 'requisition_status'
      and q.status_id is null
      and lo.value = case q.status
        when 'draft' then 'Draft'
        when 'submitted' then 'Submitted'
        when 'approved' then 'Approved'
        when 'rejected' then 'Rejected'
        when 'converted-to-rfq' then 'Converted to RFQ'
        when 'closed' then 'Closed'
      end;

    alter table public.purchase_requisitions drop constraint if exists purchase_requisitions_status_check;
    alter table public.purchase_requisitions drop column status;
  end if;
end $$;

alter table public.purchase_requisitions alter column status_id set not null;
create index if not exists idx_purchase_requisitions_status on public.purchase_requisitions (status_id);

-- ----------------------------------------------------------------------------
-- 8. vendor_biddings.status -> status_id
-- ----------------------------------------------------------------------------
alter table public.vendor_biddings
  add column if not exists status_id uuid references public.lookup_options (id) on delete restrict;

do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'vendor_biddings' and column_name = 'status'
  ) then
    update public.vendor_biddings v
    set status_id = lo.id
    from public.lookup_options lo
    where lo.list_key = 'rfq_status'
      and v.status_id is null
      and lo.value = case v.status
        when 'open' then 'Open'
        when 'closed' then 'Closed'
        when 'under-evaluation' then 'Under Evaluation'
        when 'awarded' then 'Awarded'
        when 'cancelled' then 'Cancelled'
      end;

    alter table public.vendor_biddings drop constraint if exists vendor_biddings_status_check;
    alter table public.vendor_biddings drop column status;
  end if;
end $$;

alter table public.vendor_biddings alter column status_id set not null;
create index if not exists idx_vendor_biddings_status on public.vendor_biddings (status_id);

-- ----------------------------------------------------------------------------
-- 9. purchase_orders.status -> status_id
-- ----------------------------------------------------------------------------
alter table public.purchase_orders
  add column if not exists status_id uuid references public.lookup_options (id) on delete restrict;

do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'purchase_orders' and column_name = 'status'
  ) then
    update public.purchase_orders o
    set status_id = lo.id
    from public.lookup_options lo
    where lo.list_key = 'purchase_order_status'
      and o.status_id is null
      and lo.value = case o.status
        when 'issued' then 'Issued'
        when 'acknowledged' then 'Acknowledged'
        when 'partially-received' then 'Partially Received'
        when 'received' then 'Received'
        when 'invoiced' then 'Invoiced'
        when 'paid' then 'Paid'
        when 'closed' then 'Closed'
        when 'cancelled' then 'Cancelled'
      end;

    alter table public.purchase_orders drop constraint if exists purchase_orders_status_check;
    alter table public.purchase_orders drop column status;
  end if;
end $$;

alter table public.purchase_orders alter column status_id set not null;
create index if not exists idx_po_status on public.purchase_orders (status_id);

-- ----------------------------------------------------------------------------
-- 10. project_charters.status -> status_id
-- ----------------------------------------------------------------------------
alter table public.project_charters
  add column if not exists status_id uuid references public.lookup_options (id) on delete restrict;

do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'project_charters' and column_name = 'status'
  ) then
    update public.project_charters c
    set status_id = lo.id
    from public.lookup_options lo
    where lo.list_key = 'project_status'
      and c.status_id is null
      and lo.value = case c.status
        when 'proposed' then 'Proposed'
        when 'chartered' then 'Chartered'
        when 'active' then 'Active'
        when 'on-hold' then 'On Hold'
        when 'completed' then 'Completed'
        when 'cancelled' then 'Cancelled'
      end;

    alter table public.project_charters drop constraint if exists project_charters_status_check;
    alter table public.project_charters drop column status;
  end if;
end $$;

alter table public.project_charters alter column status_id set not null;
create index if not exists idx_project_charters_status on public.project_charters (status_id);

-- ----------------------------------------------------------------------------
-- 11. milestones.status -> status_id
-- ----------------------------------------------------------------------------
alter table public.milestones
  add column if not exists status_id uuid references public.lookup_options (id) on delete restrict;

do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'milestones' and column_name = 'status'
  ) then
    update public.milestones m
    set status_id = lo.id
    from public.lookup_options lo
    where lo.list_key = 'milestone_status'
      and m.status_id is null
      and lo.value = case m.status
        when 'not-started' then 'Not Started'
        when 'in-progress' then 'In Progress'
        when 'at-risk' then 'At Risk'
        when 'delayed' then 'Delayed'
        when 'completed' then 'Completed'
        when 'cancelled' then 'Cancelled'
      end;

    alter table public.milestones drop constraint if exists milestones_status_check;
    alter table public.milestones drop column status;
  end if;
end $$;

alter table public.milestones alter column status_id set not null;
create index if not exists idx_milestones_status on public.milestones (status_id);

-- ----------------------------------------------------------------------------
-- 12. risk_issue_log: type/category/probability/impact/severity/status -> *_id
-- ----------------------------------------------------------------------------
alter table public.risk_issue_log
  add column if not exists type_id uuid references public.lookup_options (id) on delete restrict,
  add column if not exists category_id uuid references public.lookup_options (id) on delete set null,
  add column if not exists probability_id uuid references public.lookup_options (id) on delete set null,
  add column if not exists impact_id uuid references public.lookup_options (id) on delete set null,
  add column if not exists severity_id uuid references public.lookup_options (id) on delete set null,
  add column if not exists status_id uuid references public.lookup_options (id) on delete restrict;

do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'risk_issue_log' and column_name = 'type'
  ) then
    update public.risk_issue_log r
    set type_id = lo.id
    from public.lookup_options lo
    where lo.list_key = 'risk_type'
      and r.type_id is null
      and lo.value = case r.type when 'risk' then 'Risk' when 'issue' then 'Issue' end;

    update public.risk_issue_log r
    set category_id = lo.id
    from public.lookup_options lo
    where lo.list_key = 'risk_category'
      and r.category_id is null
      and r.category is not null
      and lo.value = case r.category
        when 'schedule' then 'Schedule'
        when 'cost' then 'Cost'
        when 'scope' then 'Scope'
        when 'quality' then 'Quality'
        when 'resource' then 'Resource'
        when 'procurement' then 'Procurement'
        when 'technical' then 'Technical'
        when 'external' then 'External'
        when 'safety' then 'Safety'
      end;

    update public.risk_issue_log r
    set probability_id = lo.id
    from public.lookup_options lo
    where lo.list_key = 'risk_probability'
      and r.probability_id is null
      and r.probability is not null
      and lo.value = case r.probability
        when 'rare' then 'Rare'
        when 'unlikely' then 'Unlikely'
        when 'possible' then 'Possible'
        when 'likely' then 'Likely'
        when 'almost-certain' then 'Almost Certain'
      end;

    update public.risk_issue_log r
    set impact_id = lo.id
    from public.lookup_options lo
    where lo.list_key = 'risk_impact'
      and r.impact_id is null
      and r.impact is not null
      and lo.value = case r.impact
        when 'negligible' then 'Negligible'
        when 'minor' then 'Minor'
        when 'moderate' then 'Moderate'
        when 'major' then 'Major'
        when 'severe' then 'Severe'
      end;

    update public.risk_issue_log r
    set severity_id = lo.id
    from public.lookup_options lo
    where lo.list_key = 'risk_severity'
      and r.severity_id is null
      and r.severity is not null
      and lo.value = case r.severity
        when 'low' then 'Low'
        when 'medium' then 'Medium'
        when 'high' then 'High'
        when 'critical' then 'Critical'
      end;

    update public.risk_issue_log r
    set status_id = lo.id
    from public.lookup_options lo
    where lo.list_key = 'risk_status'
      and r.status_id is null
      and lo.value = case r.status
        when 'open' then 'Open'
        when 'mitigating' then 'Mitigating'
        when 'monitoring' then 'Monitoring'
        when 'escalated' then 'Escalated'
        when 'resolved' then 'Resolved'
        when 'closed' then 'Closed'
      end;

    alter table public.risk_issue_log drop constraint if exists risk_issue_log_type_check;
    alter table public.risk_issue_log drop constraint if exists risk_issue_log_category_check;
    alter table public.risk_issue_log drop constraint if exists risk_issue_log_probability_check;
    alter table public.risk_issue_log drop constraint if exists risk_issue_log_impact_check;
    alter table public.risk_issue_log drop constraint if exists risk_issue_log_severity_check;
    alter table public.risk_issue_log drop constraint if exists risk_issue_log_status_check;
    alter table public.risk_issue_log drop column type;
    alter table public.risk_issue_log drop column category;
    alter table public.risk_issue_log drop column probability;
    alter table public.risk_issue_log drop column impact;
    alter table public.risk_issue_log drop column severity;
    alter table public.risk_issue_log drop column status;
  end if;
end $$;

alter table public.risk_issue_log
  alter column type_id set not null,
  alter column status_id set not null;

create index if not exists idx_risk_type on public.risk_issue_log (type_id);
create index if not exists idx_risk_category on public.risk_issue_log (category_id);
create index if not exists idx_risk_probability on public.risk_issue_log (probability_id);
create index if not exists idx_risk_impact on public.risk_issue_log (impact_id);
create index if not exists idx_risk_severity on public.risk_issue_log (status_id);
create index if not exists idx_risk_status on public.risk_issue_log (status_id);
