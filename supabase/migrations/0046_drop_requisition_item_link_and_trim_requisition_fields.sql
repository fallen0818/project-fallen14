-- Per the user's explicit call: Purchase Requisitions and Procurement Items
-- stop being linked. Requisitions become a simpler administrative record
-- (Requested By, Department, Dates, Status, Approved By) with no line-item
-- list of which items it covers, and Title/Estimated Total/Currency are
-- dropped from the record entirely.
--
-- purchase_requisition_lines was the only place that link lived (added a
-- frontend this session, migration 0043-era) -- dropping it takes
-- vendor_bid_line_quotes (Bid Evaluation's per-item pricing, which only ever
-- read its item list *through* those lines) down with it, since without the
-- link there's no well-defined set of items for a bid's line-by-line pricing
-- to price against anymore. Both tables were empty at the time of this
-- migration -- nothing to migrate out first.
drop table if exists public.vendor_bid_line_quotes;
drop table if exists public.purchase_requisition_lines;

-- Orphaned by the drops above.
drop function if exists public.cleanup_orphaned_bid_line_quotes();
drop function if exists public.owns_purchase_requisition(uuid);

alter table public.purchase_requisitions
  drop column if exists title,
  drop column if exists estimated_total,
  drop column if exists currency;
