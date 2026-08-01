-- =============================================================================
-- Migration 0002 — convert derived money columns to GENERATED (computed) columns
-- =============================================================================
-- Run this ONCE against a database already created with schema.sql.
-- Postgres cannot add a generation expression to an existing plain column, so
-- each column is dropped and re-added as GENERATED ALWAYS ... STORED. These are
-- pure derived values (no foreign keys reference them), so nothing else breaks;
-- values are recomputed automatically from their source columns.
-- =============================================================================

-- procurement_items.estimated_total_cost = quantity * estimated_unit_cost
alter table public.procurement_items drop column if exists estimated_total_cost;
alter table public.procurement_items
  add column estimated_total_cost numeric(18,2)
  generated always as (quantity * estimated_unit_cost) stored;

-- purchase_order_lines.line_total = quantity * unit_price
alter table public.purchase_order_lines drop column if exists line_total;
alter table public.purchase_order_lines
  add column line_total numeric(18,2)
  generated always as (quantity * unit_price) stored;

-- financial_tracking.cost_variance = earned_value - actual_cost
alter table public.financial_tracking drop column if exists cost_variance;
alter table public.financial_tracking
  add column cost_variance numeric(18,2)
  generated always as (earned_value - actual_cost) stored;
