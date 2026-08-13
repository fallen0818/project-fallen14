-- 1. lookup_options table + RLS
create table if not exists public.lookup_options (
  id         uuid primary key default uuid_generate_v4(),
  list_key   text not null check (list_key ~ '^[a-z][a-z0-9_]*$'),
  code       text not null unique,
  value      text not null,
  owner_id   uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (list_key, value)
);
create index if not exists idx_lookup_options_list_key on public.lookup_options (list_key);
create index if not exists idx_lookup_options_owner on public.lookup_options (owner_id);

drop trigger if exists trg_lookup_options_updated_at on public.lookup_options;
create trigger trg_lookup_options_updated_at before update on public.lookup_options
  for each row execute function public.set_updated_at();

alter table public.lookup_options enable row level security;

drop policy if exists lookup_options_select on public.lookup_options;
create policy lookup_options_select on public.lookup_options
  for select to authenticated using (true);

drop policy if exists lookup_options_write_own on public.lookup_options;
create policy lookup_options_write_own on public.lookup_options for all to authenticated
  using (owner_id = auth.uid()) with check (owner_id = auth.uid());

-- 2. Consolidate funding_sources into lookup_options (id-preserving)
do $$
begin
  if exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'funding_sources') then
    insert into public.lookup_options (id, list_key, code, value, owner_id, created_at, updated_at)
    select id, 'funding_source', code, name, owner_id, created_at, updated_at
    from public.funding_sources
    where not exists (select 1 from public.lookup_options lo where lo.id = funding_sources.id);

    alter table public.asset_requests drop constraint if exists asset_requests_funding_source_id_fkey;
    alter table public.asset_requests
      add constraint asset_requests_funding_source_id_fkey
      foreign key (funding_source_id) references public.lookup_options (id) on delete set null;

    drop table public.funding_sources cascade;
  end if;
end $$;

-- 3. Seed asset_category and procurement_category lists
insert into public.lookup_options (list_key, code, value, owner_id)
select 'asset_category', v.code, v.value, (select id from auth.users order by created_at asc limit 1)
from (values
  ('ACAT-0001', 'IT Infrastructure'),
  ('ACAT-0002', 'Facilities'),
  ('ACAT-0003', 'Machinery & Equipment'),
  ('ACAT-0004', 'Vehicles'),
  ('ACAT-0005', 'Software'),
  ('ACAT-0006', 'Research & Development'),
  ('ACAT-0007', 'Other')
) as v(code, value)
where not exists (select 1 from public.lookup_options lo where lo.list_key = 'asset_category' and lo.value = v.value)
  and exists (select 1 from auth.users);

insert into public.lookup_options (list_key, code, value, owner_id)
select 'procurement_category', v.code, v.value, (select id from auth.users order by created_at asc limit 1)
from (values
  ('PCAT-0001', 'Goods'),
  ('PCAT-0002', 'Services'),
  ('PCAT-0003', 'Works'),
  ('PCAT-0004', 'Software License'),
  ('PCAT-0005', 'Subscription')
) as v(code, value)
where not exists (select 1 from public.lookup_options lo where lo.list_key = 'procurement_category' and lo.value = v.value)
  and exists (select 1 from auth.users);

-- 4. capex_budgets.category (text, optional) -> category_id (FK, optional)
alter table public.capex_budgets
  add column if not exists category_id uuid references public.lookup_options (id) on delete set null;

do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'capex_budgets' and column_name = 'category'
  ) then
    update public.capex_budgets b
    set category_id = lo.id
    from public.lookup_options lo
    where lo.list_key = 'asset_category'
      and b.category is not null
      and b.category_id is null
      and lo.value = case b.category
        when 'it-infrastructure' then 'IT Infrastructure'
        when 'facilities' then 'Facilities'
        when 'machinery-equipment' then 'Machinery & Equipment'
        when 'vehicles' then 'Vehicles'
        when 'software' then 'Software'
        when 'research-development' then 'Research & Development'
        when 'other' then 'Other'
      end;

    alter table public.capex_budgets drop constraint if exists capex_budgets_category_check;
    alter table public.capex_budgets drop column category;
  end if;
end $$;

create index if not exists idx_capex_budgets_category on public.capex_budgets (category_id);

-- 5. asset_requests.asset_category (text, required) -> asset_category_id (FK, required)
alter table public.asset_requests
  add column if not exists asset_category_id uuid references public.lookup_options (id) on delete restrict;

do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'asset_requests' and column_name = 'asset_category'
  ) then
    update public.asset_requests r
    set asset_category_id = lo.id
    from public.lookup_options lo
    where lo.list_key = 'asset_category'
      and r.asset_category_id is null
      and lo.value = case r.asset_category
        when 'it-infrastructure' then 'IT Infrastructure'
        when 'facilities' then 'Facilities'
        when 'machinery-equipment' then 'Machinery & Equipment'
        when 'vehicles' then 'Vehicles'
        when 'software' then 'Software'
        when 'research-development' then 'Research & Development'
        when 'other' then 'Other'
      end;

    alter table public.asset_requests drop constraint if exists asset_requests_asset_category_check;
    alter table public.asset_requests drop column asset_category;
  end if;
end $$;

alter table public.asset_requests alter column asset_category_id set not null;
create index if not exists idx_asset_requests_category on public.asset_requests (asset_category_id);

-- 6. procurement_items.category (text, required) -> category_id (FK, required)
alter table public.procurement_items
  add column if not exists category_id uuid references public.lookup_options (id) on delete restrict;

do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'procurement_items' and column_name = 'category'
  ) then
    update public.procurement_items p
    set category_id = lo.id
    from public.lookup_options lo
    where lo.list_key = 'procurement_category'
      and p.category_id is null
      and lo.value = case p.category
        when 'goods' then 'Goods'
        when 'services' then 'Services'
        when 'works' then 'Works'
        when 'software-license' then 'Software License'
        when 'subscription' then 'Subscription'
      end;

    alter table public.procurement_items drop constraint if exists procurement_items_category_check;
    alter table public.procurement_items drop column category;
  end if;
end $$;

alter table public.procurement_items alter column category_id set not null;
create index if not exists idx_proc_items_category on public.procurement_items (category_id);
