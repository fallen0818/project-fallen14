-- Bid Evaluation now displays per-procurement-item bidder pricing (read from
-- purchase_requisition_lines via the RFQ's requisition -- items are attached
-- to a requisition through the Requisitions module's own parts list, not
-- managed on the Bid Evaluation page itself). The per-bidder per-item upsert
-- pattern (mirroring rfq_checklist_results' unique (checklist_item_id,
-- vendor_bid_id) + onConflict upsert) needs a matching unique constraint
-- here so re-saving a quote updates the existing row instead of erroring on
-- a duplicate insert. (Supersedes the identical constraint from the earlier,
-- reverted 0026/0027 pair.)
alter table public.vendor_bid_line_quotes
  add constraint vendor_bid_line_quotes_bid_item_unique unique (bid_id, procurement_item_id);
