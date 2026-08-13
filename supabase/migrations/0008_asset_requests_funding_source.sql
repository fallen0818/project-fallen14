alter table public.asset_requests
  add column if not exists funding_source text;

alter table public.asset_requests
  drop constraint if exists asset_requests_funding_source_check;

alter table public.asset_requests
  add constraint asset_requests_funding_source_check
  check (funding_source in ('internal-funds','bank-loan','equity','government-grant','donor-funding','lease-financing','other'));
