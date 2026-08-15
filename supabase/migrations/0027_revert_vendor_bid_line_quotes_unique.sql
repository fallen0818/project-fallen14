-- Reverts 0026_vendor_bid_line_quotes_unique.sql. The Bid Evaluation ->
-- Procurement Items feature (per-item price quotes per bidder) was rolled
-- back, so the supporting unique constraint is no longer needed.
alter table public.vendor_bid_line_quotes
  drop constraint if exists vendor_bid_line_quotes_bid_item_unique;
