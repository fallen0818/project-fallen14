-- Adds a Date of Bidding field to Procurement Items -- manually entered, no
-- auto-sync triggers. (An earlier attempt at an auto-synced version, mirrored
-- from the linked RFQ's Issue Date across a multi-hop item -> requisition
-- line -> requisition -> RFQ chain, was interrupted by the user and then
-- fully removed in migration 0038. This is the simpler version the user
-- chose instead: a plain, hand-entered date like Order Date or Issue Date
-- elsewhere in this app.)

alter table public.procurement_items add column if not exists bidding_date date;
