-- =============================================================================
-- Migration 0014 — normalize vendor identity into a dedicated `vendors` table
-- =============================================================================
-- Finding: vendor identity is currently stored as free text in four places —
-- vendor_bids.vendor_id/vendor_name, purchase_orders.vendor_id/vendor_name,
-- vendor_biddings.awarded_vendor_id, procurement_items.preferred_vendor_id —
-- with no table backing it. This is a 3NF violation (vendor_name is
-- functionally dependent on vendor_id, not on each row's own primary key, so
-- it's duplicated and can drift out of sync across rows) and it removes any
-- referential integrity: nothing stops `awarded_vendor_id` from naming a
-- vendor who never submitted a bid on that RFQ, and there's no way to ask
-- "every PO issued to this vendor" without a fragile text match.
--
-- This migration:
--   1. Creates public.vendors as the single source of truth for vendor identity.
--   2. Backfills it from the existing free-text values (best effort — see
--      "Manual follow-up" at the bottom).
--   3. Repoints vendor_bids.vendor_id, purchase_orders.vendor_id,
--      vendor_biddings.awarded_vendor_id and procurement_items.preferred_vendor_id
--      at vendors.id, dropping the redundant *_name text columns.
--   4. Adds a trigger enforcing the cross-entity invariant a CHECK constraint
--      can't express: an RFQ can only be awarded to a vendor who bid on it.
--
-- Run this as a single transaction (default for a `psql -f` / SQL Editor
-- paste) — later steps rely on earlier steps' text columns still being
-- present at the point they read them.
--
-- ASSUMPTION (flagging per schema-design convention — confirm this matches
-- intent): vendors is modeled as shared reference data, not owner-scoped.
-- Every other top-level table in this schema restricts writes to
-- `owner_id = auth.uid()`, but vendor identity is real-world shared state —
-- if "Acme Corp" is owner-scoped, every analyst who deals with Acme has to
-- recreate their own private "Acme Corp" row, which defeats the dedup this
-- migration exists to provide. So: any authenticated user may create or edit
-- a vendor record, and there is deliberately no DELETE policy (removing a
-- vendor referenced by historical bids/POs should go through a service-role
-- script that reassigns or nulls those references first, not the API).
-- If vendor records should instead be owner- or role-restricted, that's a
-- one-block policy change — see the "vendors RLS" section below.
--
-- NOTE: this project already has a similar shared reference table —
-- `lookup_options` (added in migration 0010) — but it took the opposite
-- choice: writes are owner-scoped (`owner_id = auth.uid()`) like every
-- business table, while reads are shared. A table-wide unique constraint on
-- (list_key, value) stops two users from creating a duplicate option, but it
-- does mean only the original creator can edit or delete a given option
-- afterward — a different tradeoff than the one made here for vendors. Not
-- touched in this migration (out of scope), just flagging the inconsistency
-- between the two "shared reference data" tables in case you want them
-- aligned on the same policy in a follow-up.
--
-- BREAKING CHANGE for the frontend: vendor_id on vendor_bids / purchase_orders
-- changes type from text to uuid (a vendors.id FK), and vendor_name is
-- removed (display name now comes from joining vendors). See the
-- accompanying restructuring report for the exact files/lines in
-- src/lib/crud/configs.ts that need to switch from `type: "text"` to
-- `type: "reference", refTable: "vendors"` before this ships to the UI.
-- =============================================================================

-- ----------------------------------------------------------------------------
-- 1. vendors table
-- ----------------------------------------------------------------------------
create table if not exists public.vendors (
  id            uuid primary key default uuid_generate_v4(),
  name          text not null check (btrim(name) <> ''),
  name_key      text generated always as (lower(btrim(name))) stored,
  contact_name  text,
  contact_email text,
  contact_phone text,
  notes         text,
  created_by    uuid references public.profiles (id) on delete set null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (name_key)
);

drop trigger if exists trg_vendors_updated_at on public.vendors;
create trigger trg_vendors_updated_at before update on public.vendors
  for each row execute function public.set_updated_at();

alter table public.vendors enable row level security;

drop policy if exists vendors_select on public.vendors;
create policy vendors_select on public.vendors for select
  to authenticated using (true);

drop policy if exists vendors_insert on public.vendors;
create policy vendors_insert on public.vendors for insert
  to authenticated with check (true);

drop policy if exists vendors_update on public.vendors;
create policy vendors_update on public.vendors for update
  to authenticated using (true) with check (true);

-- No DELETE policy: intentional (see header note).

-- ----------------------------------------------------------------------------
-- 2. Backfill vendors from existing free-text values
-- ----------------------------------------------------------------------------
insert into public.vendors (name)
select distinct on (lower(btrim(vb.vendor_name))) btrim(vb.vendor_name)
from public.vendor_bids vb
where vb.vendor_name is not null and btrim(vb.vendor_name) <> ''
order by lower(btrim(vb.vendor_name)), vb.submitted_at desc nulls last
on conflict (name_key) do nothing;

insert into public.vendors (name)
select distinct btrim(po.vendor_name)
from public.purchase_orders po
where po.vendor_name is not null and btrim(po.vendor_name) <> ''
on conflict (name_key) do nothing;

-- ----------------------------------------------------------------------------
-- 3. vendor_biddings.awarded_vendor_id — backfill BEFORE vendor_bids.vendor_id
--    changes type, because the award is recorded as "this text equals the
--    winning bid's (old, text) vendor_id".
-- ----------------------------------------------------------------------------
alter table public.vendor_biddings add column if not exists awarded_vendor_ref_id uuid references public.vendors (id) on delete set null;

update public.vendor_biddings b
set awarded_vendor_ref_id = v.id
from public.vendor_bids vb
join public.vendors v on v.name_key = lower(btrim(vb.vendor_name))
where vb.bidding_id = b.id
  and vb.vendor_id = b.awarded_vendor_id
  and b.awarded_vendor_id is not null
  and b.awarded_vendor_ref_id is null;

-- Fallback for the (unlikely but possible) case where awarded_vendor_id was
-- populated with a vendor *name* rather than a vendor_bids.vendor_id value.
update public.vendor_biddings b
set awarded_vendor_ref_id = v.id
from public.vendors v
where b.awarded_vendor_ref_id is null
  and b.awarded_vendor_id is not null
  and v.name_key = lower(btrim(b.awarded_vendor_id));

-- ----------------------------------------------------------------------------
-- 4a. vendor_bids: vendor_id (text) -> vendor_id (uuid references vendors)
-- ----------------------------------------------------------------------------
alter table public.vendor_bids add column if not exists vendor_ref_id uuid references public.vendors (id) on delete restrict;

update public.vendor_bids vb
set vendor_ref_id = v.id
from public.vendors v
where v.name_key = lower(btrim(vb.vendor_name))
  and vb.vendor_ref_id is null;

alter table public.vendor_bids drop column if exists vendor_name;
alter table public.vendor_bids drop column if exists vendor_id;
alter table public.vendor_bids rename column vendor_ref_id to vendor_id;
alter table public.vendor_bids add constraint vendor_bids_bidding_vendor_unique unique (bidding_id, vendor_id);
create index if not exists idx_vendor_bids_vendor on public.vendor_bids (vendor_id);

-- ----------------------------------------------------------------------------
-- 4b. purchase_orders: vendor_id (text) -> vendor_id (uuid references vendors)
-- ----------------------------------------------------------------------------
alter table public.purchase_orders add column if not exists vendor_ref_id uuid references public.vendors (id) on delete restrict;

update public.purchase_orders po
set vendor_ref_id = v.id
from public.vendors v
where v.name_key = lower(btrim(po.vendor_name))
  and po.vendor_ref_id is null;

alter table public.purchase_orders drop column if exists vendor_name;
alter table public.purchase_orders drop column if exists vendor_id;
alter table public.purchase_orders rename column vendor_ref_id to vendor_id;
create index if not exists idx_purchase_orders_vendor on public.purchase_orders (vendor_id);

-- ----------------------------------------------------------------------------
-- 4c. vendor_biddings: finalize awarded_vendor_id
-- ----------------------------------------------------------------------------
alter table public.vendor_biddings drop column if exists awarded_vendor_id;
alter table public.vendor_biddings rename column awarded_vendor_ref_id to awarded_vendor_id;
create index if not exists idx_vendor_biddings_awarded_vendor on public.vendor_biddings (awarded_vendor_id);

-- ----------------------------------------------------------------------------
-- 4d. procurement_items.preferred_vendor_id (text) -> uuid references vendors
-- ----------------------------------------------------------------------------
alter table public.procurement_items add column if not exists preferred_vendor_ref_id uuid references public.vendors (id) on delete set null;

update public.procurement_items pi
set preferred_vendor_ref_id = v.id
from public.vendors v
where pi.preferred_vendor_id is not null
  and pi.preferred_vendor_ref_id is null
  and v.name_key = lower(btrim(pi.preferred_vendor_id));

alter table public.procurement_items drop column if exists preferred_vendor_id;
alter table public.procurement_items rename column preferred_vendor_ref_id to preferred_vendor_id;
create index if not exists idx_procurement_items_preferred_vendor on public.procurement_items (preferred_vendor_id);

-- ----------------------------------------------------------------------------
-- 5. Cross-entity invariant: an RFQ can only be awarded to a vendor who bid
-- ----------------------------------------------------------------------------
create or replace function public.validate_awarded_vendor()
returns trigger language plpgsql set search_path = public as $$
begin
  if new.awarded_vendor_id is not null then
    if not exists (
      select 1 from public.vendor_bids vb
      where vb.bidding_id = new.id and vb.vendor_id = new.awarded_vendor_id
    ) then
      raise exception 'vendor_biddings %: awarded_vendor_id % did not submit a bid on this RFQ', new.id, new.awarded_vendor_id;
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_vendor_biddings_validate_award on public.vendor_biddings;
create trigger trg_vendor_biddings_validate_award
  before insert or update of awarded_vendor_id on public.vendor_biddings
  for each row execute function public.validate_awarded_vendor();

-- =============================================================================
-- Manual follow-up (run these after the migration to confirm a clean backfill;
-- non-empty results mean some rows need a human to pick the right vendor,
-- most likely because vendor_name had a typo/variant Postgres couldn't match
-- case/whitespace-insensitively):
--
--   select id, bidding_id from public.vendor_bids where vendor_id is null;
--   select id, code from public.purchase_orders where vendor_id is null;
--   select b.id, b.code from public.vendor_biddings b
--     join public.lookup_options lo on lo.id = b.status_id
--     where lo.list_key = 'rfq_status' and lo.value = 'Awarded'
--       and b.awarded_vendor_id is null;
--     -- (status is now status_id -> lookup_options, not a text column. An
--     -- RFQ with no award yet, e.g. status "Under Evaluation", is expected
--     -- to have a null awarded_vendor_id — only flag ones already "Awarded"
--     -- with nothing filled in.)
--
-- Once clean, tighten the columns that were `not null` before this migration
-- (left nullable here so a messy backfill doesn't hard-fail the migration):
--   alter table public.vendor_bids alter column vendor_id set not null;
--   alter table public.purchase_orders alter column vendor_id set not null;
-- =============================================================================
