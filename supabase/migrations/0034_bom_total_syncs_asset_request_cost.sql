-- The BOM's own Estimated Total already auto-recomputes from its parts list
-- (trg_bom_lines_recompute_total -> recompute_bom_total(), migration 0025).
-- Per the user's decision, that total should now also be the source of
-- truth for the linked Asset Request's Estimated Cost, not just a separate
-- number sitting next to it -- one more hop up the same chain: line change
-- -> BOM total recomputed -> Asset Request cost follows.
--
-- Only propagates when the BOM total is non-null. recompute_bom_total()
-- sets estimated_total_cost to null for a BOM with zero parts (line_count =
-- 0 branch) -- asset_requests.estimated_cost is NOT NULL, and a freshly
-- created empty BOM shouldn't wipe out the ask amount someone already typed
-- in when the request was first submitted.
create or replace function public.sync_asset_request_estimated_cost()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  if new.estimated_total_cost is not null then
    update public.asset_requests
    set estimated_cost = new.estimated_total_cost
    where id = new.asset_request_id;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_bom_sync_asset_request_cost on public.bill_of_materials;
create trigger trg_bom_sync_asset_request_cost
  after insert or update of estimated_total_cost, asset_request_id on public.bill_of_materials
  for each row execute function public.sync_asset_request_estimated_cost();

-- Backfill: apply the sync immediately to whatever's already in the test
-- data (e.g. the BOM the user already added a line to) instead of only
-- taking effect the next time a line changes.
update public.asset_requests ar
set estimated_cost = bom.estimated_total_cost
from public.bill_of_materials bom
where bom.asset_request_id = ar.id
  and bom.estimated_total_cost is not null
  and ar.estimated_cost is distinct from bom.estimated_total_cost;
