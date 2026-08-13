-- =============================================================================
-- Migration 0005 — foundation hardening
-- =============================================================================
create index if not exists idx_approval_matrices_owner       on public.approval_matrices (owner_id);
create index if not exists idx_proc_items_owner               on public.procurement_items (owner_id);
create index if not exists idx_purchase_requisitions_owner    on public.purchase_requisitions (owner_id);
create index if not exists idx_prl_procurement_item            on public.purchase_requisition_lines (procurement_item_id);
create index if not exists idx_vendor_biddings_requisition     on public.vendor_biddings (requisition_id);
create index if not exists idx_vendor_biddings_owner           on public.vendor_biddings (owner_id);
create index if not exists idx_vbc_bidding                     on public.vendor_bidding_criteria (bidding_id);
create index if not exists idx_vblq_bid                        on public.vendor_bid_line_quotes (bid_id);
create index if not exists idx_vblq_procurement_item            on public.vendor_bid_line_quotes (procurement_item_id);
create index if not exists idx_po_requisition                  on public.purchase_orders (requisition_id);
create index if not exists idx_po_owner                        on public.purchase_orders (owner_id);
create index if not exists idx_pol_procurement_item             on public.purchase_order_lines (procurement_item_id);
create index if not exists idx_project_charters_owner          on public.project_charters (owner_id);
create index if not exists idx_pco_charter                     on public.project_charter_objectives (charter_id);
create index if not exists idx_pcf_asset_request                on public.project_charter_funding (asset_request_id);
create index if not exists idx_milestones_owner                on public.milestones (owner_id);
create index if not exists idx_md_milestone                    on public.milestone_deliverables (milestone_id);
create index if not exists idx_mdep_depends_on                 on public.milestone_dependencies (depends_on_id);
create index if not exists idx_financial_tracking_owner        on public.financial_tracking (owner_id);
create index if not exists idx_ftp_purchase_order               on public.financial_tracking_pos (purchase_order_id);
create index if not exists idx_risk_owner                      on public.risk_issue_log (owner_id);
create index if not exists idx_risk_linked_milestone            on public.risk_issue_log (linked_milestone_id);

update public.vendor_biddings set currency = 'PHP' where currency is null;
alter table public.vendor_biddings alter column currency set not null;

alter table public.purchase_requisition_lines
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists updated_at timestamptz not null default now();

alter table public.vendor_bids
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists updated_at timestamptz not null default now();

alter table public.purchase_order_lines
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists updated_at timestamptz not null default now();

alter table public.milestone_deliverables
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists updated_at timestamptz not null default now();

do $$
declare t text;
begin
  foreach t in array array[
    'purchase_requisition_lines','vendor_bids','purchase_order_lines',
    'milestone_deliverables'
  ] loop
    execute format('drop trigger if exists trg_%s_updated_at on public.%I;', t, t);
    execute format('create trigger trg_%s_updated_at before update on public.%I
                    for each row execute function public.set_updated_at();', t, t);
  end loop;
end $$;

create or replace function public.owns_approval_matrix(p_matrix_id uuid)
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from public.approval_matrices m
    where m.id = p_matrix_id and m.owner_id = auth.uid()
  );
$$;

create or replace function public.owns_asset_request(p_request_id uuid)
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from public.asset_requests r
    where r.id = p_request_id and r.owner_id = auth.uid()
  );
$$;

create or replace function public.owns_purchase_requisition(p_requisition_id uuid)
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from public.purchase_requisitions p
    where p.id = p_requisition_id and p.owner_id = auth.uid()
  );
$$;

create or replace function public.owns_vendor_bidding(p_bidding_id uuid)
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from public.vendor_biddings b
    where b.id = p_bidding_id and b.owner_id = auth.uid()
  );
$$;

create or replace function public.owns_vendor_bid(p_bid_id uuid)
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from public.vendor_bids vb
    where vb.id = p_bid_id and public.owns_vendor_bidding(vb.bidding_id)
  );
$$;

create or replace function public.owns_purchase_order(p_po_id uuid)
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from public.purchase_orders o
    where o.id = p_po_id and o.owner_id = auth.uid()
  );
$$;

create or replace function public.owns_project_charter(p_charter_id uuid)
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from public.project_charters c
    where c.id = p_charter_id and c.owner_id = auth.uid()
  );
$$;

create or replace function public.owns_milestone(p_milestone_id uuid)
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from public.milestones m
    where m.id = p_milestone_id and m.owner_id = auth.uid()
  );
$$;

create or replace function public.owns_financial_tracking(p_tracking_id uuid)
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from public.financial_tracking f
    where f.id = p_tracking_id and f.owner_id = auth.uid()
  );
$$;

drop policy if exists aml_write on public.approval_matrix_levels;
create policy aml_write on public.approval_matrix_levels for all to authenticated
  using (public.owns_approval_matrix(matrix_id))
  with check (public.owns_approval_matrix(matrix_id));

drop policy if exists ara_write on public.asset_request_approvals;
create policy ara_write on public.asset_request_approvals for all to authenticated
  using (public.owns_asset_request(asset_request_id))
  with check (public.owns_asset_request(asset_request_id));

drop policy if exists prl_write on public.purchase_requisition_lines;
create policy prl_write on public.purchase_requisition_lines for all to authenticated
  using (public.owns_purchase_requisition(requisition_id))
  with check (public.owns_purchase_requisition(requisition_id));

drop policy if exists vbc_write on public.vendor_bidding_criteria;
create policy vbc_write on public.vendor_bidding_criteria for all to authenticated
  using (public.owns_vendor_bidding(bidding_id))
  with check (public.owns_vendor_bidding(bidding_id));

drop policy if exists vb_write on public.vendor_bids;
create policy vb_write on public.vendor_bids for all to authenticated
  using (public.owns_vendor_bidding(bidding_id))
  with check (public.owns_vendor_bidding(bidding_id));

drop policy if exists vblq_write on public.vendor_bid_line_quotes;
create policy vblq_write on public.vendor_bid_line_quotes for all to authenticated
  using (public.owns_vendor_bid(bid_id))
  with check (public.owns_vendor_bid(bid_id));

drop policy if exists pol_write on public.purchase_order_lines;
create policy pol_write on public.purchase_order_lines for all to authenticated
  using (public.owns_purchase_order(po_id))
  with check (public.owns_purchase_order(po_id));

drop policy if exists pco_write on public.project_charter_objectives;
create policy pco_write on public.project_charter_objectives for all to authenticated
  using (public.owns_project_charter(charter_id))
  with check (public.owns_project_charter(charter_id));

drop policy if exists pcf_write on public.project_charter_funding;
create policy pcf_write on public.project_charter_funding for all to authenticated
  using (public.owns_project_charter(charter_id))
  with check (public.owns_project_charter(charter_id));

drop policy if exists md_write on public.milestone_deliverables;
create policy md_write on public.milestone_deliverables for all to authenticated
  using (public.owns_milestone(milestone_id))
  with check (public.owns_milestone(milestone_id));

drop policy if exists mdep_write on public.milestone_dependencies;
create policy mdep_write on public.milestone_dependencies for all to authenticated
  using (public.owns_milestone(milestone_id))
  with check (public.owns_milestone(milestone_id));

drop policy if exists ftp_write on public.financial_tracking_pos;
create policy ftp_write on public.financial_tracking_pos for all to authenticated
  using (public.owns_financial_tracking(tracking_id))
  with check (public.owns_financial_tracking(tracking_id));
