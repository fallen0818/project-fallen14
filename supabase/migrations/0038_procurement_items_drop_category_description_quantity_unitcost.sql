-- Procurement Item schema simplification round 2: remove Category,
-- Description, Quantity, and Unit Cost -- the item's cost is now a single
-- flat figure equal to its linked Asset Request's Estimated Cost (no more
-- quantity x unit-cost breakdown at the procurement-item level).
--
-- estimated_total_cost was a GENERATED column (quantity * estimated_unit_cost).
-- Since both inputs are going away, convert it to a plain column first (this
-- preserves each row's last-computed value as its new static value), then
-- repoint the migration-0035 sync triggers to write straight into it instead
-- of estimated_unit_cost.

alter table public.procurement_items alter column estimated_total_cost drop expression if exists;

create or replace function public.sync_item_cost_from_asset_request()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  select ar.estimated_cost into new.estimated_total_cost
  from public.asset_requests ar
  where ar.id = new.capex_request_id;
  return new;
end;
$$;

create or replace function public.sync_items_cost_on_asset_request_change()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  if new.estimated_cost is distinct from old.estimated_cost then
    update public.procurement_items
    set estimated_total_cost = new.estimated_cost
    where capex_request_id = new.id;
  end if;
  return new;
end;
$$;

-- Backfill so every row's flat cost matches its asset request right now,
-- before the old inputs disappear.
update public.procurement_items i
set estimated_total_cost = ar.estimated_cost
from public.asset_requests ar
where ar.id = i.capex_request_id
  and i.estimated_total_cost is distinct from ar.estimated_cost;

alter table public.procurement_items drop column if exists category_id;
alter table public.procurement_items drop column if exists description;
alter table public.procurement_items drop column if exists quantity;
alter table public.procurement_items drop column if exists estimated_unit_cost;

-- --- Cleanup: orphaned bidding_date artifacts -----------------------------
-- A separate, earlier migration attempt (bidding_date propagation on
-- Procurement Items) was cancelled mid-flight by the user ("leave the
-- date") but had already partially applied to the live database before the
-- cancellation took effect -- it left behind a bidding_date column on
-- procurement_items plus sync triggers/functions off
-- purchase_requisition_lines and vendor_biddings. None of it was ever wired
-- into the UI and the user explicitly did not want the feature, so it's
-- removed outright here rather than left as dead schema.

drop trigger if exists trg_prl_bidding_date on public.purchase_requisition_lines;
drop trigger if exists trg_vb_bidding_date on public.vendor_biddings;
drop function if exists public.trg_prl_recompute_item_bidding_date();
drop function if exists public.trg_vb_recompute_item_bidding_date();
drop function if exists public.recompute_item_bidding_date(uuid);

alter table public.procurement_items drop column if exists bidding_date;
