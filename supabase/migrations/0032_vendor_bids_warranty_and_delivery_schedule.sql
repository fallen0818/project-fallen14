-- Bid evaluation footer needs warranty and delivery schedule per bidder,
-- alongside the existing Bid Offer / Bid Security rows, so these are read
-- during the same live bid opening rather than chased down after. Both are
-- unit-flexible (a supplier quotes "2 years" warranty, a contractor quotes
-- "45 days" delivery, another quotes "3 months") so each gets a value +
-- unit pair rather than a single fixed-unit column. The existing
-- lead_time_days column is left alone (unused by the app, not worth
-- touching) -- these are new, separate columns.
alter table public.vendor_bids
  add column if not exists warranty_value numeric(10,2) check (warranty_value >= 0),
  add column if not exists warranty_unit text check (warranty_unit in ('years', 'months')),
  add column if not exists delivery_value numeric(10,2) check (delivery_value >= 0),
  add column if not exists delivery_unit text check (delivery_unit in ('days', 'months'));
