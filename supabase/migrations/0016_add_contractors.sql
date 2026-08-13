-- =============================================================================
-- Migration 0016 — add contractors, integrate into procurement
-- =============================================================================
-- Adds a `contractors` table alongside the existing `vendors` table (which,
-- going forward, represents goods suppliers specifically). Contractors are a
-- separate entity because they carry fields suppliers don't need (specialty,
-- license number, insurance expiry) and vice versa (suppliers don't need
-- those, contractors don't need a catalog/lead-time concept). This mirrors
-- the request to keep "supplier" and "contractor" as distinct concepts rather
-- than folding both into one table with a type flag.
--
-- Integration points into procurement, each nullable and mutually exclusive
-- with the equivalent vendor column (a line is sourced from a supplier OR a
-- contractor, never both — enforced by a check constraint, not just a UI
-- convention):
--   procurement_items.preferred_contractor_id  (alongside preferred_vendor_id)
--   purchase_orders.contractor_id              (alongside vendor_id)
--   vendor_biddings.awarded_contractor_id      (alongside awarded_vendor_id)
--   vendor_bids.contractor_id                  (alongside vendor_id)
--
-- The RFQ award-validation trigger (from migration 0014) is extended to also
-- validate a contractor award against a real contractor bid on that RFQ.
-- =============================================================================

-- 1. Reference data: contractor specialty categories.
insert into public.lookup_options (list_key, code, value, owner_id)
select 'contractor_specialty', v.code, v.value, (select id from auth.users order by created_at asc limit 1)
from (values
  ('CSPEC-0001', 'Civil Works'),
  ('CSPEC-0002', 'Electrical'),
  ('CSPEC-0003', 'Mechanical'),
  ('CSPEC-0004', 'IT Services'),
  ('CSPEC-0005', 'Facilities Maintenance'),
  ('CSPEC-0006', 'Logistics'),
  ('CSPEC-0007', 'Consulting'),
  ('CSPEC-0008', 'Other')
) as v(code, value)
where not exists (select 1 from public.lookup_options lo where lo.list_key = 'contractor_specialty' and lo.value = v.value)
  and exists (select 1 from auth.users);

-- 2. contractors table (shared reference data, same shape/RLS pattern as
--    vendors — any authenticated user can create/edit, nobody can delete via
--    the public API).
create table if not exists public.contractors (
  id                uuid primary key default uuid_generate_v4(),
  name              text not null check (btrim(name) <> ''),
  name_key          text generated always as (lower(btrim(name))) stored,
  specialty_id      uuid references public.lookup_options (id) on delete set null,
  license_number    text,
  insurance_expiry  date,
  contact_name      text,
  contact_email     text,
  contact_phone     text,
  notes             text,
  created_by        uuid references public.profiles (id) on delete set null,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  unique (name_key)
);

alter table public.contractors enable row level security;

drop policy if exists contractors_select on public.contractors;
create policy contractors_select on public.contractors
  for select to authenticated using (true);

drop policy if exists contractors_insert on public.contractors;
create policy contractors_insert on public.contractors
  for insert to authenticated with check (true);

drop policy if exists contractors_update on public.contractors;
create policy contractors_update on public.contractors
  for update to authenticated using (true) with check (true);
-- deliberately no delete policy — same reasoning as vendors.

drop trigger if exists trg_contractors_updated_at on public.contractors;
create trigger trg_contractors_updated_at before update on public.contractors
  for each row execute function public.set_updated_at();

create index if not exists idx_contractors_created_by on public.contractors (created_by);
create index if not exists idx_contractors_specialty on public.contractors (specialty_id);

-- 3. procurement_items: a line can have a preferred supplier OR a preferred
--    contractor, not both.
alter table public.procurement_items
  add column if not exists preferred_contractor_id uuid references public.contractors (id) on delete set null;

alter table public.procurement_items
  drop constraint if exists procurement_items_supplier_xor_contractor;
alter table public.procurement_items
  add constraint procurement_items_supplier_xor_contractor
  check (not (preferred_vendor_id is not null and preferred_contractor_id is not null));

create index if not exists idx_procurement_items_preferred_contractor on public.procurement_items (preferred_contractor_id);

-- 4. purchase_orders: a PO is issued to a supplier OR a contractor, not both.
alter table public.purchase_orders
  add column if not exists contractor_id uuid references public.contractors (id) on delete restrict;

alter table public.purchase_orders
  drop constraint if exists purchase_orders_supplier_xor_contractor;
alter table public.purchase_orders
  add constraint purchase_orders_supplier_xor_contractor
  check (not (vendor_id is not null and contractor_id is not null));

create index if not exists idx_purchase_orders_contractor on public.purchase_orders (contractor_id);

-- 5. vendor_biddings (RFQs): an RFQ can be awarded to a supplier OR a
--    contractor, not both.
alter table public.vendor_biddings
  add column if not exists awarded_contractor_id uuid references public.contractors (id) on delete set null;

alter table public.vendor_biddings
  drop constraint if exists vendor_biddings_award_supplier_xor_contractor;
alter table public.vendor_biddings
  add constraint vendor_biddings_award_supplier_xor_contractor
  check (not (awarded_vendor_id is not null and awarded_contractor_id is not null));

create index if not exists idx_vendor_biddings_awarded_contractor on public.vendor_biddings (awarded_contractor_id);

-- 6. vendor_bids: a bid comes from a supplier OR a contractor, not both.
--    (nulls are distinct in a unique constraint, so contractor bids with
--    vendor_id null don't collide with each other on the vendor-side unique.)
alter table public.vendor_bids
  add column if not exists contractor_id uuid references public.contractors (id) on delete restrict;

alter table public.vendor_bids
  drop constraint if exists vendor_bids_supplier_xor_contractor;
alter table public.vendor_bids
  add constraint vendor_bids_supplier_xor_contractor
  check (not (vendor_id is not null and contractor_id is not null));

alter table public.vendor_bids
  drop constraint if exists vendor_bids_bidding_contractor_unique;
alter table public.vendor_bids
  add constraint vendor_bids_bidding_contractor_unique unique (bidding_id, contractor_id);

create index if not exists idx_vendor_bids_contractor on public.vendor_bids (contractor_id);

-- 7. Extend the award-validation trigger to cover contractor awards too.
drop trigger if exists trg_vendor_biddings_validate_award on public.vendor_biddings;
drop function if exists public.validate_awarded_vendor();

create or replace function public.validate_rfq_award()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.awarded_vendor_id is not null then
    if not exists (
      select 1 from public.vendor_bids vb
      where vb.bidding_id = new.id and vb.vendor_id = new.awarded_vendor_id
    ) then
      raise exception 'vendor_biddings %: awarded_vendor_id % did not submit a bid on this RFQ', new.id, new.awarded_vendor_id;
    end if;
  end if;

  if new.awarded_contractor_id is not null then
    if not exists (
      select 1 from public.vendor_bids vb
      where vb.bidding_id = new.id and vb.contractor_id = new.awarded_contractor_id
    ) then
      raise exception 'vendor_biddings %: awarded_contractor_id % did not submit a bid on this RFQ', new.id, new.awarded_contractor_id;
    end if;
  end if;

  return new;
end;
$$;

create trigger trg_vendor_biddings_validate_award
  before insert or update of awarded_vendor_id, awarded_contractor_id on public.vendor_biddings
  for each row execute function public.validate_rfq_award();
