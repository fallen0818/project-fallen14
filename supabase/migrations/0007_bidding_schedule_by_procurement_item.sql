truncate table public.bidding_schedule_activities;

create or replace function public.owns_procurement_item(p_item_id uuid)
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from public.procurement_items i
    where i.id = p_item_id and i.owner_id = auth.uid()
  );
$$;

drop policy if exists bsa_write on public.bidding_schedule_activities;
drop index if exists idx_bsa_asset_request;

alter table public.bidding_schedule_activities drop column if exists asset_request_id;
alter table public.bidding_schedule_activities
  add column if not exists procurement_item_id uuid references public.procurement_items (id) on delete cascade;
alter table public.bidding_schedule_activities alter column procurement_item_id set not null;

create index if not exists idx_bsa_procurement_item on public.bidding_schedule_activities (procurement_item_id);

create policy bsa_write on public.bidding_schedule_activities for all to authenticated
  using (public.owns_procurement_item(procurement_item_id))
  with check (public.owns_procurement_item(procurement_item_id));
