-- Bill of Materials: one optional BOM per asset request, with a flat parts
-- list that can each be "converted" into a Procurement Item once approved.
-- BOM is the engineering/spec layer (what's needed, in what quantity, from
-- what part number); Procurement Items remain the buying/RFQ/PO execution
-- layer, same division of labor as bidding_schedule_activities is to
-- procurement_items' bidding schedule.

-- ---------------------------------------------------------------------------
-- Status list for the BOM header (Draft -> Submitted -> Approved -> Converted,
-- or Cancelled). Follows the existing lookup_options convention: same table
-- used app-wide, filtered by list_key, one owner (mirrors every other list
-- already in this table rather than picking a new one).
-- ---------------------------------------------------------------------------
insert into public.lookup_options (list_key, code, value, tone, is_terminal, owner_id)
values
  ('bom_status', 'BOST-0001', 'Draft', 'neutral', false, (select owner_id from public.lookup_options limit 1)),
  ('bom_status', 'BOST-0002', 'Submitted', 'info', false, (select owner_id from public.lookup_options limit 1)),
  ('bom_status', 'BOST-0003', 'Approved', 'success', false, (select owner_id from public.lookup_options limit 1)),
  ('bom_status', 'BOST-0004', 'Converted', 'success', true, (select owner_id from public.lookup_options limit 1)),
  ('bom_status', 'BOST-0005', 'Cancelled', 'error', true, (select owner_id from public.lookup_options limit 1));

-- ---------------------------------------------------------------------------
-- bill_of_materials: the header. asset_request_id is unique -- an asset
-- request has at most one BOM (not required to have one at all). Deleting
-- the asset request takes its BOM with it (owned child, same as every other
-- capex_request_id/asset_request_id child table in this schema).
-- ---------------------------------------------------------------------------
create table public.bill_of_materials (
  id uuid primary key default uuid_generate_v4(),
  code text not null unique,
  asset_request_id uuid not null unique references public.asset_requests(id) on delete cascade,
  title text not null,
  status_id uuid not null references public.lookup_options(id),
  prepared_by text,
  notes text,
  owner_id uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint bill_of_materials_code_check check (code ~ '^BOM-[0-9]{6}$')
);

create index idx_bill_of_materials_asset_request_id on public.bill_of_materials(asset_request_id);
create index idx_bill_of_materials_status_id on public.bill_of_materials(status_id);
create index idx_bill_of_materials_owner_id on public.bill_of_materials(owner_id);

alter table public.bill_of_materials enable row level security;

-- Same shape as asset_requests/procurement_items: open read, owner-scoped write.
create policy bill_of_materials_select on public.bill_of_materials
  for select to authenticated using (true);
create policy bill_of_materials_insert on public.bill_of_materials
  for insert to authenticated with check (owner_id = (select auth.uid()));
create policy bill_of_materials_update on public.bill_of_materials
  for update to authenticated using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));
create policy bill_of_materials_delete on public.bill_of_materials
  for delete to authenticated using (owner_id = (select auth.uid()));

create trigger trg_bill_of_materials_updated_at
  before update on public.bill_of_materials
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- bill_of_materials_lines: the flat parts list. Deliberately no
-- preferred_vendor_id/preferred_contractor_id here -- that choice belongs to
-- the generated Procurement Item, not the engineering spec. quantity/cost
-- checks and estimated_total_cost mirror procurement_items exactly.
-- procurement_item_id links a line to the Procurement Item generated from
-- it (nullable -- unset until converted); the partial unique index stops the
-- same Procurement Item from ever being claimed by two lines.
-- ---------------------------------------------------------------------------
create table public.bill_of_materials_lines (
  id uuid primary key default uuid_generate_v4(),
  bom_id uuid not null references public.bill_of_materials(id) on delete cascade,
  part_name text not null,
  part_number text,
  category_id uuid references public.lookup_options(id),
  quantity numeric not null,
  unit_of_measure text not null,
  estimated_unit_cost numeric,
  estimated_total_cost numeric generated always as (quantity * estimated_unit_cost) stored,
  procurement_item_id uuid references public.procurement_items(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint bill_of_materials_lines_quantity_check check (quantity > 0),
  constraint bill_of_materials_lines_cost_check check (estimated_unit_cost is null or estimated_unit_cost >= 0)
);

create index idx_bill_of_materials_lines_bom_id on public.bill_of_materials_lines(bom_id);
create index idx_bill_of_materials_lines_category_id on public.bill_of_materials_lines(category_id);
create unique index idx_bill_of_materials_lines_procurement_item_id
  on public.bill_of_materials_lines(procurement_item_id) where procurement_item_id is not null;

alter table public.bill_of_materials_lines enable row level security;

-- Same pattern as owns_procurement_item(): a line's writability follows its
-- parent BOM's ownership, not a column on the line itself.
create or replace function public.owns_bom(p_bom_id uuid)
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from public.bill_of_materials b
    where b.id = p_bom_id and b.owner_id = auth.uid()
  );
$$;

create policy bill_of_materials_lines_select on public.bill_of_materials_lines
  for select to authenticated using (true);
create policy bill_of_materials_lines_insert on public.bill_of_materials_lines
  for insert to authenticated with check (public.owns_bom(bom_id));
create policy bill_of_materials_lines_update on public.bill_of_materials_lines
  for update to authenticated using (public.owns_bom(bom_id)) with check (public.owns_bom(bom_id));
create policy bill_of_materials_lines_delete on public.bill_of_materials_lines
  for delete to authenticated using (public.owns_bom(bom_id));

create trigger trg_bill_of_materials_lines_updated_at
  before update on public.bill_of_materials_lines
  for each row execute function public.set_updated_at();
