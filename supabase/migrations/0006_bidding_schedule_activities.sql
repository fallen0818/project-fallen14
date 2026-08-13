create table if not exists public.bidding_schedule_activities (
  id                uuid primary key default uuid_generate_v4(),
  asset_request_id  uuid not null references public.asset_requests (id) on delete cascade,
  activity          text not null,
  planned_date      date not null,
  status            text not null default 'pending' check (status in ('pending','in-progress','completed','delayed','cancelled')),
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);
create index if not exists idx_bsa_asset_request on public.bidding_schedule_activities (asset_request_id);

drop trigger if exists trg_bidding_schedule_activities_updated_at on public.bidding_schedule_activities;
create trigger trg_bidding_schedule_activities_updated_at before update on public.bidding_schedule_activities
  for each row execute function public.set_updated_at();

alter table public.bidding_schedule_activities enable row level security;

drop policy if exists bidding_schedule_activities_select on public.bidding_schedule_activities;
create policy bidding_schedule_activities_select on public.bidding_schedule_activities
  for select to authenticated using (true);

drop policy if exists bsa_write on public.bidding_schedule_activities;
create policy bsa_write on public.bidding_schedule_activities for all to authenticated
  using (public.owns_asset_request(asset_request_id))
  with check (public.owns_asset_request(asset_request_id));
