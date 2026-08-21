-- Per the user's own call: Procurement Items go back to always being
-- editable and deletable, regardless of Status -- undoes the "lock once
-- terminal" behavior added in migration 0044. Status itself stays (still a
-- normal editable dropdown, still shown as a badge); only the database
-- trigger that blocked UPDATE/DELETE once Status hit a terminal option
-- (Received/Cancelled) is removed here. Date of Bidding is dropped outright
-- (no longer wanted on this entity at all).
drop trigger if exists trg_procurement_items_lock_terminal on public.procurement_items;
drop function if exists public.prevent_terminal_procurement_item_changes();

alter table public.procurement_items
  drop column if exists bidding_date;
