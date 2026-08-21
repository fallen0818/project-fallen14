-- Reconnects Procurement Items to Purchase Requisitions -- the previous
-- link (purchase_requisition_lines, a multi-item list living on the
-- Requisition) was dropped by the user's own call in migration 0046. This
-- rebuilds the relationship from the other side instead: one Procurement
-- Item now carries a single "Requisition" foreign key of its own, picked
-- from its own form, rather than a Requisition owning a list of items.
--
-- Nullable and ON DELETE SET NULL (not RESTRICT/CASCADE): a Procurement
-- Item can exist before it's tied to a Requisition, and deleting a
-- Requisition should never destroy or block-delete the items that were
-- linked to it -- it just unlinks them, same spirit as Bidding Date and
-- other optional planning fields on this table.
alter table public.procurement_items
  add column requisition_id uuid references public.purchase_requisitions(id) on delete set null;

create index idx_procurement_items_requisition_id on public.procurement_items(requisition_id);
