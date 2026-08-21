-- Procurement Item schema cleanup:
--
-- 1. Drop Preferred Supplier / Preferred Contractor -- unused fields that
--    duplicated a decision that actually belongs later, at RFQ award time
--    (vendor_biddings.awarded_vendor_id/awarded_contractor_id already
--    covers "who got picked").
--
-- 2. Unit Cost is no longer independently entered -- it's locked to the
--    linked Asset Request's Estimated Cost (per the user's choice: an item
--    is generally one-per-Asset-Request, so "the cost equals the asset"
--    means literally that). Cascades with the existing BOM -> Asset Request
--    sync (migration 0034): BOM line changes -> BOM total recomputes ->
--    Asset Request cost updates -> this propagates to every Procurement
--    Item under that request -> estimated_total_cost (generated, qty x unit
--    cost) recomputes automatically.
--
-- (Date field left out per the user's call -- not implemented.)

alter table public.procurement_items drop column if exists preferred_vendor_id;
alter table public.procurement_items drop column if exists preferred_contractor_id;

-- --- Unit Cost locked to the linked Asset Request's Estimated Cost ---------

create or replace function public.sync_item_cost_from_asset_request()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  select ar.estimated_cost into new.estimated_unit_cost
  from public.asset_requests ar
  where ar.id = new.capex_request_id;
  return new;
end;
$$;

drop trigger if exists trg_item_cost_from_asset_request on public.procurement_items;
create trigger trg_item_cost_from_asset_request
  before insert or update on public.procurement_items
  for each row execute function public.sync_item_cost_from_asset_request();

create or replace function public.sync_items_cost_on_asset_request_change()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  if new.estimated_cost is distinct from old.estimated_cost then
    update public.procurement_items
    set estimated_unit_cost = new.estimated_cost
    where capex_request_id = new.id;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_asset_request_sync_items_cost on public.asset_requests;
create trigger trg_asset_request_sync_items_cost
  after update of estimated_cost on public.asset_requests
  for each row execute function public.sync_items_cost_on_asset_request_change();

-- Backfill: bring existing test data in line immediately.
update public.procurement_items i
set estimated_unit_cost = ar.estimated_cost
from public.asset_requests ar
where ar.id = i.capex_request_id
  and i.estimated_unit_cost is distinct from ar.estimated_cost;
