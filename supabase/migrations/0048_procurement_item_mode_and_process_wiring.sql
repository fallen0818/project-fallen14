-- Corrects the Procurement Plan wiring to match the real process, per the
-- user's own description of it:
--
--   Asset Request approved -> Procurement Item decides its Mode of
--   Procurement (Public Bidding / Simplified / Shopping), based on the
--   approved amount -> Purchase Requisition raised by the department
--   (awaiting approval) -> Procurement Activity -> Post-Qualification.
--
-- Mode of Procurement already existed, but only on Procurement Activity
-- (migration 0040) -- too late in the process. The real decision point is
-- earlier, at the item level, right after the amount is known (the item's
-- own estimated_total_cost, copied from the Asset Request once approved) --
-- that decision is what determines which Requisition/Activity an item
-- should even be grouped into. Procurement Activity keeps its own mode_id
-- too (it's the formal record of which method that specific activity/event
-- is actually running under), but Procurement Item is now where the call
-- gets made in the first place.
alter table public.procurement_items
  add column mode_id uuid references public.lookup_options(id);

create index idx_procurement_items_mode_id on public.procurement_items(mode_id);

-- "Converted to RFQ" was a leftover label from the retired Vendor
-- Bidding/RFQ module (migration 0041) -- a Requisition today moves forward
-- into Procurement Activities, not an "RFQ", so relabel it to match.
update public.lookup_options
set value = 'In Procurement'
where list_key = 'requisition_status' and value = 'Converted to RFQ';
