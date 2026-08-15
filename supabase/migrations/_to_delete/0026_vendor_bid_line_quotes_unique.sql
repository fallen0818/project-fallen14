-- Bid Evaluation Matrix now lets a bidder be quoted per procurement item
-- (vendor_bid_line_quotes, previously defined but unused). The per-bidder
-- per-item upsert pattern (mirroring rfq_checklist_results' unique
-- (checklist_item_id, vendor_bid_id) + onConflict upsert) needs a matching
-- unique constraint here so re-saving a quote updates the existing row
-- instead of erroring on a duplicate insert.
alter table public.vendor_bid_line_quotes
  add constraint vendor_bid_line_quotes_bid_item_unique unique (bid_id, procurement_item_id);
