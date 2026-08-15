-- Fixes two defects found reviewing the requisition -> procurement items ->
-- bid evaluation wiring (purchase_requisition_lines / vendor_bid_line_quotes):
--
-- 1. Nothing stopped the same procurement item from being added to a
--    requisition's parts list twice. Two lines quoting the exact same item
--    made no sense (should be one line with a larger quantity), and caused
--    Bid Evaluation's per-item pricing to double-count that item's price in
--    its "Computed Total" (its quote lookup is keyed by procurement_item_id,
--    not by line id, so both duplicate rows shared -- and double-summed --
--    the same quote).
alter table public.purchase_requisition_lines
  add constraint purchase_requisition_lines_req_item_unique unique (requisition_id, procurement_item_id);

-- 2. Removing an item from a requisition's parts list left any bidder price
--    quotes already entered for it (vendor_bid_line_quotes) orphaned --
--    invisible in Bid Evaluation (which reads off the requisition's current
--    lines) but never actually deleted. Clean them up whenever a line is
--    removed: any quote, on any bid under an RFQ for this same requisition,
--    for this same item. Safe now that (1) guarantees at most one line per
--    (requisition, item) -- a deleted line unambiguously means "this item no
--    longer belongs to this requisition". Also fires for free when a whole
--    requisition is deleted, since purchase_requisition_lines cascades from
--    purchase_requisitions.
create or replace function public.cleanup_orphaned_bid_line_quotes()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  delete from public.vendor_bid_line_quotes q
  using public.vendor_bids b, public.vendor_biddings vb
  where q.bid_id = b.id
    and b.bidding_id = vb.id
    and vb.requisition_id = old.requisition_id
    and q.procurement_item_id = old.procurement_item_id;
  return old;
end;
$$;

create trigger trg_purchase_requisition_lines_cleanup_quotes
  after delete on public.purchase_requisition_lines
  for each row execute function public.cleanup_orphaned_bid_line_quotes();
