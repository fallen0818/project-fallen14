-- Bidding Schedule Activities (Pre-bid Conference, Opening of Bids,
-- Post-qualification, Award) were keyed to a single Procurement Item
-- (migration 0007), but the schedule is really an RFQ-level event: one
-- Opening of Bids covers every item bundled into that RFQ, not a separate
-- one per item -- same "one shared thing, not N duplicate ones" reasoning
-- that already anchors the Bid Evaluation Matrix to the RFQ rather than to
-- individual items. Re-key to vendor_biddings (bidding_id). Test data only
-- (confirmed earlier in this project) and the two existing rows aren't
-- linked to any RFQ yet (their procurement_item has no requisition line),
-- so there's nothing to carry forward -- truncate and re-key, the same
-- treatment migration 0007 already gave this exact table.
truncate table public.bidding_schedule_activities;

-- Policies were split from one bsa_write into bsa_insert/update/delete in
-- migration 0013 -- drop all three (they depend on procurement_item_id).
drop policy if exists bsa_insert on public.bidding_schedule_activities;
drop policy if exists bsa_update on public.bidding_schedule_activities;
drop policy if exists bsa_delete on public.bidding_schedule_activities;
drop policy if exists bsa_write on public.bidding_schedule_activities;
drop index if exists idx_bsa_procurement_item;

alter table public.bidding_schedule_activities drop column if exists procurement_item_id;
alter table public.bidding_schedule_activities
  add column if not exists bidding_id uuid references public.vendor_biddings (id) on delete cascade;
alter table public.bidding_schedule_activities alter column bidding_id set not null;

create index if not exists idx_bsa_bidding on public.bidding_schedule_activities (bidding_id);

-- owns_rfq() already exists (migration 0020, used by rfq_document_checklist).
create policy bsa_insert on public.bidding_schedule_activities for insert to authenticated
  with check (public.owns_rfq(bidding_id));
create policy bsa_update on public.bidding_schedule_activities for update to authenticated
  using (public.owns_rfq(bidding_id)) with check (public.owns_rfq(bidding_id));
create policy bsa_delete on public.bidding_schedule_activities for delete to authenticated
  using (public.owns_rfq(bidding_id));
