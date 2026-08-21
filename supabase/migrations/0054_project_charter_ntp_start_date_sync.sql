-- Wires Project Charters to Procurement: a Charter can now reference the
-- Purchase Order that triggers it, and its start_date auto-follows that
-- PO's Notice to Proceed date -- same "trigger-maintained cross-table
-- cascade" shape as the BOM -> Asset Request cost sync (migration 0034) and
-- the Milestones -> Project Charter progress sync (migration 0022).
--
-- purchase_order_id is nullable and on delete set null: a Charter can exist
-- before procurement even starts (early planning), and deleting a PO
-- shouldn't take a Charter down with it -- it just unlinks.
--
-- Sync direction is one-way, PO -> Charter, in both directions of *when* it
-- can fire:
--   1. Linking a Charter to a PO that already has an NTP date pulls it in
--      immediately (BEFORE INSERT/UPDATE trigger on project_charters).
--   2. A linked PO's NTP date being set/changed later pushes it to every
--      Charter that references it (AFTER UPDATE trigger on purchase_orders,
--      security definer so it isn't blocked by a Charter's own owner-scoped
--      RLS -- same reasoning as recompute_project_progress() in 0022).
-- start_date stays a normal editable field otherwise (not readOnly) --
-- unlike estimated_total_cost-style auto-copies, a Charter's start date is
-- meaningful on its own before any PO is linked, so the form doesn't lock
-- it, the sync just keeps it current once a link + NTP date exist.

alter table public.project_charters
  add column purchase_order_id uuid references public.purchase_orders(id) on delete set null;

create index idx_project_charters_purchase_order on public.project_charters(purchase_order_id);

-- (1) Charter links to a PO (or is created already linked): pull that PO's
-- current NTP date into start_date right away, if it has one.
create or replace function public.sync_charter_start_from_linked_po()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  po_ntp date;
begin
  if new.purchase_order_id is not null
     and (tg_op = 'INSERT' or new.purchase_order_id is distinct from old.purchase_order_id) then
    select ntp_date into po_ntp from public.purchase_orders where id = new.purchase_order_id;
    if po_ntp is not null then
      new.start_date := po_ntp;
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_sync_charter_start_from_linked_po on public.project_charters;
create trigger trg_sync_charter_start_from_linked_po
  before insert or update of purchase_order_id on public.project_charters
  for each row
  execute function public.sync_charter_start_from_linked_po();

-- (2) A linked PO's NTP date is set or changes later: push it to every
-- Charter still referencing that PO.
create or replace function public.sync_charter_start_from_po_ntp()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.ntp_date is not null and new.ntp_date is distinct from old.ntp_date then
    update public.project_charters
    set start_date = new.ntp_date,
        updated_at = now()
    where purchase_order_id = new.id;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_sync_charter_start_from_po_ntp on public.purchase_orders;
create trigger trg_sync_charter_start_from_po_ntp
  after update of ntp_date on public.purchase_orders
  for each row
  execute function public.sync_charter_start_from_po_ntp();
