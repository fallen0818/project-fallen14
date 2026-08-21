-- Retires the standalone "Vendor Bidding (RFQs)" module (vendor_biddings)
-- now that Procurement Activities models the same thing (Requisition, Mode
-- of Procurement, and now Activity/Date/Status per step) as flat top-level
-- records instead of one-RFQ-with-a-nested-schedule. Bid Evaluation now
-- anchors on a Procurement Activity instead of an RFQ.
--
-- Per the user's own call: the RFQ-only fields with no equivalent on
-- Procurement Activities (Title, Close Date, Currency, Awarded
-- Supplier/Contractor, and the Open/Under Evaluation/Awarded/Cancelled
-- status) are dropped, not carried over. The one existing test RFQ (with 3
-- bids and a 20-item checklist) is discarded rather than migrated.

delete from public.rfq_checklist_results;
delete from public.vendor_bid_line_quotes;
delete from public.rfq_document_checklist;
delete from public.vendor_bids;
delete from public.bidding_schedule_activities;
delete from public.vendor_bidding_criteria;
delete from public.vendor_biddings;

-- bidding_schedule_activities (an RFQ's own nested schedule-of-activities
-- list) is now fully superseded by Procurement Activities' own
-- Activity/Date/Status fields -- one flat record per step instead of a
-- nested line-item list. vendor_bidding_criteria (bidding_id, name, weight)
-- was unused dead schema -- no frontend ever wired it up, zero rows, and it
-- only existed to hang off vendor_biddings -- so it goes too rather than
-- leaving it pointed at nothing.
drop table public.bidding_schedule_activities;
drop table public.vendor_bidding_criteria;

-- purchase_orders.rfq_id ("Source RFQ") had zero rows using it -- dropped
-- outright rather than repointed, since Requisition (already on Purchase
-- Orders) already gives full traceability back to what was procured.
alter table public.purchase_orders drop constraint if exists purchase_orders_rfq_id_fkey;
alter table public.purchase_orders drop column if exists rfq_id;

-- Repoint vendor_bids and rfq_document_checklist from vendor_biddings to
-- procurement_activities directly -- rename bidding_id -> activity_id on
-- both so the column name matches what it actually references now. RLS
-- policies reference these columns by parsed Var, not by name, so the
-- rename alone keeps every existing owns_*() policy working unchanged.
alter table public.vendor_bids rename column bidding_id to activity_id;
alter table public.vendor_bids drop constraint vendor_bids_bidding_id_fkey;
alter table public.vendor_bids add constraint vendor_bids_activity_id_fkey
  foreign key (activity_id) references public.procurement_activities(id) on delete cascade;

alter table public.rfq_document_checklist rename column bidding_id to activity_id;
alter table public.rfq_document_checklist drop constraint rfq_document_checklist_bidding_id_fkey;
alter table public.rfq_document_checklist add constraint rfq_document_checklist_activity_id_fkey
  foreign key (activity_id) references public.procurement_activities(id) on delete cascade;

-- Consolidate: owns_rfq() and owns_vendor_bidding() were both pure
-- is_editor() pass-throughs gating what's now the same parent
-- (procurement_activities) via two differently-named, functionally
-- identical wrappers. Rename owns_rfq -> owns_procurement_activity (still
-- used by rfq_document_checklist), point vendor_bids' policies at it too,
-- and drop the now-redundant owns_vendor_bidding().
alter function public.owns_rfq(uuid) rename to owns_procurement_activity;

drop policy vb_insert on public.vendor_bids;
drop policy vb_update on public.vendor_bids;
drop policy vb_delete on public.vendor_bids;
create policy vb_insert on public.vendor_bids for insert to authenticated with check (public.owns_procurement_activity(activity_id));
create policy vb_update on public.vendor_bids for update to authenticated using (public.owns_procurement_activity(activity_id)) with check (public.owns_procurement_activity(activity_id));
create policy vb_delete on public.vendor_bids for delete to authenticated using (public.owns_procurement_activity(activity_id));

drop function public.owns_vendor_bidding(uuid);

-- Finally, the vendor_biddings table itself.
drop table public.vendor_biddings;
