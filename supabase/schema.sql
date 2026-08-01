-- =============================================================================
-- CAPEX → PROCUREMENT → PROJECT MONITORING — CANONICAL DATABASE SCHEMA
-- PostgreSQL / Supabase. Run in the Supabase SQL Editor.
-- =============================================================================
-- This is the single source of truth for the application data model. It is the
-- relational realization of the JSON Schemas under /schema. Design rules:
--   * uuid surrogate primary keys; the human-readable coded IDs (e.g.
--     CAPEX-000042) are kept as UNIQUE "code" columns.
--   * Arrays in the JSON model (approval levels, bids, deliverables, funding
--     links, PO lines...) are normalized into child tables.
--   * Fixed vocabularies are enforced with CHECK constraints.
--   * RLS is the security boundary: reads require authentication; writes are
--     scoped to the owning user, directly or through the parent row.
-- =============================================================================

create extension if not exists "uuid-ossp";

-- ----------------------------------------------------------------------------
-- Shared helpers
-- ----------------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

-- =============================================================================
-- profiles (1:1 auth.users)
-- =============================================================================
create table if not exists public.profiles (
  id         uuid primary key references auth.users (id) on delete cascade,
  email      text,
  full_name  text,
  role       text not null default 'analyst'
             check (role in ('analyst', 'manager', 'approver', 'admin')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, email, full_name)
  values (new.id, new.email, coalesce(new.raw_user_meta_data ->> 'full_name', ''))
  on conflict (id) do nothing;
  return new;
end;
$$ language plpgsql security definer set search_path = public;

drop trigger if exists trg_on_auth_user_created on auth.users;
create trigger trg_on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- =============================================================================
-- CAPEX PLAN
-- =============================================================================

create table if not exists public.capex_budgets (
  id                uuid primary key default uuid_generate_v4(),
  code              text not null unique check (code ~ '^CBUD-[0-9]{4}-[0-9]{4}$'),
  fiscal_year       integer not null check (fiscal_year between 2000 and 2100),
  period            text not null check (period in ('FY', 'Q1', 'Q2', 'Q3', 'Q4')),
  department        text not null,
  category          text check (category in ('it-infrastructure','facilities','machinery-equipment','vehicles','software','research-development','other')),
  allocated_amount  numeric(18,2) not null check (allocated_amount >= 0),
  committed_amount  numeric(18,2) not null default 0 check (committed_amount >= 0),
  spent_amount      numeric(18,2) not null default 0 check (spent_amount >= 0),
  currency          char(3) not null check (currency ~ '^[A-Z]{3}$'),
  status            text not null default 'draft' check (status in ('draft','proposed','approved','locked','closed')),
  owner_id          uuid not null references auth.users (id) on delete cascade,
  notes             text,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);
create index if not exists idx_capex_budgets_owner on public.capex_budgets (owner_id);

create table if not exists public.approval_matrices (
  id             uuid primary key default uuid_generate_v4(),
  code           text not null unique check (code ~ '^APPX-[0-9]{4}$'),
  name           text,
  description    text,
  currency       char(3) not null check (currency ~ '^[A-Z]{3}$'),
  effective_from date not null,
  effective_to   date,
  owner_id       uuid not null references auth.users (id) on delete cascade,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

create table if not exists public.approval_matrix_levels (
  id              uuid primary key default uuid_generate_v4(),
  matrix_id       uuid not null references public.approval_matrices (id) on delete cascade,
  level           integer not null check (level >= 1),
  approver_role   text not null,
  approver_title  text,
  min_amount      numeric(18,2) not null check (min_amount >= 0),
  max_amount      numeric(18,2) check (max_amount >= 0),
  requires_quorum integer not null default 1 check (requires_quorum >= 1),
  escalation_role text,
  unique (matrix_id, level)
);

create table if not exists public.asset_requests (
  id               uuid primary key default uuid_generate_v4(),
  code             text not null unique check (code ~ '^CAPEX-[0-9]{6}$'),
  budget_id        uuid not null references public.capex_budgets (id) on delete restrict,
  title            text not null,
  description      text,
  asset_category   text not null check (asset_category in ('it-infrastructure','facilities','machinery-equipment','vehicles','software','research-development','other')),
  estimated_cost   numeric(18,2) not null check (estimated_cost >= 0),
  currency         char(3) not null check (currency ~ '^[A-Z]{3}$'),
  justification    text,
  priority         text not null default 'medium' check (priority in ('low','medium','high','critical')),
  requested_by     text not null,
  request_date     date not null,
  required_by_date date,
  status           text not null default 'draft' check (status in ('draft','submitted','under-review','approved','rejected','cancelled','procured')),
  owner_id         uuid not null references auth.users (id) on delete cascade,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
create index if not exists idx_asset_requests_budget on public.asset_requests (budget_id);
create index if not exists idx_asset_requests_owner  on public.asset_requests (owner_id);

create table if not exists public.asset_request_approvals (
  id               uuid primary key default uuid_generate_v4(),
  asset_request_id uuid not null references public.asset_requests (id) on delete cascade,
  level            integer not null check (level >= 1),
  approver_id      text not null,
  approver_title   text,
  decision         text not null check (decision in ('approved','rejected','delegated')),
  comment          text,
  decided_at       timestamptz not null default now()
);
create index if not exists idx_ara_request on public.asset_request_approvals (asset_request_id);

-- =============================================================================
-- PROCUREMENT PLAN
-- =============================================================================

create table if not exists public.procurement_items (
  id                   uuid primary key default uuid_generate_v4(),
  code                 text not null unique check (code ~ '^PRC-ITEM-[0-9]{6}$'),
  capex_request_id     uuid not null references public.asset_requests (id) on delete restrict,
  description          text not null,
  category             text not null check (category in ('goods','services','works','software-license','subscription')),
  quantity             numeric(18,3) not null check (quantity > 0),
  unit_of_measure      text not null,
  estimated_unit_cost  numeric(18,2) not null check (estimated_unit_cost >= 0),
  currency             char(3) not null check (currency ~ '^[A-Z]{3}$'),
  estimated_total_cost numeric(18,2) generated always as (quantity * estimated_unit_cost) stored,
  specifications       jsonb,
  preferred_vendor_id  text,
  status               text not null default 'identified' check (status in ('identified','requisitioned','sourcing','ordered','received','cancelled')),
  owner_id             uuid not null references auth.users (id) on delete cascade,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);
create index if not exists idx_proc_items_capex on public.procurement_items (capex_request_id);

create table if not exists public.purchase_requisitions (
  id               uuid primary key default uuid_generate_v4(),
  code             text not null unique check (code ~ '^PR-[0-9]{6}$'),
  title            text,
  requested_by     text not null,
  department       text not null,
  requisition_date date not null,
  required_by_date date,
  estimated_total  numeric(18,2) check (estimated_total >= 0),
  currency         char(3) not null check (currency ~ '^[A-Z]{3}$'),
  status           text not null default 'draft' check (status in ('draft','submitted','approved','rejected','converted-to-rfq','closed')),
  approved_by      text,
  owner_id         uuid not null references auth.users (id) on delete cascade,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create table if not exists public.purchase_requisition_lines (
  id                  uuid primary key default uuid_generate_v4(),
  requisition_id      uuid not null references public.purchase_requisitions (id) on delete cascade,
  procurement_item_id uuid not null references public.procurement_items (id) on delete restrict,
  quantity            numeric(18,3) not null check (quantity > 0),
  estimated_unit_cost numeric(18,2) check (estimated_unit_cost >= 0),
  notes               text
);
create index if not exists idx_prl_requisition on public.purchase_requisition_lines (requisition_id);

create table if not exists public.vendor_biddings (
  id                uuid primary key default uuid_generate_v4(),
  code              text not null unique check (code ~ '^RFQ-[0-9]{6}$'),
  requisition_id    uuid not null references public.purchase_requisitions (id) on delete restrict,
  title             text,
  issue_date        date not null,
  close_date        date not null,
  currency          char(3) check (currency ~ '^[A-Z]{3}$'),
  status            text not null default 'open' check (status in ('open','closed','under-evaluation','awarded','cancelled')),
  awarded_vendor_id text,
  owner_id          uuid not null references auth.users (id) on delete cascade,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create table if not exists public.vendor_bidding_criteria (
  id         uuid primary key default uuid_generate_v4(),
  bidding_id uuid not null references public.vendor_biddings (id) on delete cascade,
  name       text not null,
  weight     numeric(5,4) not null check (weight >= 0 and weight <= 1)
);

create table if not exists public.vendor_bids (
  id               uuid primary key default uuid_generate_v4(),
  bidding_id       uuid not null references public.vendor_biddings (id) on delete cascade,
  vendor_id        text not null,
  vendor_name      text not null,
  submitted_at     timestamptz,
  total_price      numeric(18,2) not null check (total_price >= 0),
  currency         char(3) not null check (currency ~ '^[A-Z]{3}$'),
  lead_time_days   integer check (lead_time_days >= 0),
  evaluation_score numeric(5,2) check (evaluation_score between 0 and 100),
  compliant        boolean,
  unique (bidding_id, vendor_id)
);

create table if not exists public.vendor_bid_line_quotes (
  id                  uuid primary key default uuid_generate_v4(),
  bid_id              uuid not null references public.vendor_bids (id) on delete cascade,
  procurement_item_id uuid not null references public.procurement_items (id) on delete restrict,
  unit_price          numeric(18,2) not null check (unit_price >= 0)
);

create table if not exists public.purchase_orders (
  id                     uuid primary key default uuid_generate_v4(),
  code                   text not null unique check (code ~ '^PO-[0-9]{6}$'),
  rfq_id                 uuid references public.vendor_biddings (id) on delete set null,
  requisition_id         uuid references public.purchase_requisitions (id) on delete set null,
  vendor_id              text not null,
  vendor_name            text,
  order_date             date not null,
  expected_delivery_date date,
  subtotal               numeric(18,2) check (subtotal >= 0),
  tax_amount             numeric(18,2) check (tax_amount >= 0),
  shipping_amount        numeric(18,2) check (shipping_amount >= 0),
  total                  numeric(18,2) not null check (total >= 0),
  currency               char(3) not null check (currency ~ '^[A-Z]{3}$'),
  payment_terms          text,
  delivery_terms         text,
  status                 text not null default 'issued' check (status in ('issued','acknowledged','partially-received','received','invoiced','paid','closed','cancelled')),
  owner_id               uuid not null references auth.users (id) on delete cascade,
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now()
);
create index if not exists idx_po_rfq on public.purchase_orders (rfq_id);

create table if not exists public.purchase_order_lines (
  id                  uuid primary key default uuid_generate_v4(),
  po_id               uuid not null references public.purchase_orders (id) on delete cascade,
  procurement_item_id uuid not null references public.procurement_items (id) on delete restrict,
  description         text,
  quantity            numeric(18,3) not null check (quantity > 0),
  unit_price          numeric(18,2) not null check (unit_price >= 0),
  line_total          numeric(18,2) generated always as (quantity * unit_price) stored,
  received_quantity   numeric(18,3) not null default 0 check (received_quantity >= 0)
);
create index if not exists idx_pol_po on public.purchase_order_lines (po_id);

-- =============================================================================
-- PROJECT MONITORING
-- =============================================================================

create table if not exists public.project_charters (
  id               uuid primary key default uuid_generate_v4(),
  code             text not null unique check (code ~ '^PRJ-[0-9]{6}$'),
  charter_version  integer not null default 1 check (charter_version >= 1),
  title            text not null,
  description      text,
  sponsor          text not null,
  project_manager  text not null,
  scope            jsonb,
  start_date       date not null,
  planned_end_date date not null,
  baseline_budget  numeric(18,2) not null check (baseline_budget >= 0),
  currency         char(3) not null check (currency ~ '^[A-Z]{3}$'),
  status           text not null default 'proposed' check (status in ('proposed','chartered','active','on-hold','completed','cancelled')),
  owner_id         uuid not null references auth.users (id) on delete cascade,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create table if not exists public.project_charter_objectives (
  id         uuid primary key default uuid_generate_v4(),
  charter_id uuid not null references public.project_charters (id) on delete cascade,
  objective  text not null,
  sort_order integer not null default 0
);

create table if not exists public.project_charter_funding (
  charter_id       uuid not null references public.project_charters (id) on delete cascade,
  asset_request_id uuid not null references public.asset_requests (id) on delete restrict,
  primary key (charter_id, asset_request_id)
);

create table if not exists public.milestones (
  id                        uuid primary key default uuid_generate_v4(),
  code                      text not null unique check (code ~ '^MS-[0-9]{6}$'),
  project_id                uuid not null references public.project_charters (id) on delete cascade,
  name                      text not null,
  description               text,
  weight                    numeric(5,4) check (weight >= 0 and weight <= 1),
  planned_start             date not null,
  planned_end               date not null,
  actual_start              date,
  actual_end                date,
  physical_progress_percent numeric(5,2) not null default 0 check (physical_progress_percent between 0 and 100),
  status                    text not null default 'not-started' check (status in ('not-started','in-progress','at-risk','delayed','completed','cancelled')),
  owner_id                  uuid not null references auth.users (id) on delete cascade,
  created_at                timestamptz not null default now(),
  updated_at                timestamptz not null default now()
);
create index if not exists idx_milestones_project on public.milestones (project_id);

create table if not exists public.milestone_deliverables (
  id            uuid primary key default uuid_generate_v4(),
  milestone_id  uuid not null references public.milestones (id) on delete cascade,
  name          text not null,
  status        text not null default 'pending' check (status in ('pending','in-progress','submitted','accepted','rejected')),
  due_date      date,
  accepted_date date
);

create table if not exists public.milestone_dependencies (
  milestone_id  uuid not null references public.milestones (id) on delete cascade,
  depends_on_id uuid not null references public.milestones (id) on delete cascade,
  primary key (milestone_id, depends_on_id),
  check (milestone_id <> depends_on_id)
);

create table if not exists public.financial_tracking (
  id                   uuid primary key default uuid_generate_v4(),
  code                 text not null unique check (code ~ '^FT-[0-9]{6}$'),
  project_id           uuid not null references public.project_charters (id) on delete cascade,
  period               text not null check (period ~ '^[0-9]{4}-(0[1-9]|1[0-2]|Q[1-4])$'),
  currency             char(3) not null check (currency ~ '^[A-Z]{3}$'),
  planned_cost         numeric(18,2) not null check (planned_cost >= 0),
  committed_cost       numeric(18,2) not null check (committed_cost >= 0),
  actual_cost          numeric(18,2) not null check (actual_cost >= 0),
  earned_value         numeric(18,2) check (earned_value >= 0),
  forecast_at_completion numeric(18,2) check (forecast_at_completion >= 0),
  cost_variance        numeric(18,2) generated always as (earned_value - actual_cost) stored,
  recorded_by          text,
  owner_id             uuid not null references auth.users (id) on delete cascade,
  recorded_at          timestamptz not null default now(),
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  unique (project_id, period)
);

create table if not exists public.financial_tracking_pos (
  tracking_id       uuid not null references public.financial_tracking (id) on delete cascade,
  purchase_order_id uuid not null references public.purchase_orders (id) on delete restrict,
  primary key (tracking_id, purchase_order_id)
);

create table if not exists public.risk_issue_log (
  id                 uuid primary key default uuid_generate_v4(),
  code               text not null unique check (code ~ '^(RISK|ISSUE)-[0-9]{6}$'),
  project_id         uuid not null references public.project_charters (id) on delete cascade,
  type               text not null check (type in ('risk','issue')),
  title              text not null,
  description        text,
  category           text check (category in ('schedule','cost','scope','quality','resource','procurement','technical','external','safety')),
  probability        text check (probability in ('rare','unlikely','possible','likely','almost-certain')),
  impact             text check (impact in ('negligible','minor','moderate','major','severe')),
  severity           text check (severity in ('low','medium','high','critical')),
  status             text not null default 'open' check (status in ('open','mitigating','monitoring','escalated','resolved','closed')),
  owner              text,
  mitigation_plan    text,
  contingency_plan   text,
  linked_milestone_id uuid references public.milestones (id) on delete set null,
  raised_date        date not null,
  due_date           date,
  resolved_date      date,
  owner_id           uuid not null references auth.users (id) on delete cascade,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);
create index if not exists idx_risk_project on public.risk_issue_log (project_id);

-- ----------------------------------------------------------------------------
-- updated_at triggers
-- ----------------------------------------------------------------------------
do $$
declare t text;
begin
  -- Every top-level entity carries created_at + updated_at for audit tracking.
  foreach t in array array[
    'profiles','capex_budgets','approval_matrices','asset_requests',
    'procurement_items','purchase_requisitions','vendor_biddings',
    'purchase_orders','project_charters','milestones','financial_tracking',
    'risk_issue_log'
  ] loop
    execute format('drop trigger if exists trg_%s_updated_at on public.%I;', t, t);
    execute format('create trigger trg_%s_updated_at before update on public.%I
                    for each row execute function public.set_updated_at();', t, t);
  end loop;
end $$;

-- =============================================================================
-- ROW LEVEL SECURITY
-- =============================================================================
-- Pattern:
--   * Every table: enable RLS.
--   * SELECT: any authenticated user (shared monitoring view).
--   * Top-level tables: INSERT/UPDATE/DELETE limited to owner_id = auth.uid().
--   * Child tables: writes allowed when the parent row is owned by auth.uid().

-- Enable RLS on all tables.
do $$
declare t text;
begin
  foreach t in array array[
    'profiles','capex_budgets','approval_matrices','approval_matrix_levels',
    'asset_requests','asset_request_approvals','procurement_items',
    'purchase_requisitions','purchase_requisition_lines','vendor_biddings',
    'vendor_bidding_criteria','vendor_bids','vendor_bid_line_quotes',
    'purchase_orders','purchase_order_lines','project_charters',
    'project_charter_objectives','project_charter_funding','milestones',
    'milestone_deliverables','milestone_dependencies','financial_tracking',
    'financial_tracking_pos','risk_issue_log'
  ] loop
    execute format('alter table public.%I enable row level security;', t);
    execute format('drop policy if exists %I on public.%I;', t || '_select', t);
    execute format('create policy %I on public.%I for select to authenticated using (true);', t || '_select', t);
  end loop;
end $$;

-- profiles: self-service writes
drop policy if exists profiles_update_self on public.profiles;
create policy profiles_update_self on public.profiles for update
  to authenticated using (auth.uid() = id) with check (auth.uid() = id);
drop policy if exists profiles_insert_self on public.profiles;
create policy profiles_insert_self on public.profiles for insert
  to authenticated with check (auth.uid() = id);

-- Owner-scoped write policies for every top-level table.
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
      'create policy %I on public.%I for all to authenticated
         using (owner_id = auth.uid()) with check (owner_id = auth.uid());',
      t || '_write_own', t);
  end loop;
end $$;

-- Child-table write policies, gated through the parent's owner.
create policy aml_write on public.approval_matrix_levels for all to authenticated
  using (exists (select 1 from public.approval_matrices m where m.id = matrix_id and m.owner_id = auth.uid()))
  with check (exists (select 1 from public.approval_matrices m where m.id = matrix_id and m.owner_id = auth.uid()));

create policy ara_write on public.asset_request_approvals for all to authenticated
  using (exists (select 1 from public.asset_requests r where r.id = asset_request_id and r.owner_id = auth.uid()))
  with check (exists (select 1 from public.asset_requests r where r.id = asset_request_id and r.owner_id = auth.uid()));

create policy prl_write on public.purchase_requisition_lines for all to authenticated
  using (exists (select 1 from public.purchase_requisitions p where p.id = requisition_id and p.owner_id = auth.uid()))
  with check (exists (select 1 from public.purchase_requisitions p where p.id = requisition_id and p.owner_id = auth.uid()));

create policy vbc_write on public.vendor_bidding_criteria for all to authenticated
  using (exists (select 1 from public.vendor_biddings b where b.id = bidding_id and b.owner_id = auth.uid()))
  with check (exists (select 1 from public.vendor_biddings b where b.id = bidding_id and b.owner_id = auth.uid()));

create policy vb_write on public.vendor_bids for all to authenticated
  using (exists (select 1 from public.vendor_biddings b where b.id = bidding_id and b.owner_id = auth.uid()))
  with check (exists (select 1 from public.vendor_biddings b where b.id = bidding_id and b.owner_id = auth.uid()));

create policy vblq_write on public.vendor_bid_line_quotes for all to authenticated
  using (exists (select 1 from public.vendor_bids vb join public.vendor_biddings b on b.id = vb.bidding_id
                 where vb.id = bid_id and b.owner_id = auth.uid()))
  with check (exists (select 1 from public.vendor_bids vb join public.vendor_biddings b on b.id = vb.bidding_id
                 where vb.id = bid_id and b.owner_id = auth.uid()));

create policy pol_write on public.purchase_order_lines for all to authenticated
  using (exists (select 1 from public.purchase_orders o where o.id = po_id and o.owner_id = auth.uid()))
  with check (exists (select 1 from public.purchase_orders o where o.id = po_id and o.owner_id = auth.uid()));

create policy pco_write on public.project_charter_objectives for all to authenticated
  using (exists (select 1 from public.project_charters c where c.id = charter_id and c.owner_id = auth.uid()))
  with check (exists (select 1 from public.project_charters c where c.id = charter_id and c.owner_id = auth.uid()));

create policy pcf_write on public.project_charter_funding for all to authenticated
  using (exists (select 1 from public.project_charters c where c.id = charter_id and c.owner_id = auth.uid()))
  with check (exists (select 1 from public.project_charters c where c.id = charter_id and c.owner_id = auth.uid()));

create policy md_write on public.milestone_deliverables for all to authenticated
  using (exists (select 1 from public.milestones m where m.id = milestone_id and m.owner_id = auth.uid()))
  with check (exists (select 1 from public.milestones m where m.id = milestone_id and m.owner_id = auth.uid()));

create policy mdep_write on public.milestone_dependencies for all to authenticated
  using (exists (select 1 from public.milestones m where m.id = milestone_id and m.owner_id = auth.uid()))
  with check (exists (select 1 from public.milestones m where m.id = milestone_id and m.owner_id = auth.uid()));

create policy ftp_write on public.financial_tracking_pos for all to authenticated
  using (exists (select 1 from public.financial_tracking f where f.id = tracking_id and f.owner_id = auth.uid()))
  with check (exists (select 1 from public.financial_tracking f where f.id = tracking_id and f.owner_id = auth.uid()));

-- =============================================================================
-- Realtime (optional): Dashboard → Database → Replication → add key tables.
-- =============================================================================
