-- Two changes to Procurement Item status, both from the same user request
-- ("make the status dynamic, the list can not edit or delete"):
--
-- 1. The user had already used the app's own "+ Add new..." lookup-option
--    picker to add an ad-hoc "In Progress" status (no tone set, since that
--    picker only takes a bare value). Give it a proper tone here, and add
--    "Bidding" alongside it -- the other real-world stage the user named --
--    so both look and sort like first-class options instead of the leftover
--    plain-gray badge an untoned value renders as.
--
-- 2. lookup_options.is_terminal (migration 0011) has existed since the
--    original dynamic-status work but nothing ever enforced it -- any
--    status, terminal or not, could still be freely edited/deleted. That's
--    the "list can not edit or delete" ask: once an item's status is
--    terminal (Received/Cancelled -- or a future terminal option), the
--    record is done and should lock for good. EntityManager.tsx now hides
--    Edit/Delete for a locked row (see EntityConfig.lockWhenTerminal); this
--    trigger is the real enforcement underneath that UI change.

update public.lookup_options
set tone = 'info'
where list_key = 'procurement_item_status' and value = 'In Progress' and tone is null;

insert into public.lookup_options (list_key, code, value, tone, is_terminal, owner_id)
select 'procurement_item_status', 'PIST-0008', 'Bidding', 'info', false, (select owner_id from public.lookup_options limit 1)
where not exists (
  select 1 from public.lookup_options where list_key = 'procurement_item_status' and value = 'Bidding'
);

create or replace function public.prevent_terminal_procurement_item_changes()
returns trigger
language plpgsql
as $$
begin
  if exists (
    select 1 from public.lookup_options
    where id = old.status_id and is_terminal = true
  ) then
    raise exception 'This procurement item''s status is final -- it can no longer be edited or deleted.'
      using errcode = 'P0001';
  end if;
  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

create trigger trg_procurement_items_lock_terminal
  before update or delete on public.procurement_items
  for each row execute function public.prevent_terminal_procurement_item_changes();
