-- Bid documents checklist: one shared list of required documents per RFQ
-- (vendor_biddings), checked off during bid opening/evaluation. Same
-- "dynamic line items" pattern as bidding_schedule_activities and
-- bill_of_materials_lines -- a freeform, add/remove-able list of rows
-- pointing back at one parent, not fixed columns.

create table public.rfq_document_checklist (
  id uuid primary key default uuid_generate_v4(),
  bidding_id uuid not null references public.vendor_biddings(id) on delete cascade,
  document_name text not null,
  is_received boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index idx_rfq_document_checklist_bidding_id on public.rfq_document_checklist(bidding_id);

alter table public.rfq_document_checklist enable row level security;

-- Same pattern as owns_procurement_item()/owns_bom(): a checklist line's
-- writability follows its parent RFQ's ownership, not a column on the line.
create or replace function public.owns_rfq(p_bidding_id uuid)
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from public.vendor_biddings b
    where b.id = p_bidding_id and b.owner_id = auth.uid()
  );
$$;

create policy rfq_document_checklist_select on public.rfq_document_checklist
  for select to authenticated using (true);
create policy rfq_document_checklist_insert on public.rfq_document_checklist
  for insert to authenticated with check (public.owns_rfq(bidding_id));
create policy rfq_document_checklist_update on public.rfq_document_checklist
  for update to authenticated using (public.owns_rfq(bidding_id)) with check (public.owns_rfq(bidding_id));
create policy rfq_document_checklist_delete on public.rfq_document_checklist
  for delete to authenticated using (public.owns_rfq(bidding_id));

create trigger trg_rfq_document_checklist_updated_at
  before update on public.rfq_document_checklist
  for each row execute function public.set_updated_at();
