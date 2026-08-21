-- Migration 0055: allow many BOM parts-list lines to share one Procurement
-- Item.
--
-- idx_bill_of_materials_lines_procurement_item_id (0019) enforced a strict
-- 1:1 -- each BOM line could only ever point at a Procurement Item nobody
-- else was pointing at. That matched the OLD procurement_items model, where
-- every converted line became its own distinct item.
--
-- Since migration 0038, procurement_items is one row per Asset Request, and
-- a BOM's whole parts list already shares one Asset Request. The "Generate
-- Procurement Item from Parts List" flow was fixed (app-side) to create
-- exactly one Procurement Item per BOM and link every converted line to it
-- -- which requires many lines to point at the same procurement_item_id,
-- something the old unique index rejects with a 23505 error.
--
-- Swap the unique index for a plain one: still indexed for lookups/joins,
-- just no longer enforcing a cardinality the data model no longer has.
drop index if exists public.idx_bill_of_materials_lines_procurement_item_id;

create index if not exists idx_bill_of_materials_lines_procurement_item_id
  on public.bill_of_materials_lines (procurement_item_id)
  where procurement_item_id is not null;
