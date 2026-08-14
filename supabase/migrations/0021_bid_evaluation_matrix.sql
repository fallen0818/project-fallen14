-- Rebuilds the bid documents checklist into a real bid-evaluation matrix,
-- matching the paper/spreadsheet format used during bid opening: documents
-- grouped by section, one Pass/Fail checkbox per bidder, a remarks column,
-- and each bidder's Bid Offer / Bid Security captured alongside.

-- 1. Checklist items become the *template* row (one per document per RFQ).
--    Pass/Fail now lives per-bidder in rfq_checklist_results below, so the
--    old single is_received flag no longer applies. Adds `section` (groups
--    documents the way the sample sheet does: Administrative/Technical/
--    Legal/Financial) and `remarks` (one remark per document requirement,
--    matching the sample's single Remarks column).
alter table public.rfq_document_checklist add column section text not null;
alter table public.rfq_document_checklist add column remarks text;
alter table public.rfq_document_checklist drop column is_received;

-- 2. Each bidder's Bid Security amount, alongside the Bid Offer that already
--    lives at vendor_bids.total_price.
alter table public.vendor_bids add column bid_security_amount numeric;
alter table public.vendor_bids add constraint vendor_bids_bid_security_amount_check
  check (bid_security_amount is null or bid_security_amount >= 0);

-- 3. The pass/fail matrix itself: one row per (document requirement, bidder).
--    A missing row means "not yet checked" (☐), same semantic as the old
--    single-bidder is_received flag, just per-bidder now.
create table public.rfq_checklist_results (
  id uuid primary key default uuid_generate_v4(),
  checklist_item_id uuid not null references public.rfq_document_checklist(id) on delete cascade,
  vendor_bid_id uuid not null references public.vendor_bids(id) on delete cascade,
  passed boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (checklist_item_id, vendor_bid_id)
);

create index idx_rfq_checklist_results_checklist_item_id on public.rfq_checklist_results(checklist_item_id);
create index idx_rfq_checklist_results_vendor_bid_id on public.rfq_checklist_results(vendor_bid_id);

alter table public.rfq_checklist_results enable row level security;

-- Two-hop ownership check: a result's writability follows its checklist
-- item's RFQ, via the existing owns_rfq() helper from migration 0020.
create or replace function public.owns_rfq_checklist_item(p_checklist_item_id uuid)
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from public.rfq_document_checklist c
    where c.id = p_checklist_item_id and public.owns_rfq(c.bidding_id)
  );
$$;

create policy rfq_checklist_results_select on public.rfq_checklist_results
  for select to authenticated using (true);
create policy rfq_checklist_results_insert on public.rfq_checklist_results
  for insert to authenticated with check (public.owns_rfq_checklist_item(checklist_item_id));
create policy rfq_checklist_results_update on public.rfq_checklist_results
  for update to authenticated using (public.owns_rfq_checklist_item(checklist_item_id)) with check (public.owns_rfq_checklist_item(checklist_item_id));
create policy rfq_checklist_results_delete on public.rfq_checklist_results
  for delete to authenticated using (public.owns_rfq_checklist_item(checklist_item_id));

create trigger trg_rfq_checklist_results_updated_at
  before update on public.rfq_checklist_results
  for each row execute function public.set_updated_at();
