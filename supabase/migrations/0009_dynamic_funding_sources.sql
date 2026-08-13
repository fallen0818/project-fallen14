create table if not exists public.funding_sources (
  id         uuid primary key default uuid_generate_v4(),
  code       text not null unique check (code ~ '^FSRC-[0-9]{4}$'),
  name       text not null unique,
  owner_id   uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_funding_sources_owner on public.funding_sources (owner_id);

drop trigger if exists trg_funding_sources_updated_at on public.funding_sources;
create trigger trg_funding_sources_updated_at before update on public.funding_sources
  for each row execute function public.set_updated_at();

alter table public.funding_sources enable row level security;

drop policy if exists funding_sources_select on public.funding_sources;
create policy funding_sources_select on public.funding_sources
  for select to authenticated using (true);

drop policy if exists funding_sources_write_own on public.funding_sources;
create policy funding_sources_write_own on public.funding_sources for all to authenticated
  using (owner_id = auth.uid()) with check (owner_id = auth.uid());

insert into public.funding_sources (code, name, owner_id)
select v.code, v.name, (select id from auth.users order by created_at asc limit 1)
from (values
  ('FSRC-0001', 'Internal Funds'),
  ('FSRC-0002', 'Bank Loan'),
  ('FSRC-0003', 'Equity'),
  ('FSRC-0004', 'Government Grant'),
  ('FSRC-0005', 'Donor Funding'),
  ('FSRC-0006', 'Lease Financing'),
  ('FSRC-0007', 'Other')
) as v(code, name)
where not exists (select 1 from public.funding_sources f where f.name = v.name)
  and exists (select 1 from auth.users);

alter table public.asset_requests
  add column if not exists funding_source_id uuid references public.funding_sources (id) on delete set null;

do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'asset_requests' and column_name = 'funding_source'
  ) then
    update public.asset_requests r
    set funding_source_id = fs.id
    from public.funding_sources fs
    where r.funding_source is not null
      and r.funding_source_id is null
      and fs.name = case r.funding_source
        when 'internal-funds' then 'Internal Funds'
        when 'bank-loan' then 'Bank Loan'
        when 'equity' then 'Equity'
        when 'government-grant' then 'Government Grant'
        when 'donor-funding' then 'Donor Funding'
        when 'lease-financing' then 'Lease Financing'
        when 'other' then 'Other'
      end;

    alter table public.asset_requests drop constraint if exists asset_requests_funding_source_check;
    alter table public.asset_requests drop column funding_source;
  end if;
end $$;

create index if not exists idx_asset_requests_funding_source on public.asset_requests (funding_source_id);
