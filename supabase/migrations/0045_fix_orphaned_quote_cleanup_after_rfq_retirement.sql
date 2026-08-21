-- Found while reviewing Purchase Requisition wiring: migration 0041 retired
-- the Vendor Bidding/RFQ module (dropped vendor_biddings, renamed
-- vendor_bids.bidding_id -> activity_id) but missed one leftover trigger
-- function that still joined through the dropped table/column. Confirmed
-- broken live: deleting a line from a Purchase Requisition's "Procurement
-- Items" list (or deleting a Purchase Requisition itself, which cascades
-- into its lines) hard-failed with `relation "vendor_biddings" does not
-- exist` every time, because trg_purchase_requisition_lines_cleanup_quotes
-- (AFTER DELETE on purchase_requisition_lines) called this function on
-- every row deleted.
--
-- Fix: same cleanup intent (drop a bid's per-item quote once the requisition
-- line it priced is removed), rewritten to join vendor_bids -> its
-- Procurement Activity -> that activity's Requisition, matching how those
-- tables actually relate today instead of the pre-0041 shape.
create or replace function public.cleanup_orphaned_bid_line_quotes()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  delete from public.vendor_bid_line_quotes q
  using public.vendor_bids b, public.procurement_activities pa
  where q.bid_id = b.id
    and b.activity_id = pa.id
    and pa.requisition_id = old.requisition_id
    and q.procurement_item_id = old.procurement_item_id;
  return old;
end;
$$;

-- Also dead code cleanup: validate_rfq_award() was the BEFORE-write trigger
-- on vendor_biddings itself, so it was dropped along with that table in
-- 0041 -- but the function definition survived (functions aren't dropped
-- automatically) and still references the removed vendor_bids.bidding_id
-- column. It isn't attached to any trigger anymore (verified), so it's
-- inert today, but it's a landmine for anyone who searches the schema and
-- assumes it's still wired up. Remove it outright rather than leave stale,
-- broken-if-ever-called code sitting in the database.
drop function if exists public.validate_rfq_award();
