-- =============================================================================
-- SEED DATA — January to May 2026 (currency: PHP)
-- =============================================================================
-- Run in the Supabase SQL Editor AFTER schema.sql, and AFTER you have signed up
-- at least one account (rows are owned by the first auth.users record).
--
-- Safe to re-run: it clears the application tables first, then reinserts.
-- It does NOT touch auth.users or profiles.
-- =============================================================================

do $$
declare
  uid uuid;
begin
  select id into uid from auth.users order by created_at limit 1;
  if uid is null then
    raise exception 'No auth user found. Sign up in the app first, then re-run this seed.';
  end if;

  -- ---- clear existing application data (children first) --------------------
  delete from public.financial_tracking_pos;
  delete from public.financial_tracking;
  delete from public.milestone_dependencies;
  delete from public.milestone_deliverables;
  delete from public.risk_issue_log;
  delete from public.milestones;
  delete from public.project_charter_funding;
  delete from public.project_charter_objectives;
  delete from public.project_charters;
  delete from public.purchase_order_lines;
  delete from public.purchase_orders;
  delete from public.vendor_bid_line_quotes;
  delete from public.vendor_bids;
  delete from public.vendor_bidding_criteria;
  delete from public.vendor_biddings;
  delete from public.purchase_requisition_lines;
  delete from public.purchase_requisitions;
  delete from public.procurement_items;
  delete from public.asset_request_approvals;
  delete from public.asset_requests;
  delete from public.approval_matrix_levels;
  delete from public.approval_matrices;
  delete from public.capex_budgets;

  -- =========================================================================
  -- CAPEX PLAN
  -- =========================================================================
  insert into public.capex_budgets
    (code, fiscal_year, period, department, category, allocated_amount, committed_amount, spent_amount, currency, status, owner_id, notes, created_at) values
    ('CBUD-2026-0001', 2026, 'FY', 'IT',         'it-infrastructure',   5000000, 2600000,  450000, 'PHP', 'approved', uid, 'Network & datacenter modernization budget', '2026-01-08'),
    ('CBUD-2026-0002', 2026, 'FY', 'Facilities', 'facilities',          3000000, 1200000,  300000, 'PHP', 'approved', uid, 'HQ facilities improvement',                 '2026-01-10'),
    ('CBUD-2026-0003', 2026, 'Q1', 'Operations', 'machinery-equipment', 8000000, 3500000, 1200000, 'PHP', 'approved', uid, 'Warehouse mechanization',                   '2026-01-12'),
    ('CBUD-2026-0004', 2026, 'FY', 'Finance',    'software',            2000000,  800000,  200000, 'PHP', 'proposed', uid, 'ERP licensing & modules',                   '2026-02-03');

  insert into public.approval_matrices (code, name, description, currency, effective_from, owner_id, created_at) values
    ('APPX-0001', 'FY2026 Capex Authorization', 'Authorization thresholds for capital expenditure', 'PHP', '2026-01-01', uid, '2026-01-05');

  insert into public.approval_matrix_levels (matrix_id, level, approver_role, approver_title, min_amount, max_amount, requires_quorum, escalation_role) values
    ((select id from public.approval_matrices where code='APPX-0001'), 1, 'manager',  'Department Manager', 0,          250000,  1, 'director'),
    ((select id from public.approval_matrices where code='APPX-0001'), 2, 'director', 'Division Director',  250000.01,  2000000, 1, 'cfo'),
    ((select id from public.approval_matrices where code='APPX-0001'), 3, 'cfo',      'Chief Financial Officer', 2000000.01, null, 1, null);

  insert into public.asset_requests
    (code, budget_id, title, description, asset_category, estimated_cost, currency, justification, priority, requested_by, request_date, required_by_date, status, owner_id, created_at) values
    ('CAPEX-000001', (select id from public.capex_budgets where code='CBUD-2026-0001'), 'Core network switch refresh', 'Replace end-of-life datacenter switches', 'it-infrastructure', 1200000, 'PHP', 'Hardware out of vendor support in Q3',   'high',     'j.santos',    '2026-01-15', '2026-04-30', 'approved',     uid, '2026-01-15'),
    ('CAPEX-000002', (select id from public.capex_budgets where code='CBUD-2026-0001'), 'Data center UPS upgrade',     'Upgrade uninterruptible power supplies',  'it-infrastructure',  850000, 'PHP', 'Aging UPS units nearing capacity',        'medium',   'r.cruz',      '2026-01-22', '2026-05-15', 'approved',     uid, '2026-01-22'),
    ('CAPEX-000003', (select id from public.capex_budgets where code='CBUD-2026-0002'), 'HVAC replacement - HQ',       'Replace rooftop HVAC package units',      'facilities',        1500000, 'PHP', 'Frequent breakdowns, high energy cost',   'high',     'm.reyes',     '2026-02-05', '2026-05-30', 'approved',     uid, '2026-02-05'),
    ('CAPEX-000004', (select id from public.capex_budgets where code='CBUD-2026-0003'), 'Forklift fleet acquisition',  'Acquire electric forklifts for warehouse','machinery-equipment',3200000, 'PHP', 'Expand throughput capacity',              'critical', 'a.dela-cruz', '2026-02-18', '2026-05-20', 'submitted',    uid, '2026-02-18'),
    ('CAPEX-000005', (select id from public.capex_budgets where code='CBUD-2026-0004'), 'ERP module licensing',        'License procurement & finance modules',   'software',           950000, 'PHP', 'Automate procurement workflows',          'medium',   'l.garcia',    '2026-03-02', '2026-06-30', 'under-review', uid, '2026-03-02');

  insert into public.asset_request_approvals (asset_request_id, level, approver_id, approver_title, decision, comment, decided_at) values
    ((select id from public.asset_requests where code='CAPEX-000001'), 2, 'director-01', 'Division Director', 'approved', 'Aligned with modernization plan', '2026-01-18 10:20:00+08'),
    ((select id from public.asset_requests where code='CAPEX-000002'), 2, 'director-01', 'Division Director', 'approved', 'Approved within threshold',       '2026-01-25 09:15:00+08'),
    ((select id from public.asset_requests where code='CAPEX-000003'), 2, 'director-02', 'Division Director', 'approved', 'Facilities priority',             '2026-02-10 14:00:00+08');

  -- =========================================================================
  -- PROCUREMENT PLAN
  -- =========================================================================
  -- estimated_total_cost is a generated column (quantity * estimated_unit_cost) — do not insert it.
  insert into public.procurement_items
    (code, capex_request_id, description, category, quantity, unit_of_measure, estimated_unit_cost, currency, status, owner_id, created_at) values
    ('PRC-ITEM-000001', (select id from public.asset_requests where code='CAPEX-000001'), '48-port L3 managed switch', 'goods', 8, 'each', 135000, 'PHP', 'ordered',       uid, '2026-01-24'),
    ('PRC-ITEM-000002', (select id from public.asset_requests where code='CAPEX-000002'), '20kVA UPS unit',            'goods', 2, 'each', 380000, 'PHP', 'requisitioned', uid, '2026-01-30'),
    ('PRC-ITEM-000003', (select id from public.asset_requests where code='CAPEX-000003'), 'Rooftop HVAC package unit', 'goods', 3, 'each', 420000, 'PHP', 'sourcing',      uid, '2026-02-19'),
    ('PRC-ITEM-000004', (select id from public.asset_requests where code='CAPEX-000004'), 'Electric forklift 2.5T',    'goods', 4, 'each', 720000, 'PHP', 'identified',    uid, '2026-02-25');

  insert into public.purchase_requisitions
    (code, title, requested_by, department, requisition_date, required_by_date, estimated_total, currency, status, approved_by, owner_id, created_at) values
    ('PR-000001', 'Network hardware Q1', 'j.santos', 'IT',         '2026-01-25', '2026-03-31', 1080000, 'PHP', 'converted-to-rfq', 'director-01', uid, '2026-01-25'),
    ('PR-000002', 'UPS procurement',     'r.cruz',   'IT',         '2026-02-02', '2026-04-15',  760000, 'PHP', 'approved',         'director-01', uid, '2026-02-02'),
    ('PR-000003', 'HVAC sourcing',       'm.reyes',  'Facilities', '2026-02-20', '2026-05-10', 1260000, 'PHP', 'submitted',        null,          uid, '2026-02-20');

  insert into public.purchase_requisition_lines (requisition_id, procurement_item_id, quantity, estimated_unit_cost, notes) values
    ((select id from public.purchase_requisitions where code='PR-000001'), (select id from public.procurement_items where code='PRC-ITEM-000001'), 8, 135000, 'Include 3-year warranty'),
    ((select id from public.purchase_requisitions where code='PR-000002'), (select id from public.procurement_items where code='PRC-ITEM-000002'), 2, 380000, null),
    ((select id from public.purchase_requisitions where code='PR-000003'), (select id from public.procurement_items where code='PRC-ITEM-000003'), 3, 420000, 'Rooftop crane access required');

  insert into public.vendor_biddings (code, requisition_id, title, issue_date, close_date, currency, status, awarded_vendor_id, owner_id, created_at) values
    ('RFQ-000001', (select id from public.purchase_requisitions where code='PR-000001'), 'RFQ - Network switches', '2026-01-28', '2026-02-12', 'PHP', 'awarded',           'V-NETCORE', uid, '2026-01-28'),
    ('RFQ-000002', (select id from public.purchase_requisitions where code='PR-000002'), 'RFQ - UPS units',        '2026-02-05', '2026-02-20', 'PHP', 'under-evaluation',  null,        uid, '2026-02-05');

  insert into public.vendor_bidding_criteria (bidding_id, name, weight) values
    ((select id from public.vendor_biddings where code='RFQ-000001'), 'price', 0.6),
    ((select id from public.vendor_biddings where code='RFQ-000001'), 'lead-time', 0.2),
    ((select id from public.vendor_biddings where code='RFQ-000001'), 'warranty', 0.2);

  insert into public.vendor_bids (bidding_id, vendor_id, vendor_name, submitted_at, total_price, currency, lead_time_days, evaluation_score, compliant) values
    ((select id from public.vendor_biddings where code='RFQ-000001'), 'V-NETCORE',  'NetCore Solutions Inc', '2026-02-10 16:00:00+08', 1040000, 'PHP', 25, 89.5, true),
    ((select id from public.vendor_biddings where code='RFQ-000001'), 'V-DATALINK', 'DataLink Systems',      '2026-02-11 11:30:00+08', 1096000, 'PHP', 18, 82.0, true),
    ((select id from public.vendor_biddings where code='RFQ-000002'), 'V-POWERMAX', 'PowerMax Corp',         '2026-02-18 09:00:00+08',  748000, 'PHP', 30, 80.0, true);

  insert into public.vendor_bid_line_quotes (bid_id, procurement_item_id, unit_price) values
    ((select vb.id from public.vendor_bids vb join public.vendor_biddings b on b.id=vb.bidding_id where b.code='RFQ-000001' and vb.vendor_id='V-NETCORE'),  (select id from public.procurement_items where code='PRC-ITEM-000001'), 130000),
    ((select vb.id from public.vendor_bids vb join public.vendor_biddings b on b.id=vb.bidding_id where b.code='RFQ-000001' and vb.vendor_id='V-DATALINK'), (select id from public.procurement_items where code='PRC-ITEM-000001'), 137000);

  insert into public.purchase_orders
    (code, rfq_id, requisition_id, vendor_id, vendor_name, order_date, expected_delivery_date, subtotal, tax_amount, shipping_amount, total, currency, payment_terms, delivery_terms, status, owner_id, created_at) values
    ('PO-000001', (select id from public.vendor_biddings where code='RFQ-000001'), (select id from public.purchase_requisitions where code='PR-000001'), 'V-NETCORE', 'NetCore Solutions Inc', '2026-02-16', '2026-03-18', 1040000, 124800, 5000, 1169800, 'PHP', 'net-30', 'DDP', 'received', uid, '2026-02-16');

  -- line_total is a generated column (quantity * unit_price) — do not insert it.
  insert into public.purchase_order_lines (po_id, procurement_item_id, description, quantity, unit_price, received_quantity) values
    ((select id from public.purchase_orders where code='PO-000001'), (select id from public.procurement_items where code='PRC-ITEM-000001'), '48-port L3 managed switch', 8, 130000, 8);

  -- =========================================================================
  -- PROJECT MONITORING
  -- =========================================================================
  insert into public.project_charters
    (code, charter_version, title, description, sponsor, project_manager, scope, start_date, planned_end_date, baseline_budget, currency, status, owner_id, created_at) values
    ('PRJ-000001', 1, 'Datacenter Network Modernization', 'Refresh core switching and power', 'CIO - E. Villanueva', 'P. Aquino',   '{"inScope":["Core switching","UPS"],"outOfScope":["Edge wifi"]}', '2026-01-20', '2026-07-31', 2200000, 'PHP', 'active',    uid, '2026-01-20'),
    ('PRJ-000002', 1, 'HQ Facilities Upgrade',            'Replace HVAC and improve HQ',      'COO - F. Lim',        'G. Tan',      '{"inScope":["HVAC"]}',                                            '2026-02-10', '2026-08-15', 1600000, 'PHP', 'active',    uid, '2026-02-10'),
    ('PRJ-000003', 1, 'Warehouse Mechanization',          'Introduce electric forklift fleet','VP Ops - R. Bautista','S. Mendoza',  '{"inScope":["Forklifts"]}',                                       '2026-03-01', '2026-09-30', 3400000, 'PHP', 'chartered', uid, '2026-03-01');

  insert into public.project_charter_objectives (charter_id, objective, sort_order) values
    ((select id from public.project_charters where code='PRJ-000001'), 'Eliminate unsupported hardware', 0),
    ((select id from public.project_charters where code='PRJ-000001'), 'Improve east-west throughput',   1),
    ((select id from public.project_charters where code='PRJ-000002'), 'Reduce facility energy cost',    0),
    ((select id from public.project_charters where code='PRJ-000003'), 'Increase warehouse throughput',  0);

  insert into public.project_charter_funding (charter_id, asset_request_id) values
    ((select id from public.project_charters where code='PRJ-000001'), (select id from public.asset_requests where code='CAPEX-000001')),
    ((select id from public.project_charters where code='PRJ-000001'), (select id from public.asset_requests where code='CAPEX-000002')),
    ((select id from public.project_charters where code='PRJ-000002'), (select id from public.asset_requests where code='CAPEX-000003')),
    ((select id from public.project_charters where code='PRJ-000003'), (select id from public.asset_requests where code='CAPEX-000004'));

  insert into public.milestones
    (code, project_id, name, description, weight, planned_start, planned_end, actual_start, actual_end, physical_progress_percent, status, owner_id, created_at) values
    ('MS-000001', (select id from public.project_charters where code='PRJ-000001'), 'Hardware delivered & staged', 'Receive and stage switches/UPS', 0.30, '2026-01-20', '2026-03-20', '2026-01-25', '2026-03-18', 100, 'completed',   uid, '2026-01-20'),
    ('MS-000002', (select id from public.project_charters where code='PRJ-000001'), 'Core switch cutover',         'Migrate to new switches',        0.40, '2026-03-21', '2026-05-15', '2026-03-25', null,          60, 'in-progress', uid, '2026-03-21'),
    ('MS-000003', (select id from public.project_charters where code='PRJ-000001'), 'Decommission legacy',         'Retire old hardware',            0.30, '2026-05-16', '2026-07-31', null,          null,           0, 'not-started', uid, '2026-05-01'),
    ('MS-000004', (select id from public.project_charters where code='PRJ-000002'), 'HVAC procurement',            'Source and order HVAC units',    0.40, '2026-02-10', '2026-04-30', '2026-02-12', null,          45, 'in-progress', uid, '2026-02-10'),
    ('MS-000005', (select id from public.project_charters where code='PRJ-000002'), 'Installation & commissioning','Install and commission HVAC',    0.60, '2026-05-01', '2026-08-15', null,          null,           0, 'not-started', uid, '2026-05-01'),
    ('MS-000006', (select id from public.project_charters where code='PRJ-000003'), 'Vendor selection',            'Evaluate forklift vendors',      0.30, '2026-03-01', '2026-05-31', '2026-03-05', null,          30, 'at-risk',     uid, '2026-03-01');

  insert into public.milestone_deliverables (milestone_id, name, status, due_date, accepted_date) values
    ((select id from public.milestones where code='MS-000001'), 'Delivery receipt', 'accepted', '2026-03-18', '2026-03-19'),
    ((select id from public.milestones where code='MS-000001'), 'Staging report',   'accepted', '2026-03-20', '2026-03-20'),
    ((select id from public.milestones where code='MS-000002'), 'Cutover plan',     'in-progress', '2026-04-15', null),
    ((select id from public.milestones where code='MS-000004'), 'Vendor shortlist', 'submitted', '2026-04-10', null);

  insert into public.milestone_dependencies (milestone_id, depends_on_id) values
    ((select id from public.milestones where code='MS-000002'), (select id from public.milestones where code='MS-000001')),
    ((select id from public.milestones where code='MS-000003'), (select id from public.milestones where code='MS-000002'));

  -- cost_variance is a generated column (earned_value - actual_cost) — do not insert it.
  insert into public.financial_tracking
    (code, project_id, period, currency, planned_cost, committed_cost, actual_cost, earned_value, forecast_at_completion, recorded_by, owner_id, recorded_at) values
    ('FT-000001', (select id from public.project_charters where code='PRJ-000001'), '2026-01', 'PHP', 300000,       0,       0,  200000, 2250000, 'P. Aquino', uid, '2026-01-31 17:00:00+08'),
    ('FT-000002', (select id from public.project_charters where code='PRJ-000001'), '2026-02', 'PHP', 500000, 1169800,  200000,  700000, 2260000, 'P. Aquino', uid, '2026-02-28 17:00:00+08'),
    ('FT-000003', (select id from public.project_charters where code='PRJ-000001'), '2026-03', 'PHP', 600000, 1169800, 1169800, 1200000, 2280000, 'P. Aquino', uid, '2026-03-31 17:00:00+08'),
    ('FT-000004', (select id from public.project_charters where code='PRJ-000001'), '2026-04', 'PHP', 400000, 1169800, 1250000, 1500000, 2300000, 'P. Aquino', uid, '2026-04-30 17:00:00+08'),
    ('FT-000005', (select id from public.project_charters where code='PRJ-000001'), '2026-05', 'PHP', 400000, 1169800, 1400000, 1650000, 2320000, 'P. Aquino', uid, '2026-05-31 17:00:00+08'),
    ('FT-000006', (select id from public.project_charters where code='PRJ-000002'), '2026-02', 'PHP', 200000,       0,       0,  100000, 1620000, 'G. Tan',    uid, '2026-02-28 17:00:00+08'),
    ('FT-000007', (select id from public.project_charters where code='PRJ-000002'), '2026-03', 'PHP', 300000,       0,   80000,  250000, 1630000, 'G. Tan',    uid, '2026-03-31 17:00:00+08'),
    ('FT-000008', (select id from public.project_charters where code='PRJ-000002'), '2026-04', 'PHP', 350000,       0,  180000,  400000, 1640000, 'G. Tan',    uid, '2026-04-30 17:00:00+08'),
    ('FT-000009', (select id from public.project_charters where code='PRJ-000002'), '2026-05', 'PHP', 400000,       0,  260000,  520000, 1650000, 'G. Tan',    uid, '2026-05-31 17:00:00+08'),
    ('FT-000010', (select id from public.project_charters where code='PRJ-000003'), '2026-03', 'PHP', 250000,       0,       0,  120000, 3450000, 'S. Mendoza',uid, '2026-03-31 17:00:00+08'),
    ('FT-000011', (select id from public.project_charters where code='PRJ-000003'), '2026-04', 'PHP', 300000,       0,   50000,  300000, 3470000, 'S. Mendoza',uid, '2026-04-30 17:00:00+08'),
    ('FT-000012', (select id from public.project_charters where code='PRJ-000003'), '2026-05', 'PHP', 350000,       0,  120000,  450000, 3480000, 'S. Mendoza',uid, '2026-05-31 17:00:00+08');

  insert into public.financial_tracking_pos (tracking_id, purchase_order_id) values
    ((select id from public.financial_tracking where code='FT-000003'), (select id from public.purchase_orders where code='PO-000001')),
    ((select id from public.financial_tracking where code='FT-000004'), (select id from public.purchase_orders where code='PO-000001'));

  insert into public.risk_issue_log
    (code, project_id, type, title, description, category, probability, impact, severity, status, owner, mitigation_plan, contingency_plan, linked_milestone_id, raised_date, due_date, resolved_date, owner_id, created_at) values
    ('RISK-000001',  (select id from public.project_charters where code='PRJ-000001'), 'risk',  'Vendor lead time may slip', 'Chip shortage could delay switch delivery', 'procurement', 'possible', 'major',    'high',   'monitoring', 'P. Aquino',  'Hold backup vendor DataLink on standby', 'Expedite partial shipment', (select id from public.milestones where code='MS-000001'), '2026-01-30', '2026-03-20', null,         uid, '2026-01-30'),
    ('ISSUE-000001', (select id from public.project_charters where code='PRJ-000002'), 'issue', 'HVAC unit backorder',       'Preferred unit on 6-week backorder',        'schedule',    null,       'moderate', 'medium', 'open',       'G. Tan',     'Evaluate alternate model',               null,                        (select id from public.milestones where code='MS-000004'), '2026-03-05', '2026-04-10', null,         uid, '2026-03-05'),
    ('RISK-000002',  (select id from public.project_charters where code='PRJ-000003'), 'risk',  'Budget approval delay',     'Capex still in submitted status',           'cost',        'likely',   'major',    'high',   'escalated',  'S. Mendoza', 'Escalate to CFO for expedited review',   'Phase acquisition in two tranches', null,                                                                '2026-03-10', '2026-04-15', null,         uid, '2026-03-10'),
    ('RISK-000003',  (select id from public.project_charters where code='PRJ-000001'), 'risk',  'Cutover downtime risk',     'Migration window may exceed maintenance',   'technical',   'unlikely', 'severe',   'high',   'mitigating', 'P. Aquino',  'Run staged cutover with rollback plan',  'Extend maintenance window',         (select id from public.milestones where code='MS-000002'), '2026-04-02', '2026-05-15', null,         uid, '2026-04-02');

  raise notice 'Seed complete for owner %', uid;
end $$;
