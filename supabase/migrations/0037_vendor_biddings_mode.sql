-- RFQs get the same Mode of Procurement classification as Procurement
-- Activity (migration 0036) -- reuses the same 'procurement_mode' lookup
-- list rather than seeding a second copy of the same three values.
-- Nullable: existing RFQs predate this field and an RFQ is Public Bidding
-- by default anyway, so there's nothing to force-backfill.
alter table public.vendor_biddings add column if not exists mode_id uuid references public.lookup_options(id);
create index if not exists idx_vendor_biddings_mode_id on public.vendor_biddings(mode_id);
