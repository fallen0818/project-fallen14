-- Cleanup: "Approved" was added to procurement_item_status by accident
-- (via the "+ Add new…" prompt on the Status dropdown, tone left null) --
-- it's a Requisition-approval concept (see requisition_status, which
-- already has its own "Approved"), not a Procurement Item lifecycle stage.
-- No items were using it, so it's safe to remove outright rather than just
-- leave it sitting unused in the dropdown.
delete from public.lookup_options
where list_key = 'procurement_item_status' and value = 'Approved';
