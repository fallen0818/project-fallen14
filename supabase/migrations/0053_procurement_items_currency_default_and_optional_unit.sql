-- Procurement Items form is dropping Requisition, Currency, and Unit of
-- Measure as visible fields:
--   - Requisition: stays app-editable, just from the Purchase Requisition's
--     own reverse-lookup editor instead of duplicated here. No DB change
--     needed (requisition_id was already nullable).
--   - Currency: every procurement_items row in practice is already PHP (the
--     form default, and the only value the BOM-conversion flow ever writes).
--     Give the column its own DB default so a create that no longer submits
--     this field still gets a valid, non-null value.
--   - Unit of Measure: genuinely varies per item (each/hour/licence/kg/m/
--     lot) -- there's no single correct default to hide it behind, so it
--     becomes nullable instead of defaulted. Existing rows are untouched;
--     new rows created without it just have no unit recorded until set
--     elsewhere.
alter table public.procurement_items alter column currency set default 'PHP';
alter table public.procurement_items alter column unit_of_measure drop not null;
